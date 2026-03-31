/**
 * Express Server Entry Point.
 * This script initializes the backend API, defines RESTful routes for video management,
 * and starts the background polling process for the transcoding queue.
 */

import express, { Request, Response } from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import { postgresService } from "./services/postgres.services";
import { s3Service } from "./services/s3.services";
import { sqsService } from "./services/sqs.services";
import { dockerService } from "./services/docker.services";
import { ecsService } from "./services/ecs.services";
import logger from "./logger/winston.logger";
import { PORT, S3_BUCKET_NAME, AWS_REGION, NODE_ENV } from "./envs";

// Initialize the Express application instance.
const app = express();
// The TCP port the server as configured in the environment.
const port = PORT;

/**
 * Helper utility to construct a public S3 URL for consistent playback and asset links.
 * @param key - The unique S3 object key.
 * @returns A fully qualified URL string or null.
 */
const getPublicUrl = (key: string | null) => {
  if (!key) return null;
  // Standard AWS S3 public URL format.
  return `https://${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`;
};

// --- MIDDLEWARE CONFIGURATION ---
// Enable Cross-Origin Resource Sharing to allow the web frontend to communicate with the API.
app.use(cors()); 
// Automatically parse incoming request bodies as JSON objects.
app.use(express.json()); 

// --- API ROUTE DEFINITIONS ---

/**
 * Health Check / Root Endpoint.
 * Used to verify the server is online and operational.
 */
app.get("/", (req, res) => {
  res.json({ message: "Video Transcoding API is running!" });
});

/**
 * GET /videos
 * Retrieves a list of all video records from the database, sorted by most recent first.
 * Enriches the database records with processed HLS and subtitle URLs for the frontend.
 */
app.get("/videos", async (req, res) => {
  try {
    // Query the database for the full library of video tasks.
    const result = await postgresService.query("SELECT * FROM videos ORDER BY created_at DESC");
    
    // Transform each database row into an enriched API object with correct public URLs.
    const videos = result.rows.map((v) => {
      // Check if the transcoding process is finished to determine if final assets are available.
      const isCompleted = v.status === 'COMPLETED';
      return {
        ...v,
        video_url: getPublicUrl(v.url), // The URL to the original source video.
        m3u8_url: isCompleted ? getPublicUrl(`${v.id}/transcoded/master.m3u8`) : null, // The HLS entry point.
        subtitles_url: isCompleted ? getPublicUrl(`${v.id}/subtitles.vtt`) : null // AI-generated captions.
      };
    });
    
    // Return the enriched list to the requester.
    res.json(videos);
  } catch (error) {
    // Log the database error and return a generic 500 status.
    logger.error("Error fetching videos:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * GET /videos/upload-url
 * Generates a pre-signed S3 URL. This allows the client (browser) to upload 
 * large video files directly to S3 without passing through our server.
 */
app.get("/videos/upload-url", async (req, res) => {
  const { fileName, contentType } = req.query;

  // Validate that the request contains the necessary metadata for the upload.
  if (!fileName || !contentType) {
    return res.status(400).json({ error: "Missing required query params: fileName, contentType" });
  }

  try {
    // Create a unique identifier for this specific upload session.
    const uploadId = uuidv4();
    // Request a secure, temporary upload URL from the S3 service.
    const { url, key } = await s3Service.getPreSignedUploadUrl(uploadId, fileName as string, contentType as string);

    // Provide the URL and the target S3 key back to the frontend.
    res.json({ uploadUrl: url, key });
  } catch (error) {
    logger.error("Error generating pre-signed URL:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * GET /videos/:id
 * Retrieves the state and asset links for a single specific video.
 */
app.get("/videos/:id", async (req, res) => {
  const { id } = req.params;
  try {
    // Fetch the single video record by its unique ID.
    const result = await postgresService.query("SELECT * FROM videos WHERE id = $1", [id]);
    
    // If no record is found, return a 404.
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Video not found" });
    }

    const v = result.rows[0];
    const isCompleted = v.status === 'COMPLETED';
    
    // Construct relevant data fields optimized for the HLS video player.
    res.json({
      id: v.id,
      title: v.title,
      status: v.status.toLowerCase(),
      video_url: getPublicUrl(v.url),
      m3u8_url: isCompleted ? getPublicUrl(`${v.id}/transcoded/master.m3u8`) : null,
      thumbnail_url: isCompleted ? getPublicUrl(`${v.id}/thumbnail.jpg`) : null,
      subtitles_url: isCompleted ? getPublicUrl(`${v.id}/subtitles.vtt`) : null,
      previews_url: isCompleted ? getPublicUrl(`${v.id}/previews/preview`) : null, // Base path for frame previews.
    });
  } catch (error) {
    logger.error("Error fetching video detail:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * POST /videos
 * Creates a new video record in the system.
 * This is the first step in the transcoding lifecycle.
 */
app.post("/videos", async (req, res) => {
  const { title, fileName, contentType, key: providedKey } = req.body;

  // Ensure all metadata is present.
  if (!title || !fileName || !contentType) {
    return res.status(400).json({ error: "Missing required fields: title, fileName, contentType" });
  }

  try {
    let finalKey = providedKey;
    let uploadUrl = null;
    let videoId = null;

    if (!finalKey) {
      // LEGACY FLOW: The server generates the key and URL after creating the DB record.
      const query = "INSERT INTO videos (title, url) VALUES ($1, $2) RETURNING id";
      const tempUrl = `pending/${fileName}`;
      const result = await postgresService.query(query, [title, tempUrl]);
      videoId = result.rows[0].id;

      // Request a pre-signed URL specifically tied to this video record ID.
      const { url, key } = await s3Service.getPreSignedUploadUrl(videoId, fileName, contentType);
      finalKey = key;
      uploadUrl = url;

      // Update the record with the finalized S3 path.
      await postgresService.query("UPDATE videos SET url = $1 WHERE id = $2", [finalKey, videoId]);
    } else {
      // MODERN OPTIMISTIC FLOW: The file was already uploaded or the key was pre-negotiated.
      const query = "INSERT INTO videos (title, url) VALUES ($1, $2) RETURNING id";
      const result = await postgresService.query(query, [title, finalKey]);
      videoId = result.rows[0].id;
    }

    // Return the system's internal videoId and the upload conduit.
    res.json({ 
      videoId, 
      uploadUrl,
      key: finalKey
    });
  } catch (error) {
    logger.error("Error creating video record:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * DELETE /videos/:id
 * Removes a video entirely from the system.
 * Performs a global cleanup: Stops active compute tasks, purges S3 storage, and clears DB records.
 */
app.delete("/videos/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Verify existence to ensure we are deleting valid resources.
    const checkResult = await postgresService.query("SELECT * FROM videos WHERE id = $1", [id]);
    if (checkResult.rowCount === 0) {
      return res.status(404).json({ error: "Video not found" });
    }

    const v = checkResult.rows[0];
    const externalId = v.external_id; // The ID of the Docker container or ECS Task.

    // 2. Kill the active transcoding task immediately to stop resource consumption.
    if (externalId) {
      if (NODE_ENV === "development" || externalId.startsWith("transcoder-")) {
        // Stop the local Docker container instance.
        await dockerService.stopTask(id);
      } else {
        // Direct the AWS ECS service to terminate the task.
        await ecsService.stopTask(externalId);
      }
    }

    // 3. Purge all stored assets (master playlist, segments, thumbs) from S3.
    await s3Service.deleteFolder(`${id}/`);

    // 4. Finally, remove the record from our primary database.
    await postgresService.query("DELETE FROM videos WHERE id = $1", [id]);

    logger.info(`🔥 Successfully purged video and resources: ${id}`);
    res.json({ message: "Video and associated resources deleted successfully" });
  } catch (error) {
    logger.error("Error deleting video:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * POST /videos/:id/start
 * Finalizes the upload phase and triggers the asynchronous transcoding process via SQS.
 */
app.post("/videos/:id/start", async (req, res) => {
  const { id } = req.params;

  try {
    // Ensure the video metadata exists.
    const checkResult = await postgresService.query("SELECT * FROM videos WHERE id = $1", [id]);
    if (checkResult.rowCount === 0) {
      return res.status(404).json({ error: "Video not found" });
    }

    const video = checkResult.rows[0];

    // 1. Update status to 'QUEUED' so the UI reflects that the job is pending.
    await postgresService.query("UPDATE videos SET status = 'QUEUED' WHERE id = $1", [id]);

    // 2. Transmit the job payload to the SQS queue.
    // The background worker (transcoding-container) will pick this up for processing.
    await sqsService.sendMessage({
      videoId: id,
      videoUrl: video.url,
      title: video.title
    });

    res.json({ message: "Transcoding job queued successfully", videoId: id });
  } catch (error) {
    logger.error("Error starting transcoding job:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Start the Express server on the designated port.
app.listen(port, () => {
  logger.info(`Server is running at http://localhost:${port}`);
  
  // Activate the background SQS listener to process incoming transcoding jobs.
  sqsService.startPolling();
});

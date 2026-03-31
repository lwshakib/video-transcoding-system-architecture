import express, { Request, Response } from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import { postgresService } from "./services/postgres.services";
import { s3Service } from "./services/s3.services";
import { sqsService } from "./services/sqs.services";
import logger from "./logger/winston.logger";
import { PORT, S3_BUCKET_NAME, AWS_REGION } from "./envs";

const app = express();
const port = PORT;

/**
 * Helper to construct the public S3 URL for a given key.
 */
const getPublicUrl = (key: string | null) => {
  if (!key) return null;
  return `https://${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`;
};

// --- MIDDLEWARE ---
app.use(cors()); // Enable CORS for the web application
app.use(express.json()); // Parse JSON bodies

// --- ROUTES ---

/**
 * Health Check / Root
 */
app.get("/", (req, res) => {
  res.json({ message: "Video Transcoding API is running!" });
});

/**
 * GET /videos
 * Purpose: Retrieves all video transcoding jobs.
 */
app.get("/videos", async (req, res) => {
  try {
    const result = await postgresService.query("SELECT * FROM videos ORDER BY created_at DESC");
    const videos = result.rows.map((v) => ({
      ...v,
      url: getPublicUrl(v.url),
      m3u8_url: getPublicUrl(v.m3u8_url),
      subtitles_url: getPublicUrl(v.subtitles_url)
    }));
    res.json(videos);
  } catch (error) {
    logger.error("Error fetching videos:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * GET /videos/upload-url
 * Purpose: Generates a pre-signed S3 URL for a client to upload a video file 
 * before creating a database record.
 */
app.get("/videos/upload-url", async (req, res) => {
  const { fileName, contentType } = req.query;

  if (!fileName || !contentType) {
    return res.status(400).json({ error: "Missing required query params: fileName, contentType" });
  }

  try {
    const uploadId = uuidv4();
    const { url, key } = await s3Service.getPreSignedUploadUrl(uploadId, fileName as string, contentType as string);

    res.json({ uploadUrl: url, key });
  } catch (error) {
    logger.error("Error generating pre-signed URL:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * GET /videos/:id
 * Purpose: Retrieves a specific video's status and constructed playback URLs.
 */
app.get("/videos/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await postgresService.query("SELECT * FROM videos WHERE id = $1", [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Video not found" });
    }

    const v = result.rows[0];
    
    // Construct relevant data for the HLS player
    res.json({
      id: v.id,
      title: v.title,
      status: v.status.toLowerCase(),
      masterPlaylist: getPublicUrl(v.m3u8_url),
      thumbnail: getPublicUrl(`videos/${v.id}/transcoded/thumbnail.jpg`),
      subtitles: getPublicUrl(v.subtitles_url),
      previewPrefix: getPublicUrl(`videos/${v.id}/transcoded/previews/preview`), // preview1, preview2, etc.
    });
  } catch (error) {
    logger.error("Error fetching video detail:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * POST /videos
 * Purpose: Initializes a new video transcoding job.
 * 1. Creates a record in the 'videos' table.
 * 2. Generates a pre-signed S3 URL for the browser to upload the file.
 */
app.post("/videos", async (req, res) => {
  const { title, fileName, contentType, key: providedKey } = req.body;

  if (!title || !fileName || !contentType) {
    return res.status(400).json({ error: "Missing required fields: title, fileName, contentType" });
  }

  try {
    // 1. Determine the S3 key
    let finalKey = providedKey;
    let uploadUrl = null;
    let videoId = null;

    if (!finalKey) {
      // Legacy flow: create record first, then get URL
      const query = "INSERT INTO videos (title, url) VALUES ($1, $2) RETURNING id";
      const tempUrl = `pending/${fileName}`;
      const result = await postgresService.query(query, [title, tempUrl]);
      videoId = result.rows[0].id;

      const { url, key } = await s3Service.getPreSignedUploadUrl(videoId, fileName, contentType);
      finalKey = key;
      uploadUrl = url;

      await postgresService.query("UPDATE videos SET url = $1 WHERE id = $2", [finalKey, videoId]);
    } else {
      // New flow: file already uploaded or URL already generated
      const query = "INSERT INTO videos (title, url) VALUES ($1, $2) RETURNING id";
      const result = await postgresService.query(query, [title, finalKey]);
      videoId = result.rows[0].id;
    }

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
 * Purpose: Removes a video from the library, including all S3 objects and the DB record.
 */
app.delete("/videos/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Check if the video exists to avoid unnecessary S3 calls
    const checkResult = await postgresService.query("SELECT * FROM videos WHERE id = $1", [id]);
    if (checkResult.rowCount === 0) {
      return res.status(404).json({ error: "Video not found" });
    }

    // 2. Delete all files in S3 under the video's directory: 'videos/{id}/'
    await s3Service.deleteFolder(`videos/${id}/`);

    // 3. Remove the record from the database
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
 * Purpose: Signals that the video has been uploaded to S3 and is ready for transcoding.
 */
app.post("/videos/:id/start", async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Check if the video exists
    const checkResult = await postgresService.query("SELECT * FROM videos WHERE id = $1", [id]);
    if (checkResult.rowCount === 0) {
      return res.status(404).json({ error: "Video not found" });
    }

    const video = checkResult.rows[0];

    // 2. Update status to QUEUED
    await postgresService.query("UPDATE videos SET status = 'QUEUED' WHERE id = $1", [id]);

    // 3. Push job to SQS
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

app.listen(port, () => {
  logger.info(`Server is running at http://localhost:${port}`);
  
  // Start polling SQS for transcoding jobs in the background
  sqsService.startPolling();
});

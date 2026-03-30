import express, { Request, Response } from "express";
import cors from "cors";
import { postgresService } from "./services/postgres.services";
import { s3Service } from "./services/s3.services";
import { sqsService } from "./services/sqs.services";
import logger from "./logger/winston.logger";
import { PORT } from "./envs";

const app = express();
const port = PORT;

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
 * POST /videos
 * Purpose: Initializes a new video transcoding job.
 * 1. Creates a record in the 'videos' table.
 * 2. Generates a pre-signed S3 URL for the browser to upload the file.
 */
app.post("/videos", async (req, res) => {
  const { title, fileName, contentType } = req.body;

  if (!title || !fileName || !contentType) {
    return res.status(400).json({ error: "Missing required fields: title, fileName, contentType" });
  }

  try {
    // 1. Create a record in the database
    const query = "INSERT INTO videos (title, url) VALUES ($1, $2) RETURNING id";
    const tempUrl = `pending/${fileName}`; // Placeholder until upload
    const result = await postgresService.query(query, [title, tempUrl]);
    const videoId = result.rows[0].id;

    // 2. Generate a pre-signed S3 URL for direct upload
    const { url, key } = await s3Service.getPreSignedUploadUrl(videoId, fileName, contentType);

    // 3. Update the DB with the final S3 key path
    await postgresService.query("UPDATE videos SET url = $1 WHERE id = $2", [key, videoId]);

    res.json({ 
      videoId, 
      uploadUrl: url,
      key
    });
  } catch (error) {
    logger.error("Error creating video record:", error);
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
});

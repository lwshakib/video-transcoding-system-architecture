/**
 * S3 Service.
 * This module handles all interactions with AWS S3, providing high-level abstractions
 * for downloading source videos and uploading processed HLS segments, thumbnails, and captions.
 */

import { 
  S3Client, 
  GetObjectCommand 
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import fs from "fs";
import { pipeline } from "stream/promises";
import logger from "../logger/winston.logger";
import { 
  AWS_REGION, 
  AWS_ACCESS_KEY_ID, 
  AWS_SECRET_ACCESS_KEY, 
  S3_BUCKET_NAME 
} from "../envs";

class S3Service {
  // The official AWS SDK V3 Client for direct S3 operations.
  private client: S3Client;
  // The name of the S3 bucket where all assets are stored.
  private bucketName: string;

  constructor() {
    // Initialize the S3 client with the region and credentials loaded from environment variables.
    this.client = new S3Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    });
    this.bucketName = S3_BUCKET_NAME;
  }

  /**
   * Downloads a single object from S3 to a specified local file path.
   * This is used to pull the high-resolution source video for processing.
   * @param key - The unique S3 object key (path).
   * @param localPath - The destination file path on the container's disk.
   */
  async downloadObject(key: string, localPath: string): Promise<void> {
    logger.info(`⬇️ Downloading ${key} from S3...`);
    
    // Prepare the command to fetch the object.
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      // Execute the command and wait for the response header.
      const response = await this.client.send(command);
      
      // Ensure the object actually contains data before proceeding.
      if (!response.Body) {
        throw new Error("S3 object body is empty.");
      }
      
      // Create a write stream to the local file system.
      const fileStream = fs.createWriteStream(localPath);
      
      // Efficiently pipe the AWS stream directly to the file stream.
      // This is memory-efficient as it doesn't load the entire file into RAM at once.
      // @ts-ignore - pipeline support for response.Body in V3 can be finicky in TS.
      await pipeline(response.Body, fileStream);
      
      logger.info(`✅ Successfully downloaded ${key} to ${localPath}`);
    } catch (error) {
      // Log failure and re-throw to be caught by the main worker loop.
      logger.error(`❌ Failed to download ${key} from S3:`, error);
      throw error;
    }
  }

  /**
   * Uploads a local file to S3.
   * Uses the AWS Lib Storage 'Upload' manager for enhanced stability with large files.
   * @param key - The destination path within the S3 bucket.
   * @param localPath - The source file path on the local disk.
   * @param contentType - Optional Mime Type to set on the S3 metadata (e.g., 'video/MP2T').
   */
  async uploadObject(key: string, localPath: string, contentType?: string): Promise<void> {
    logger.info(`⬆️ Uploading ${localPath} to ${key}...`);
    
    try {
      // Read the file as a buffer to ensure it's fully ready for the upload manager.
      // For extremely large files, a ReadStream would be preferred to buffer reading.
      const fileBuffer = fs.readFileSync(localPath);
      
      // Initialize the specialized Upload manager.
      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.bucketName,
          Key: key,
          Body: fileBuffer,
          ContentType: contentType, // Sets the Content-Type header so browsers render the file correctly.
        },
        // Config for stability: ensures we don't overwhelm the network interface.
        queueSize: 1, // Number of concurrent parts to upload.
        partSize: 5 * 1024 * 1024, // Break files into 5MB chunks.
        leavePartsOnError: false, // Automatically clean up failed multi-part uploads.
      });

      // Monitor the upload progress and log completions.
      upload.on("httpUploadProgress", (progress: any) => {
        if (progress.loaded && progress.total) {
          const percent = Math.round((progress.loaded / progress.total) * 100);
          // Only log at 100% to keep logs clean while providing confirmation.
          if (percent === 100) logger.info(`⬆️ Uploading ${key}: ${percent}%`);
        }
      });

      // Wait for the entire upload operation to complete.
      await upload.done();
      logger.info(`✅ Successfully uploaded ${key} to S3.`);
    } catch (error) {
      // Log failure and re-throw.
      logger.error(`❌ Failed to upload ${key} from S3:`, error);
      throw error;
    }
  }
}

// Export a singleton instance for use throughout the worker.
export const s3Service = new S3Service();
export default s3Service;

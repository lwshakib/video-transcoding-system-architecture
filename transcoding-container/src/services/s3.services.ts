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
  private client: S3Client;
  private bucketName: string;

  constructor() {
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
   * Downloads a single object from S3 to a local file path
   * @param key S3 object key
   * @param localPath Destination local path
   */
  async downloadObject(key: string, localPath: string): Promise<void> {
    logger.info(`⬇️ Downloading ${key} from S3...`);
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      const response = await this.client.send(command);
      if (!response.Body) {
        throw new Error("S3 object body is empty.");
      }
      
      const fileStream = fs.createWriteStream(localPath);
      // NodeJS streams handle AWS SDK V3 streams perfectly via stream/promises
      // @ts-ignore
      await pipeline(response.Body, fileStream);
      logger.info(`✅ Successfully downloaded ${key} to ${localPath}`);
    } catch (error) {
      logger.error(`❌ Failed to download ${key} from S3:`, error);
      throw error;
    }
  }

  /**
   * Uploads a local file to S3
   * @param key Destination S3 key
   * @param localPath Source local file path
   * @param contentType Optional mime type wrapper for S3 metadata
   */
  async uploadObject(key: string, localPath: string, contentType?: string): Promise<void> {
    logger.info(`⬆️ Uploading ${localPath} to ${key}...`);
    
    try {
      // Use readFileSync to ensure we have a stable buffer to pass to the Upload manager
      const fileBuffer = fs.readFileSync(localPath);
      
      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.bucketName,
          Key: key,
          Body: fileBuffer,
          ContentType: contentType,
        },
        // Configuration for stability in container environments
        queueSize: 1,
        partSize: 5 * 1024 * 1024,
        leavePartsOnError: false,
      });

      // Optional: Monitor upload progress
      upload.on("httpUploadProgress", (progress: any) => {
        if (progress.loaded && progress.total) {
          const percent = Math.round((progress.loaded / progress.total) * 100);
          if (percent % 100 === 0) logger.info(`⬆️ Uploading ${key}: ${percent}%`);
        }
      });

      await upload.done();
      logger.info(`✅ Successfully uploaded ${key} to S3.`);
    } catch (error) {
      logger.error(`❌ Failed to upload ${key} to S3:`, error);
      throw error;
    }
  }
}

export const s3Service = new S3Service();
export default s3Service;

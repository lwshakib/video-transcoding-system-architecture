/**
 * AWS S3 Service.
 * This service manages the storage bucket where build artifacts (static files) 
 * are stored. It handles listing, deleting, and bucket-level configuration.
 */

import { 
  S3Client, 
  ListObjectsV2Command, 
  DeleteObjectsCommand, 
  HeadBucketCommand, 
  CreateBucketCommand, 
  PutPublicAccessBlockCommand, 
  PutBucketPolicyCommand, 
  DeleteBucketCommand,
  CreateBucketCommandInput,
  PutObjectCommand, 
  GetObjectCommand,
  PutBucketCorsCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AWS_ACCESS_KEY_ID, AWS_REGION, AWS_SECRET_ACCESS_KEY, S3_BUCKET_NAME } from "../envs";
import logger from "../logger/winston.logger";

class S3Service {
  // Shared S3 Client
  private client: S3Client;
  private bucketName: string;

  /**
   * Initializes the S3 client with infrastructure credentials.
   */
  constructor() {
    this.bucketName = S3_BUCKET_NAME;
    this.client = new S3Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    });
  }

  /**
   * Lists objects in the bucket, optionally filtered by a prefix (e.g., project/deployment path).
   * @param prefix - The folder path to list files from
   */
  async listObjects(prefix?: string) {
    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: prefix,
    });
    return await this.client.send(command);
  }

  /**
   * Bulk deletes a list of objects from the bucket.
   * @param keys - Array of S3 object keys to remove
   */
  async deleteObjects(keys: string[]) {
    // Return early if there's nothing to delete to avoid AWS API errors
    if (keys.length === 0) return;
    const command = new DeleteObjectsCommand({
      Bucket: this.bucketName,
      Delete: {
        Objects: keys.map((key) => ({ Key: key })),
      },
    });
    return await this.client.send(command);
  }

  /**
   * Checks if the configured bucket exists and the server has access to it.
   */
  async headBucket() {
    const command = new HeadBucketCommand({ Bucket: this.bucketName });
    return await this.client.send(command);
  }

  /**
   * Creates the S3 bucket if it doesn't exist (used during infrastructure setup).
   * @param region - AWS region where the bucket should be located
   */
  async createBucket(region: string) {
    const createParams: CreateBucketCommandInput = {
      Bucket: this.bucketName,
    };
    
    // us-east-1 is the default and shouldn't have a LocationConstraint
    if (region !== 'us-east-1') {
      createParams.CreateBucketConfiguration = {
        LocationConstraint: region as any,
      };
    }
    const command = new CreateBucketCommand(createParams);
    return await this.client.send(command);
  }

  /**
   * Configures Public Access Block settings for the bucket.
   */
  async putPublicAccessBlock(config: any) {
    const command = new PutPublicAccessBlockCommand({
      Bucket: this.bucketName,
      PublicAccessBlockConfiguration: config,
    });
    return await this.client.send(command);
  }

  /**
   * Attaches a JSON bucket policy (e.g., to allow public read access for the proxy).
   */
  async putBucketPolicy(policy: string) {
    const command = new PutBucketPolicyCommand({
      Bucket: this.bucketName,
      Policy: policy,
    });
    return await this.client.send(command);
  }

  /**
   * Configures Cross-Origin Resource Sharing (CORS) rules.
   */
  async putBucketCors(corsRules: any[]) {
    const command = new PutBucketCorsCommand({
      Bucket: this.bucketName,
      CORSConfiguration: {
        CORSRules: corsRules,
      },
    });
    return await this.client.send(command);
  }

  /**
   * Generates a pre-signed S3 URL for a client to upload a video file 
   * directly to the bucket.
   * @param videoId - Unique ID of the video from the database
   * @param fileName - Name of the file being uploaded
   * @param contentType - MIME type of the file
   * @returns A promise that resolves to the pre-signed URL
   */
  async getPreSignedUploadUrl(videoId: string, fileName: string, contentType: string) {
    const key = `videos/${videoId}/${fileName}`;
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });

    try {
      // Generate a URL that expires in 60 minutes
      const url = await getSignedUrl(this.client, command, { expiresIn: 3600 });
      logger.info(`🔗 Generated pre-signed URL for video: ${videoId}`);
      return { url, key };
    } catch (error) {
      logger.error(`❌ Failed to generate pre-signed URL for video: ${videoId}`, error);
      throw error;
    }
  }

  /**
   * Recursively deletes all objects with a specific prefix (e.g., a "folder").
   * @param prefix - The directory path to remove (e.g., 'videos/123/')
   */
  async deleteFolder(prefix: string) {
    logger.info(`🗑️ Attempting to delete S3 folder: ${prefix}`);
    
    try {
      // 1. List all objects in the "folder"
      const listResponse = await this.listObjects(prefix);
      
      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        logger.info(`ℹ️ Folder ${prefix} is already empty or doesn't exist.`);
        return;
      }

      // 2. Extract keys of all objects
      const keys = listResponse.Contents
        .map((obj) => obj.Key)
        .filter((key): key is string => !!key);

      // 3. Bulk delete
      await this.deleteObjects(keys);
      logger.info(`✅ Successfully deleted ${keys.length} objects from ${prefix}`);
      
      // 4. Handle pagination if there are more than 1000 objects (rare for this use case)
      if (listResponse.IsTruncated) {
        await this.deleteFolder(prefix);
      }
    } catch (error) {
      logger.error(`❌ Failed to delete S3 folder: ${prefix}`, error);
      throw error;
    }
  }

  /**
   * Completely removes the bucket from AWS.
   */
  async deleteBucket() {
    const command = new DeleteBucketCommand({ Bucket: this.bucketName });
    return await this.client.send(command);
  }
}

// Export a singleton instance of the S3 service
export const s3Service = new S3Service();
export default s3Service;

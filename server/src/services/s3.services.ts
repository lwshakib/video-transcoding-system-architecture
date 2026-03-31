/**
 * AWS S3 Service.
 * This module provides high-level abstractions for interacting with Amazon S3.
 * It manages the storage lifecycle for both raw video uploads and processed HLS assets,
 * including bucket provisioning, security policies, and pre-signed URL generation.
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
  PutBucketCorsCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AWS_ACCESS_KEY_ID, AWS_REGION, AWS_SECRET_ACCESS_KEY, S3_BUCKET_NAME } from "../envs";
import logger from "../logger/winston.logger";

class S3Service {
  // Shared AWS SDK S3 Client instance.
  private client: S3Client;
  // The global bucket name as configured in the environment.
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
   * Lists objects within the bucket, optionally restricted by a prefix (folder path).
   * @param prefix - The directory path to scan.
   * @returns A promise resolving to the list of objects found.
   */
  async listObjects(prefix?: string) {
    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: prefix,
    });
    return await this.client.send(command);
  }

  /**
   * Performs a bulk deletion of multiple S3 objects.
   * @param keys - An array of unique S3 keys (file paths) to remove.
   */
  async deleteObjects(keys: string[]) {
    // Safety check: Exit early if the key list is empty to avoid AWS SDK errors.
    if (keys.length === 0) return;
    
    const command = new DeleteObjectsCommand({
      Bucket: this.bucketName,
      Delete: {
        // Map the string keys into the formal AWS Object Identifier format.
        Objects: keys.map((key) => ({ Key: key })),
      },
    });
    return await this.client.send(command);
  }

  /**
   * Verifies the existence and accessibility of the configured bucket.
   * Useful for validating infrastructure status during server startup.
   */
  async headBucket() {
    const command = new HeadBucketCommand({ Bucket: this.bucketName });
    return await this.client.send(command);
  }

  /**
   * Provisions a new S3 bucket in a specified region.
   * Automatically handles regional configuration constraints.
   * @param region - The AWS region string (e.g., 'ap-south-1').
   */
  async createBucket(region: string) {
    const createParams: CreateBucketCommandInput = {
      Bucket: this.bucketName,
    };
    
    // Note: us-east-1 (N. Virginia) is the default and does not require a LocationConstraint.
    if (region !== 'us-east-1') {
      createParams.CreateBucketConfiguration = {
        LocationConstraint: region as any,
      };
    }
    const command = new CreateBucketCommand(createParams);
    return await this.client.send(command);
  }

  /**
   * Updates the 'Public Access Block' configuration for the bucket.
   * This is used to control whether objects can be made publicly accessible via policies.
   */
  async putPublicAccessBlock(config: any) {
    const command = new PutPublicAccessBlockCommand({
      Bucket: this.bucketName,
      PublicAccessBlockConfiguration: config,
    });
    return await this.client.send(command);
  }

  /**
   * Attaches a JSON-formatted Access Policy to the bucket.
   * Used to grant public read permissions for HLS streaming components.
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
   * Essential for allowing web-based HLS players (like hls.js) to fetch segments from S3.
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
   * Generates a Pre-Signed URL that allows a client (browser) to upload a file directly to S3.
   * This offloads the heavy bandwidth requirements of video uploads from our Express server.
   * @param uploadId - A unique ID identifying the upload session.
   * @param fileName - The original name of the source file.
   * @param contentType - The MIME type of the video (e.g., 'video/mp4').
   * @returns An object containing the secure URL and the target S3 path (key).
   */
  async getPreSignedUploadUrl(uploadId: string, fileName: string, contentType: string) {
    // Construct a predictable but safe storage path for the temporary upload.
    const key = `uploads/${uploadId}/${fileName}`;
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType, // Ensure the file is served with the correct headers.
    });

    try {
      // The signed URL will be valid for 60 minutes, providing enough time for large uploads.
      const url = await getSignedUrl(this.client, command, { expiresIn: 3600 });
      logger.info(`🔗 Generated pre-signed URL for upload: ${uploadId}`);
      return { url, key };
    } catch (error) {
      // Log failure metadata for debugging IAM or network issues.
      logger.error(`❌ Failed to generate pre-signed URL for upload: ${uploadId}`, error);
      throw error;
    }
  }

  /**
   * Recursively deletes all objects matching a specific prefix.
   * Effectively acts as a 'Delete Folder' command in S3.
   * @param prefix - The directory-like prefix to purge.
   */
  async deleteFolder(prefix: string) {
    logger.info(`🗑️ Attempting to purge S3 assets under: ${prefix}`);
    
    try {
      // 1. Scan the S3 bucket for all objects residing under this prefix.
      const listResponse = await this.listObjects(prefix);
      
      // If the folder is already cleared, we exit without error.
      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        logger.info(`ℹ️ Path ${prefix} is already empty or doesn't exist.`);
        return;
      }

      // 2. Extract and filter the unique keys for total deletion.
      const keys = listResponse.Contents
        .map((obj) => obj.Key)
        .filter((key): key is string => !!key);

      // 3. Dispatch a bulk delete request to purge the identified assets.
      await this.deleteObjects(keys);
      logger.info(`✅ Successfully deleted ${keys.length} objects from ${prefix}`);
      
      // 4. Handle S3 Pagination (Truncation) if the folder contains more than 1000 objects.
      if (listResponse.IsTruncated) {
        // Recursive call to handle the next batch of objects.
        await this.deleteFolder(prefix);
      }
    } catch (error) {
      logger.error(`❌ Critical failure during S3 folder deletion: ${prefix}`, error);
      throw error;
    }
  }

  /**
   * Permanently removes the entire S3 bucket and its contents from the AWS account.
   * WARNING: This action is destructive and used primarily for system resets.
   */
  async deleteBucket() {
    const command = new DeleteBucketCommand({ Bucket: this.bucketName });
    return await this.client.send(command);
  }
}

// Export a singleton instance for system-wide storage orchestration.
export const s3Service = new S3Service();
export default s3Service;

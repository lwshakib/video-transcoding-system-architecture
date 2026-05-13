/**
 * AWS S3 Storage Reset Script.
 * This administration utility automates the complete removal of the S3 storage bucket.
 * It is primarily used during system resets to purge all uploaded source videos 
 * and generated HLS transcoding assets.
 * 
 * Logic Flow:
 * 1. Verify bucket existence.
 * 2. Purge all internal objects (Mandatory for bucket deletion).
 * 3. Delete the empty bucket from the AWS region.
 * 
 * WARNING: This action is destructive and irreversible.
 */

import { s3Service } from "../services/s3.services";
import logger from "../logger/winston.logger";
import { AWS_REGION, S3_BUCKET_NAME } from "../envs";

// Local cache for the target bucket identifier.
const bucketName = S3_BUCKET_NAME;

// Validation: Ensure the script has the bucket name required for S3 deletion.
if (!bucketName) {
  logger.error("❌ Missing S3_BUCKET_NAME credentials. Cannot proceed with storage reset.");
  process.exit(1);
}

/**
 * Main Orchestration Function for S3 Reset.
 */
async function resetS3() {
  logger.info(`🔥 Starting AWS S3 storage purge for: ${bucketName}...`);

  try {
    // Stage 1: Existence Check.
    // We attempt to 'head' the bucket to see if it even exists before starting deletions.
    try {
      await s3Service.headBucket();
    } catch (err: any) {
      // If the AWS API returns 'NotFound', we skip gracefully.
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        logger.info(`ℹ️ Bucket '${bucketName}' does not exist, skipping.`);
        return;
      }
      throw err; // Re-throw other errors (e.g. Forbidden).
    }

    // Stage 2: Empty the Bucket.
    // AWS S3 does not allow the deletion of buckets that contain files.
    // We use deleteFolder with an empty prefix ("") to recursively find and delete ALL objects.
    logger.info(`🗑️ Purging all internal objects from: ${bucketName}...`);
    await s3Service.deleteFolder("");

    // Stage 3: Bucket Deletion.
    // Finally, remove the empty bucket itself from the AWS account.
    await s3Service.deleteBucket();
    logger.info(`✅ S3 Bucket '${bucketName}' successfully removed.`);

    logger.info(`🎉 S3 Storage Reset Complete!`);

  } catch (error) {
    // Catch and log fatal SDK-level failures.
    logger.error("❌ S3 Reset process failed:", error);
    process.exit(1);
  }
}

// Execute the reset and handle the process lifecycle.
resetS3().then(() => {
  process.exit(0);
});

/**
 * AWS S3 Reset Script.
 * This script completely removes the S3 bucket and all its contents.
 * Use with caution: this will delete all uploaded videos and transcoded segments.
 */

import { s3Service } from "../services/s3.services";
import logger from "../logger/winston.logger";
import { AWS_REGION, S3_BUCKET_NAME } from "../envs";

const bucketName = S3_BUCKET_NAME;

if (!bucketName) {
  logger.error("❌ Missing S3_BUCKET_NAME environment variable.");
  process.exit(1);
}

/**
 * Main Reset function for S3.
 */
async function resetS3() {
  logger.info(`🔥 Resetting S3 bucket: ${bucketName}...`);

  try {
    // 1. Check if the bucket exists
    try {
      await s3Service.headBucket();
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        logger.info(`ℹ️ Bucket ${bucketName} does not exist, skipping.`);
        return;
      }
      throw err;
    }

    // 2. Empty the bucket first (S3 buckets must be empty before they can be deleted)
    logger.info(`🗑️ Emptying bucket ${bucketName}...`);
    await s3Service.deleteFolder(""); // Prefix "" lists and deletes all objects

    // 3. Delete the bucket
    await s3Service.deleteBucket();
    logger.info(`✅ Bucket ${bucketName} deleted successfully.`);

    logger.info(`🎉 S3 Reset Complete!`);

  } catch (error) {
    logger.error("❌ S3 reset failed:", error);
    process.exit(1);
  }
}

resetS3().then(() => {
  process.exit(0);
});

/**
 * AWS S3 Setup Script.
 * This script automates the creation and public configuration of an S3 bucket.
 * It ensures the bucket exists, disables public access blocks, and attaches a public read policy
 * so that deployed static files can be served via the reverse proxy.
 */

import { s3Service } from "../services/s3.services";
import logger from "../logger/winston.logger";
import { AWS_REGION, S3_BUCKET_NAME } from "../envs";

// Configuration for S3
const region = AWS_REGION;
const bucketName = S3_BUCKET_NAME;

// Validation: Ensure required environment variables are present
if (!region || !bucketName) {
  logger.error("❌ Missing AWS environment variables (AWS_REGION, S3_BUCKET_NAME).");
  process.exit(1);
}

/**
 * Main Setup function for S3.
 */
async function setupS3() {
  logger.info(`🚀 Starting S3 setup for bucket: ${bucketName}...`);

  try {
    // 1. Check if the bucket already exists
    let exists = false;
    try {
      await s3Service.headBucket();
      exists = true;
      logger.info(`ℹ️ Bucket ${bucketName} already exists. Proceeding to update configuration.`);
    } catch (err: any) {
      // Catch 404/NotFound to determine if creation is needed
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        exists = false;
      } else {
        throw err;
      }
    }

    // 2. Create the bucket if it doesn't exist
    if (!exists) {
      await s3Service.createBucket(region!);
      logger.info(`✅ Bucket ${bucketName} created successfully.`);
    }

    // 3. Disable Public Access Blocks
    // We need this disabled to allow our custom public policy to take effect
    await s3Service.putPublicAccessBlock({
      BlockPublicAcls: false,
      IgnorePublicAcls: false,
      BlockPublicPolicy: false,
      RestrictPublicBuckets: false,
    });
    logger.info(`✅ Public access blocks disabled.`);

    // 4. Define and attach a Public Read Policy
    // This allows anyone with the URL to GET objects within the bucket
    const publicPolicy = {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "PublicReadGetObject",
          Effect: "Allow",
          Principal: "*",
          Action: ["s3:GetObject"],
          Resource: [`arn:aws:s3:::${bucketName}/*`]
        }
      ]
    };

    await s3Service.putBucketPolicy(JSON.stringify(publicPolicy));
    
    logger.info(`✅ Public read policy attached.`);
    logger.info(`🎉 S3 setup complete! Your web files will be publicly accessible.`);

  } catch (error) {
    logger.error("❌ S3 setup failed:", error);
    process.exit(1);
  }
}

setupS3().then(() => {
  process.exit(0);
});

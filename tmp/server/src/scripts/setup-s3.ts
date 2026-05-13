/**
 * AWS S3 Setup Script.
 * This administrator utility automates the creation and public configuration 
 * of the Amazon S3 storage bucket.
 * 
 * Orchestration Steps:
 * 1. Provision the bucket in the designated AWS region.
 * 2. Disable all Public Access Blocks to allow subsequent access policies.
 * 3. Attach a Public Read policy for HLS streaming components.
 * 4. Configure CORS rules to enable direct browser-based uploads.
 */

import { s3Service } from "../services/s3.services";
import logger from "../logger/winston.logger";
import { AWS_REGION, S3_BUCKET_NAME } from "../envs";

// Local cache for environment variables.
const region = AWS_REGION;
const bucketName = S3_BUCKET_NAME;

// Validation: Ensure the script has the credentials required for bucket provisioning.
if (!region || !bucketName) {
  logger.error("❌ Missing AWS credentials or S3 bucket name. Cannot proceed with setup.");
  process.exit(1);
}

/**
 * Main SQS/S3 Orchestration Function for Storage Setup.
 */
async function setupS3() {
  logger.info(`🚀 Starting AWS S3 environment setup for bucket: ${bucketName}...`);

  try {
    // Stage 1: Provisioning.
    // Check if the bucket exists; create it if the account is starting from scratch.
    let exists = false;
    try {
      await s3Service.headBucket();
      exists = true;
      logger.info(`ℹ️ Bucket '${bucketName}' already active. Updating configuration...`);
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        exists = false;
      } else {
        throw err;
      }
    }

    if (!exists) {
      await s3Service.createBucket(region!);
      logger.info(`✅ Bucket '${bucketName}' successfully created.`);
    }

    // Stage 2: Security & Firewall Throttling.
    // We explicitly disable the account-level 'Block Public Access' to allow 
    // the system's public HLS streams to be served.
    await s3Service.putPublicAccessBlock({
      BlockPublicAcls: false,
      IgnorePublicAcls: false,
      BlockPublicPolicy: false,
      RestrictPublicBuckets: false,
    });
    logger.info(`✅ Account-level public access blocks disabled.`);

    // Stage 3: Public Policy Allocation.
    // This policy allows the Video Player to fetch '.m3u8' and '.ts' segments.
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
    logger.info(`✅ Public READ access policy attached.`);

    // Stage 4: Network Interoperability (CORS).
    // Configures S3 to accept HTTP 'PUT' requests from the web frontend's origin.
    const corsRules = [
      {
        AllowedHeaders: ["*"],
        AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
        AllowedOrigins: ["*"], // Restrict this in production for better security.
        ExposeHeaders: ["ETag"],
        MaxAgeSeconds: 3000,
      },
    ];
    await s3Service.putBucketCors(corsRules);
    logger.info(`✅ CORS configuration updated for browser uploads.`);

    logger.info(`🎉 S3 Storage Infrastructure Setup Complete!`);

  } catch (error) {
    // Catch and log fatal SDK-level failures.
    logger.error("❌ S3 Setup failed:", error);
    process.exit(1);
  }
}

// Execute the setup and handle the process lifecycle.
setupS3().then(() => {
  process.exit(0);
});

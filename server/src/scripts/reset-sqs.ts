/**
 * AWS SQS Queue Reset Script.
 * This administrator utility automates the complete removal of the Amazon SQS queue.
 * It is primarily used during system resets to purge pending transcoding jobs 
 * and return the messaging layer to a 'clean slate' state.
 * 
 * Logic Flow:
 * 1. Identify the SQS Queue URL by its name.
 * 2. Delete the queue directly from the AWS account.
 * 3. Reset the local .env to its official placeholder value.
 */

import { SQSClient, DeleteQueueCommand, GetQueueUrlCommand } from "@aws-sdk/client-sqs";
import { AWS_ACCESS_KEY_ID, AWS_REGION, AWS_SECRET_ACCESS_KEY } from "../envs";
import logger from "../logger/winston.logger";
import { updateEnv } from "../utils/env-updater";

// Local cache for environment variables.
const region = AWS_REGION;
const accessKeyId = AWS_ACCESS_KEY_ID;
const secretAccessKey = AWS_SECRET_ACCESS_KEY;

// Validation: Ensure the script has the credentials required for deletion.
if (!region || !accessKeyId || !secretAccessKey) {
  logger.error("❌ Missing AWS credentials. Cannot proceed with SQS queue reset.");
  process.exit(1);
}

// Instantiate the SQS client with infrastructure credentials.
const sqsClient = new SQSClient({
  region,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

/**
 * Main Orchestration Function for SQS Reset.
 */
async function resetSQS() {
  const queueName = "video-transcoding-queue";
  logger.info(`🔥 Starting AWS SQS queue purge for: ${queueName}...`);

  try {
    // Stage 1: Identification.
    // AWS SQS requires the full Queue URL for most operations. We must first resolve the name to a URL.
    const getUrlRes = await sqsClient.send(new GetQueueUrlCommand({ QueueName: queueName }));
    const queueUrl = getUrlRes.QueueUrl;

    // Stage 2: Deletion.
    // If the queue exists, we dispatch the command to remove it from the AWS region.
    if (queueUrl) {
      await sqsClient.send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
      logger.info(`✅ Queue '${queueName}' successfully removed.`);
    }

    // Stage 3: Local Configuration Reset.
    // Restore the .env file to its default state so the next 'setup' run has a clean starting point.
    // This prevents stale URLs from causing configuration conflicts.
    updateEnv("AWS_SQS_QUEUE_URL", "https://sqs.ap-south-1.amazonaws.com/YOUR_ACCOUNT_ID/YOUR_QUEUE_NAME");
    logger.info("✅ .env file updated with placeholder for AWS_SQS_QUEUE_URL.");

  } catch (error: any) {
    // Handle specific error: If the queue already doesn't exist, we skip gracefully.
    if (error.name === "QueueDoesNotExist") {
      logger.info(`ℹ️ Queue '${queueName}' does not exist, skipping.`);
    } else {
      // Catch and log other SDK-level permission or connection errors.
      logger.error("❌ SQS Reset process failed:", error);
    }
  }
}

// Execute the reset and handle the process lifecycle.
resetSQS().then(() => {
  process.exit(0);
});

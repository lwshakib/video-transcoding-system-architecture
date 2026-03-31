/**
 * AWS SQS Setup Script.
 * This script automates the creation of a standard SQS queue for the deployment system.
 * It also handles the surgical update of the .env file with the newly created Queue URL.
 */

import { CreateQueueCommand, SQSClient } from "@aws-sdk/client-sqs";
import { AWS_ACCESS_KEY_ID, AWS_REGION, AWS_SECRET_ACCESS_KEY } from "../envs";
import logger from "../logger/winston.logger";
import { updateEnv } from "../utils/env-updater";

// Configuration for AWS SQS Client
const region = AWS_REGION;
const accessKeyId = AWS_ACCESS_KEY_ID;
const secretAccessKey = AWS_SECRET_ACCESS_KEY;

// Validation: Ensure required environment variables are set before proceeding
if (!region || !accessKeyId || !secretAccessKey) {
  logger.error("❌ Missing AWS environment variables (AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY).");
  process.exit(1);
}

// Instantiate the SQS client with provided credentials
const sqsClient = new SQSClient({
  region,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

/**
 * Main Setup function for SQS.
 */
async function setupSQS() {
  const queueName = "video-transcoding-queue";

  logger.info(`🚀 Starting SQS setup for queue: ${queueName}...`);

  try {
    // Define queue attributes (Visibility Timeout and Message Retention)
    const createParams = {
      QueueName: queueName,
      Attributes: {
        VisibilityTimeout: "60", // 60 seconds gives the transcoding-container enough time to acknowledge the message
        MessageRetentionPeriod: "86400", // 1 day retention pool
      }
    };

    // Execute SQS Create Queue command
    const response = await sqsClient.send(new CreateQueueCommand(createParams));
    const queueUrl = response.QueueUrl;
    
    if (!queueUrl) {
      throw new Error("QueueUrl was not returned from AWS response.");
    }

    logger.info(`✅ Queue created successfully. URL: ${queueUrl}`);
    
    // Surgically update or add to .env using the centralized helper
    updateEnv("AWS_SQS_QUEUE_URL", queueUrl);
    logger.info("✅ .env file updated with AWS_SQS_QUEUE_URL.");

  } catch (error) {
    logger.error("❌ SQS setup failed:", error);
    process.exit(1);
  }
}

setupSQS().then(() => {
  process.exit(0);
});

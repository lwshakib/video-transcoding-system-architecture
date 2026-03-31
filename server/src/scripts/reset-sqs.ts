/**
 * AWS SQS Reset Script.
 * This script automates the deletion of the SQS queue and resets the .env variable
 * to its official placeholder value.
 */

import { SQSClient, DeleteQueueCommand, GetQueueUrlCommand } from "@aws-sdk/client-sqs";
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
 * Main Reset function for SQS.
 */
async function resetSQS() {
  const queueName = "video-transcoding-queue";
  logger.info(`🔥 Resetting SQS queue: ${queueName}...`);

  try {
    // 1. Retrieve the existing Queue URL by name
    const getUrlRes = await sqsClient.send(new GetQueueUrlCommand({ QueueName: queueName }));
    const queueUrl = getUrlRes.QueueUrl;

    // 2. If the queue exists, delete it
    if (queueUrl) {
      await sqsClient.send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
      logger.info(`✅ Queue ${queueName} deleted successfully.`);
    }

    // 3. Surgically update .env with the official placeholder value
    updateEnv("AWS_SQS_QUEUE_URL", "https://sqs.ap-south-1.amazonaws.com/YOUR_ACCOUNT_ID/YOUR_QUEUE_NAME");
    logger.info("✅ .env file updated with placeholder for SQS.");

  } catch (error: any) {
    // Handle specific error: Queue already deleted or never existed
    if (error.name === "QueueDoesNotExist") {
      logger.info("ℹ️ Queue does not exist, skipping.");
    } else {
      logger.error("❌ SQS reset failed:", error);
    }
  }
}

resetSQS().then(() => {
  process.exit(0);
});

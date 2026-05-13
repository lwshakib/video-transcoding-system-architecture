/**
 * AWS SQS Queue Setup Script.
 * This administrator utility automates the creation of a standard SQS queue 
 * for the video transcoding system. It ensures that the queue is properly 
 * configured with visibility timeouts and message retention periods.
 * 
 * Logic Flow:
 * 1. Provision the SQS queue with specified attributes.
 * 2. Retrieve the newly created Queue URL.
 * 3. Update the local .env file with the Queue URL for server consumption.
 */

import { CreateQueueCommand, SQSClient } from "@aws-sdk/client-sqs";
import { AWS_ACCESS_KEY_ID, AWS_REGION, AWS_SECRET_ACCESS_KEY } from "../envs";
import logger from "../logger/winston.logger";
import { updateEnv } from "../utils/env-updater";

// Local cache for environment variables.
const region = AWS_REGION;
const accessKeyId = AWS_ACCESS_KEY_ID;
const secretAccessKey = AWS_SECRET_ACCESS_KEY;

// Validation: Ensure the script has the credentials required for queue provisioning.
if (!region || !accessKeyId || !secretAccessKey) {
  logger.error("❌ Missing AWS credentials. Cannot proceed with SQS queue setup.");
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
 * Main Messaging Orchestration Function for SQS Setup.
 */
async function setupSQS() {
  const queueName = "video-transcoding-queue";

  logger.info(`🚀 Starting AWS SQS environment setup for: ${queueName}...`);

  try {
    /**
     * SQS Queue Parameters:
     * - VisibilityTimeout: '60' seconds. This ensures that when a worker picks up 
     *    a job, it has 1 minute to acknowledge it before the queue makes it visible 
     *    to other workers again.
     * - MessageRetentionPeriod: '86400' (1 Day). Standard retention pool for pending jobs.
     */
    const createParams = {
      QueueName: queueName,
      Attributes: {
        VisibilityTimeout: "60",
        MessageRetentionPeriod: "86400",
      }
    };

    // Stage 1: Queue Creation.
    // Execute the command to provision the messaging registry in the AWS region.
    const response = await sqsClient.send(new CreateQueueCommand(createParams));
    const queueUrl = response.QueueUrl;
    
    if (!queueUrl) {
      throw new Error("❌ SQS Infrastructure failure: Queue URL was not returned.");
    }

    logger.info(`✅ SQS Queue successfully provisioned. URL: ${queueUrl}`);
    
    // Stage 2: Local Configuration Finalization.
    // Surgically inject the resolved Queue URL into the server's .env file.
    updateEnv("AWS_SQS_QUEUE_URL", queueUrl);
    logger.info("✅ .env file updated with AWS_SQS_QUEUE_URL.");

    logger.info(`🎉 AWS SQS Messaging Infrastructure Setup Complete!`);

  } catch (error) {
    // Catch and log fatal SDK-level failures.
    logger.error("❌ SQS Reset process failed:", error);
    process.exit(1);
  }
}

// Execute the setup and handle the process lifecycle.
setupSQS().then(() => {
  process.exit(0);
});

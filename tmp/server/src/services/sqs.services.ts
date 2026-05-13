/**
 * AWS SQS Service.
 * This module acts as the central task queue manager for the transcoding system.
 * It provides two primary functions:
 * 1. Pushing new transcoding job requests into the Amazon SQS queue.
 * 2. Continuously polling the queue for incoming messages and orchestrating 
 *    the execution of transcoding tasks (either via local Docker or AWS ECS).
 */

import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs";
import { ecsService } from "./ecs.services";
import { dockerService } from "./docker.services";
import { postgresService } from "./postgres.services";
import logger from "../logger/winston.logger";
import { AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SQS_QUEUE_URL, NODE_ENV } from "../envs";

class SQSService {
  // Shared AWS SQS Client instance.
  private client: SQSClient;
  // The absolute URL of the designated SQS queue.
  private queueUrl: string;

  /**
   * Initializes the SQS client with infrastructure credentials.
   * Performs an immediate validation check to ensure the environment is correctly configured.
   */
  constructor() {
    const region = AWS_REGION;
    const accessKeyId = AWS_ACCESS_KEY_ID;
    const secretAccessKey = AWS_SECRET_ACCESS_KEY;
    const queueUrl = AWS_SQS_QUEUE_URL;

    // Critical validation: The service cannot start without these AWS endpoints and keys.
    if (!region || !accessKeyId || !secretAccessKey || !queueUrl) {
      throw new Error("❌ SQS environment variables are missing. SQS service cannot be initialized.");
    }

    this.queueUrl = queueUrl;
    this.client = new SQSClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  /**
   * Transmits a new transcoding job payload to the SQS queue.
   * This is typically called by the Express controller after a user confirms an upload.
   * @param payload - A JSON object containing the videoId, source URL, and metadata.
   */
  async sendMessage(payload: any) {
    const command = new SendMessageCommand({
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify(payload), // Serialize the payload to a string for SQS.
    });

    try {
      const response = await this.client.send(command);
      logger.info(`📨 Transcoding job pushed to SQS: ${response.MessageId}`);
      return response;
    } catch (error) {
      // Log failure metadata for debugging IAM permissions or network connectivity.
      logger.error("❌ Failed to push transcoding job to SQS:", error);
      throw error;
    }
  }

  /**
   * Continuous Polling Loop.
   * This long-running method acts as the 'Consumer' in our producer-consumer architecture.
   * It uses 'WaitTimeSeconds' to implement Cost-Efficient Long Polling.
   */
  async startPolling() {
    logger.info(`🎧 Started background polling for SQS queue: ${this.queueUrl}`);

    // Infinite loop to keep the listener active for the duration of the server's lifecycle.
    while (true) {
      try {
        // Request up to 1 message from the queue.
        // WaitTimeSeconds: 20 -> This keeps the connection open for up to 20s if no messages are found,
        // significantly reducing the number of empty API calls and lowering AWS costs.
        const command = new ReceiveMessageCommand({
          QueueUrl: this.queueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 20,
        });

        const response = await this.client.send(command);

        // Process only if a valid message was returned.
        if (response.Messages && response.Messages.length > 0) {
          for (const message of response.Messages) {
            if (message.Body) {
              // Parse the job instruction from the message body.
              const payload = JSON.parse(message.Body);
              logger.info(`📥 Received transcoding request from SQS: ${payload.videoId}`);

              // Determine the execution strategy based on the current environment mode.
              const isDev = NODE_ENV === "development";
              
              const taskParams = {
                videoId: payload.videoId,
                videoUrl: payload.videoUrl, // The S3 path to the source video.
              };

              // --- 1. STATUS UPDATE: 'PROCESSING' ---
              // Inform the database that work has officially begun so the UI can update.
              try {
                await postgresService.query("UPDATE videos SET status = 'PROCESSING' WHERE id = $1", [payload.videoId]);
              } catch (err) {
                logger.error("❌ Database synchronization failed for status: PROCESSING", err);
              }

              // --- 2. TRIGGER COMPUTE EXECUTION ---
              try {
                if (isDev) {
                  // LOCAL FLOW: Use the host's Docker daemon for fast local testing.
                  logger.info(`🏠 [DEV] Triggering local Docker worker for: ${payload.videoId}...`);
                  await dockerService.runTask(taskParams);
                  // Update the DB with the local container name as the 'external_id'.
                  await postgresService.query("UPDATE videos SET external_id = $1 WHERE id = $2", [`transcoder-${payload.videoId}`, payload.videoId]);
                } else {
                  // CLOUD FLOW: Launch an isolated AWS ECS Fargate task.
                  logger.info(`Cloud [PROD] Launching AWS ECS Fargate task for: ${payload.videoId}...`);
                  const ecsResponse = await ecsService.runTask(taskParams);
                  const taskArn = ecsResponse.tasks?.[0]?.taskArn;
                  // Persist the AWS Task ARN so we can track or stop it later.
                  if (taskArn) {
                    await postgresService.query("UPDATE videos SET external_id = $1 WHERE id = $2", [taskArn, payload.videoId]);
                  }
                }

                // --- 3. QUEUE CLEANUP ---
                // Crucial step: Delete the message from SQS to prevent it from being re-processed
                // after the 'visibility timeout' expires.
                await this.client.send(new DeleteMessageCommand({
                  QueueUrl: this.queueUrl,
                  ReceiptHandle: message.ReceiptHandle,
                }));
                logger.info(`✅ SQS Message consumed and deleted: ${message.MessageId}`);
              } catch (error) {
                // FAIL-SAFE: If the job trigger fails (e.g. Docker down, ECS capacity hit), 
                // we mark the video as 'FAILED' in the database.
                logger.error("❌ Failed to initiate transcoding task, aborting job:", error);
                await postgresService.query("UPDATE videos SET status = 'FAILED' WHERE id = $1", [payload.videoId]);
                
                // Still delete the message to avoid an infinite 'fail-loop' if the payload is malformed.
                await this.client.send(new DeleteMessageCommand({
                  QueueUrl: this.queueUrl,
                  ReceiptHandle: message.ReceiptHandle,
                }));
              }
            }
          }
        }
      } catch (error) {
        // Catch and log external SQS network or credential errors.
        logger.error("❌ SQS Polling cycle encountered an error:", error);
        // Exponential backoff fallback: Wait 5 seconds before retrying to avoid spamming a broken endpoint.
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }
}

// Export a singleton instance for global queue management.
export const sqsService = new SQSService();
export default sqsService;

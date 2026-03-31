/**
 * AWS ECS Service.
 * This service is responsible for triggering transcoding tasks in the cloud.
 * It uses AWS Fargate to run the transcoding-container image for every new deployment.
 */

import { ECSClient, RunTaskCommand, StopTaskCommand } from "@aws-sdk/client-ecs";
import logger from "../logger/winston.logger";
import { 
  AWS_ACCESS_KEY_ID, 
  AWS_REGION, 
  AWS_SECRET_ACCESS_KEY, 
  ECS_CLUSTER_ARN, 
  ECS_CONTAINER_NAME, 
  ECS_SECURITY_GROUPS, 
  ECS_SUBNETS, 
  ECS_TASK_DEFINITION_ARN, 
  S3_BUCKET_NAME,
  DATABASE_URL
} from "../envs";

class ECSService {
  // Shared AWS ECS Client
  private client: ECSClient;

  /**
   * Initializes the ECS client with infrastructure credentials.
   */
  constructor() {
    this.client = new ECSClient({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    });
  }

  /**
   * Triggers a new ECS Fargate task to transcode a video.
   * @param params - Video metadata including unique ID and source URL
   * @returns The ECS response including the Task ARN
   */
  async runTask(params: {
    videoId: string;
    videoUrl: string;
    thumbnailUrl?: string;
  }) {
    const { videoId, videoUrl } = params;

    // Construct the command to run a single Fargate task
    const command = new RunTaskCommand({
      cluster: ECS_CLUSTER_ARN,
      taskDefinition: ECS_TASK_DEFINITION_ARN,
      launchType: "FARGATE",
      count: 1,
      networkConfiguration: {
        awsvpcConfiguration: {
          assignPublicIp: "ENABLED",
          subnets: ECS_SUBNETS.split(","),
          securityGroups: ECS_SECURITY_GROUPS.split(","),
        },
      },
      // Environment variable overrides to pass the transcoding context into the container
      overrides: {
        containerOverrides: [
          {
            name: ECS_CONTAINER_NAME,
            environment: [
              // Transcoding Context
              { name: "VIDEO_ID", value: videoId },
              { name: "VIDEO_URL", value: videoUrl },
              // Global Infrastructure Credentials & Endpoints
              { name: "AWS_REGION", value: AWS_REGION },
              { name: "AWS_ACCESS_KEY_ID", value: AWS_ACCESS_KEY_ID },
              { name: "AWS_SECRET_ACCESS_KEY", value: AWS_SECRET_ACCESS_KEY },
              { name: "S3_BUCKET_NAME", value: S3_BUCKET_NAME },
              { name: "DATABASE_URL", value: DATABASE_URL },
            ],
          },
        ],
      },
    });

    try {
      // Execute the command via the AWS SDK
      const response = await this.client.send(command);
      logger.info(`🚀 ECS Transcoding Task triggered: ${response.tasks?.[0]?.taskArn}`);
      return response;
    } catch (error) {
      logger.error("❌ ECS Task trigger error:", error);
      throw error;
    }
  }

  /**
   * Stops a running AWS ECS Fargate task.
   * @param taskArn - The Amazon Resource Name (ARN) identifying the task to stop
   */
  async stopTask(taskArn: string) {
    logger.info(`🛑 Stopping AWS ECS task: ${taskArn}...`);
    const command = new StopTaskCommand({
      cluster: ECS_CLUSTER_ARN,
      task: taskArn,
      reason: "Video deleted by user",
    });

    try {
      await this.client.send(command);
      logger.info(`✅ ECS Task stop command sent: ${taskArn}`);
      return true;
    } catch (error) {
      logger.error(`❌ Failed to stop ECS Task ${taskArn}:`, error);
      return false;
    }
  }
}

// Export a singleton instance of the ECS service
export const ecsService = new ECSService();
export default ecsService;

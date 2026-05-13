/**
 * AWS ECS Service.
 * This module is responsible for orchestrating video transcoding tasks in the cloud.
 * It leverages AWS Fargate (Serverless Compute) to run the 'transcoding-container' for 
 * every job, ensuring isolated, scalable, and cost-effective video processing.
 */

import { ECSClient, RunTaskCommand, StopTaskCommand } from "@aws-sdk/client-ecs";
import logger from "../logger/winston.logger";
import { 
  AWS_ACCESS_KEY_ID, 
  AWS_REGION, 
  AWS_SECRET_ACCESS_KEY, 
  S3_BUCKET_NAME,
  DATABASE_URL,
  ECS_CLUSTER_ARN, 
  ECS_CONTAINER_NAME, 
  ECS_SECURITY_GROUPS, 
  ECS_SUBNETS, 
  ECS_TASK_DEFINITION_ARN
} from "../envs";

class ECSService {
  // Shared AWS ECS Client instance for the entire application.
  private client: ECSClient;

  /**
   * Initializes the ECS client with the specific region and IAM credentials 
   * loaded from the server's environment configuration.
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
   * Triggers a new AWS ECS Fargate task to perform a video transcoding operation.
   * This is the primary entry point for cloud-based processing.
   * @param params - Metadata defining the job context: videoId and the S3 source URL.
   * @returns The full response from the AWS SDK, including the unique Task ARN.
   */
  async runTask(params: {
    videoId: string;
    videoUrl: string;
    thumbnailUrl?: string;
  }) {
    const { videoId, videoUrl } = params;

    // Define and construct the command to launch a single Fargate task.
    const command = new RunTaskCommand({
      // The target ECS Cluster where the task will be scheduled.
      cluster: ECS_CLUSTER_ARN,
      // The blueprint describing which image and resources (CPU/RAM) to use.
      taskDefinition: ECS_TASK_DEFINITION_ARN,
      // Launch via Fargate to avoid managing underlying EC2 server instances.
      launchType: "FARGATE",
      // We only need one container per transcoding job.
      count: 1,
      networkConfiguration: {
        awsvpcConfiguration: {
          // Enable public IP so the container can reach S3 and the Postgres database.
          assignPublicIp: "ENABLED",
          // Map to the designated VPC subnets.
          subnets: ECS_SUBNETS.split(","),
          // Apply the firewall rules defined in the security group.
          securityGroups: ECS_SECURITY_GROUPS.split(","),
        },
      },
      // Overrides: Inject the specific environment variables required by this job into the container.
      overrides: {
        containerOverrides: [
          {
            // Must match the container name defined in the Task Definition.
            name: ECS_CONTAINER_NAME,
            environment: [
              // Transcoding Job Context: Identifies the video and where its source is kept.
              { name: "VIDEO_ID", value: videoId },
              { name: "VIDEO_URL", value: videoUrl },
              // Infrastructure Credentials: Allows the container to work with S3.
              { name: "AWS_REGION", value: AWS_REGION },
              { name: "AWS_ACCESS_KEY_ID", value: AWS_ACCESS_KEY_ID },
              { name: "AWS_SECRET_ACCESS_KEY", value: AWS_SECRET_ACCESS_KEY },
              { name: "S3_BUCKET_NAME", value: S3_BUCKET_NAME },
              // Database Connectivity: Allows the container to update the video status.
              { name: "DATABASE_URL", value: DATABASE_URL },
            ],
          },
        ],
      },
    });

    try {
      // Dispatch the command to the AWS API.
      const response = await this.client.send(command);
      // Log the ARN of the task so we can track its status in the AWS Console if needed.
      logger.info(`🚀 ECS Transcoding Task triggered: ${response.tasks?.[0]?.taskArn}`);
      return response;
    } catch (error) {
      // Catch and log any SDK-level communication or permission errors.
      logger.error("❌ ECS Task trigger error:", error);
      throw error;
    }
  }

  /**
   * Forcibly terminates an active AWS ECS Fargate task.
   * Used during the 'Delete' lifecycle to stop processing if a user cancels a job.
   * @param taskArn - The unique Amazon Resource Name identifying the specific task instance.
   */
  async stopTask(taskArn: string) {
    logger.info(`🛑 Stopping AWS ECS task: ${taskArn}...`);
    
    // Prepare the command to halt the task.
    const command = new StopTaskCommand({
      cluster: ECS_CLUSTER_ARN,
      task: taskArn,
      reason: "Video deleted by user", // Metadata for why the task was stopped.
    });

    try {
      // Execute the termination request.
      await this.client.send(command);
      logger.info(`✅ ECS Task stop command sent: ${taskArn}`);
      return true;
    } catch (error) {
      // If the task cannot be stopped (e.g. it's already ended), log a warning.
      logger.error(`❌ Failed to stop ECS Task ${taskArn}:`, error);
      return false;
    }
  }
}

// Export a singleton instance to be shared across Express controllers.
export const ecsService = new ECSService();
export default ecsService;

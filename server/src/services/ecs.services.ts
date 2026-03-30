/**
 * AWS ECS Service.
 * This service is responsible for triggering transcoding tasks in the cloud.
 * It uses AWS Fargate to run the transcoding-container image for every new deployment.
 */

import { ECSClient, RunTaskCommand } from "@aws-sdk/client-ecs";
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
  S3_BUCKET_NAME 
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
   * Triggers a new ECS Fargate task to build a React application.
   * @param params - Configuration for the specific build task
   * @returns The ECS response including the Task ARN
   */
  async runTask(params: {
    gitURL: string;
    projectId: string;
    deploymentId: string;
    projectName: string;
  }) {
    const { gitURL, projectId, deploymentId, projectName } = params;

    // Construct the command to run a single Fargate task
    const command = new RunTaskCommand({
      cluster: ECS_CLUSTER_ARN,
      taskDefinition: ECS_TASK_DEFINITION_ARN,
      launchType: "FARGATE",
      count: 1, // Only one container per build
      networkConfiguration: {
        awsvpcConfiguration: {
          // Required for the container to pull images and reach SQS/Kafka
          assignPublicIp: "ENABLED",
          subnets: ECS_SUBNETS.split(","),
          securityGroups: ECS_SECURITY_GROUPS.split(","),
        },
      },
      // Environment variable overrides to pass the build context into the container
      overrides: {
        containerOverrides: [
          {
            name: ECS_CONTAINER_NAME,
            environment: [
              // Deployment Context
              { name: "GIT_REPOSITORY__URL", value: gitURL },
              { name: "PROJECT_ID", value: projectId },
              { name: "DEPLOYMENT_ID", value: deploymentId },
              { name: "PROJECT_NAME", value: projectName },
              // Global Infrastructure Credentials & Endpoints
              { name: "AWS_REGION", value: AWS_REGION },
              { name: "AWS_ACCESS_KEY_ID", value: AWS_ACCESS_KEY_ID },
              { name: "AWS_SECRET_ACCESS_KEY", value: AWS_SECRET_ACCESS_KEY },
              { name: "S3_BUCKET_NAME", value: S3_BUCKET_NAME },
            ],
          },
        ],
      },
    });

    try {
      // Execute the command via the AWS SDK
      const response = await this.client.send(command);
      logger.info(`🚀 ECS Task triggered: ${response.tasks?.[0]?.taskArn}`);
      return response;
    } catch (error) {
      logger.error("❌ ECS Task trigger error:", error);
      throw error;
    }
  }
}

// Export a singleton instance of the ECS service
export const ecsService = new ECSService();
export default ecsService;

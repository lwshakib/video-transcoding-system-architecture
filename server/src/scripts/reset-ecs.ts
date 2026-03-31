/**
 * AWS ECS Infrastructure Reset Script.
 * This script automates the complete teardown of the AWS Fargate infrastructure, including:
 * 1. Deleting the ECS Cluster.
 * 2. Deregistering all Task Definitions in the family.
 * 3. Deleting the ECR Repository for the build container.
 * 4. Detaching policies and deleting IAM Roles.
 * 5. Resetting all ECS-related .env variables to their official placeholder values.
 */

import { ECSClient, DeleteClusterCommand, DeregisterTaskDefinitionCommand, ListTaskDefinitionsCommand } from "@aws-sdk/client-ecs";
import { ECRClient, DeleteRepositoryCommand } from "@aws-sdk/client-ecr";
import { IAMClient, DeleteRoleCommand, DetachRolePolicyCommand, ListAttachedRolePoliciesCommand } from "@aws-sdk/client-iam";
import { AWS_ACCESS_KEY_ID, AWS_REGION, AWS_SECRET_ACCESS_KEY } from "../envs";
import logger from "../logger/winston.logger";
import { updateEnv } from "../utils/env-updater";

// Configuration for AWS Client
const region = AWS_REGION;
const accessKeyId = AWS_ACCESS_KEY_ID;
const secretAccessKey = AWS_SECRET_ACCESS_KEY;

// Validation: Ensure required environment variables are set before proceeding
if (!region || !accessKeyId || !secretAccessKey) {
  logger.error("❌ Missing AWS environment variables (AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY).");
  process.exit(1);
}

// Credentials object for all AWS service clients
const credentials = { accessKeyId, secretAccessKey };

// Instantiate specialized AWS clients
const ecsClient = new ECSClient({ region, credentials });
const ecrClient = new ECRClient({ region, credentials });
const iamClient = new IAMClient({ region, credentials });

/**
 * Main Reset function for ECS Fargate.
 */
async function resetECS() {
  logger.info("🔥 Resetting ECS, ECR, and IAM infrastructure...");

  try {
    // 1. Teardown ECS Cluster
    try {
      await ecsClient.send(new DeleteClusterCommand({ cluster: "video-transcoding-cluster" }));
      logger.info("✅ ECS Cluster deleted.");
    } catch (e) {
      // Silently handle if doesn't exist
    }

    // 2. Deregister Task Definitions
    try {
      // List all existing task definitions for the specific family
      const taskDefsRes = await ecsClient.send(new ListTaskDefinitionsCommand({ familyPrefix: "video-transcoding-task" }));
      if (taskDefsRes.taskDefinitionArns) {
        for (const arn of taskDefsRes.taskDefinitionArns) {
          // Deregister each definition found
          await ecsClient.send(new DeregisterTaskDefinitionCommand({ taskDefinition: arn }));
        }
      }
      logger.info("✅ Task Definitions deregistered.");
    } catch (e) {}

    // 3. Delete ECR Repository
    try {
      // Use 'force: true' to ensure the repository is deleted even if it contains images
      await ecrClient.send(new DeleteRepositoryCommand({ repositoryName: "transcoding-container", force: true }));
      logger.info("✅ ECR Repository deleted.");
    } catch (e) {}

    // 4. Cleanup IAM Roles
    const roles = ["VideoTranscodingTaskExecutionRole", "VideoTranscodingTaskRole"];
    for (const roleName of roles) {
      try {
        // First, list and detach all policies attached to the role
        const policiesRes = await iamClient.send(new ListAttachedRolePoliciesCommand({ RoleName: roleName }));
        if (policiesRes.AttachedPolicies) {
          for (const policy of policiesRes.AttachedPolicies) {
            await iamClient.send(new DetachRolePolicyCommand({ RoleName: roleName, PolicyArn: policy.PolicyArn }));
          }
        }
        // Then, delete the role itself
        await iamClient.send(new DeleteRoleCommand({ RoleName: roleName }));
        logger.info(`✅ IAM Role ${roleName} deleted.`);
      } catch (e) {}
    }

    // 5. Surgically update .env with official placeholder values to keep the file valid
    updateEnv("ECS_CLUSTER_ARN", "arn:aws:ecs:ap-south-1:YOUR_ACCOUNT_ID:cluster/YOUR_CLUSTER_NAME");
    updateEnv("ECS_TASK_DEFINITION_ARN", "arn:aws:ecs:ap-south-1:YOUR_ACCOUNT_ID:task-definition/YOUR_TASK_NAME:REVISION");
    updateEnv("ECS_CONTAINER_NAME", "transcoding-container");
    updateEnv("ECS_SUBNETS", "subnet-...,subnet-...");
    updateEnv("ECS_SECURITY_GROUPS", "sg-...");
    logger.info("✅ .env file updated with placeholders for ECS.");

    logger.info("🎉 ECS Reset Complete!");
  } catch (error) {
    logger.error("❌ ECS Reset failed:", error);
  }
}

resetECS().then(() => {
  process.exit(0);
});

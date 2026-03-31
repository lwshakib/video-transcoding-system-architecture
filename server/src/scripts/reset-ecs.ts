/**
 * AWS ECS Infrastructure Reset Script.
 * This administration utility automates the complete destruction of the AWS Fargate 
 * transcoding infrastructure. It is designed to return the AWS environment to a 
 * 'clean slate' state by removing all clusters, task definitions, and IAM roles.
 * 
 * Teardown Sequence:
 * 1. Terminate the ECS Cluster.
 * 2. Deregister all revisions of the Task Definition.
 * 3. Delete the ECR Container Registry.
 * 4. Detach and delete all IAM Security Roles.
 * 5. Reset local .env placeholders.
 */

import { ECSClient, DeleteClusterCommand, DeregisterTaskDefinitionCommand, ListTaskDefinitionsCommand } from "@aws-sdk/client-ecs";
import { ECRClient, DeleteRepositoryCommand } from "@aws-sdk/client-ecr";
import { IAMClient, DeleteRoleCommand, DetachRolePolicyCommand, ListAttachedRolePoliciesCommand } from "@aws-sdk/client-iam";
import { AWS_ACCESS_KEY_ID, AWS_REGION, AWS_SECRET_ACCESS_KEY } from "../envs";
import logger from "../logger/winston.logger";
import { updateEnv } from "../utils/env-updater";

// Local cache for environment variables.
const region = AWS_REGION;
const accessKeyId = AWS_ACCESS_KEY_ID;
const secretAccessKey = AWS_SECRET_ACCESS_KEY;

// Validation: Ensure the script has the necessary credentials to perform AWS deletions.
if (!region || !accessKeyId || !secretAccessKey) {
  logger.error("❌ Missing AWS credentials. Cannot proceed with infrastructure teardown.");
  process.exit(1);
}

// Credential package for AWS SDK client instantiation.
const credentials = { accessKeyId, secretAccessKey };

// Initialize the specialized AWS clients for individual services.
const ecsClient = new ECSClient({ region, credentials });
const ecrClient = new ECRClient({ region, credentials });
const iamClient = new IAMClient({ region, credentials });

/**
 * Main Orchestration Function for ECS Reset.
 */
async function resetECS() {
  logger.info("🔥 Starting AWS ECS, ECR, and IAM infrastructure purge...");

  try {
    // --- 1. ECS CLUSTER CLEANUP ---
    try {
      // Attempt to delete the cluster by its unique name. 
      // Note: All services/tasks must be stopped for this to succeed (handled by the AWS API).
      await ecsClient.send(new DeleteClusterCommand({ cluster: "video-transcoding-cluster" }));
      logger.info("✅ ECS Cluster successfully removed.");
    } catch (e) {
      // If the cluster doesn't exist, we skip silently to allow for idempotent execution.
    }

    // --- 2. TASK DEFINITION DEREGISTRATION ---
    try {
      // List all historical revisions of the transcoding task blueprint.
      const taskDefsRes = await ecsClient.send(new ListTaskDefinitionsCommand({ familyPrefix: "video-transcoding-task" }));
      if (taskDefsRes.taskDefinitionArns) {
        for (const arn of taskDefsRes.taskDefinitionArns) {
          // Explicitly deregister each revision found to clear the AWS account footprint.
          await ecsClient.send(new DeregisterTaskDefinitionCommand({ taskDefinition: arn }));
        }
      }
      logger.info("✅ All Task Definition revisions deregistered.");
    } catch (e) {}

    // --- 3. ECR REPOSITORY PURGE ---
    try {
      // Delete the private container registry.
      // 'force: true' ensures the repository is deleted even if it contains built images.
      await ecrClient.send(new DeleteRepositoryCommand({ repositoryName: "transcoding-container", force: true }));
      logger.info("✅ ECR Registry and all images deleted.");
    } catch (e) {}

    // --- 4. IAM ROLE & POLICY TEARDOWN ---
    // We cleanup both the execution role (AWS service) and the task role (internal container identity).
    const roles = ["VideoTranscodingTaskExecutionRole", "VideoTranscodingTaskRole"];
    for (const roleName of roles) {
      try {
        // Step 4a: Detach all managed policies before the role can be deleted.
        const policiesRes = await iamClient.send(new ListAttachedRolePoliciesCommand({ RoleName: roleName }));
        if (policiesRes.AttachedPolicies) {
          for (const policy of policiesRes.AttachedPolicies) {
            await iamClient.send(new DetachRolePolicyCommand({ RoleName: roleName, PolicyArn: policy.PolicyArn }));
          }
        }
        // Step 4b: Final removal of the IAM role.
        await iamClient.send(new DeleteRoleCommand({ RoleName: roleName }));
        logger.info(`✅ IAM Role '${roleName}' purged.`);
      } catch (e) {}
    }

    // --- 5. LOCAL CONFIGURATION RESET ---
    // Restore the .env file to its default state so the next 'setup' run has a clean starting point.
    // This prevents stale ARNs from causing configuration conflicts.
    updateEnv("ECS_CLUSTER_ARN", "arn:aws:ecs:ap-south-1:YOUR_ACCOUNT_ID:cluster/YOUR_CLUSTER_NAME");
    updateEnv("ECS_TASK_DEFINITION_ARN", "arn:aws:ecs:ap-south-1:YOUR_ACCOUNT_ID:task-definition/YOUR_TASK_NAME:REVISION");
    updateEnv("ECS_CONTAINER_NAME", "transcoding-container");
    updateEnv("ECS_SUBNETS", "subnet-...,subnet-...");
    updateEnv("ECS_SECURITY_GROUPS", "sg-...");
    
    logger.info("✅ Local configuration restored to default placeholders.");
    logger.info("🎉 ECS Infrastructure Reset Complete!");
  } catch (error) {
    // Catch and log fatal orchestration failures.
    logger.error("❌ ECS Reset process failed:", error);
  }
}

// Execute the reset and handle the process lifecycle.
resetECS().then(() => {
  process.exit(0);
});

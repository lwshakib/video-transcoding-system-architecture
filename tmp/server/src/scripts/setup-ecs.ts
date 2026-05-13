/**
 * AWS ECS Infrastructure Setup Script.
 * This comprehensive administrative utility automates the creation and configuration 
 * of the AWS Fargate transcoding environment.
 * 
 * Orchestration Steps:
 * 1. Provision IAM Execution and Task Roles for security isolation.
 * 2. Create a private ECR (Elastic Container Registry) to store worker images.
 * 3. Build the local 'transcoding-container' Docker image and push it to ECR.
 * 4. Instantiate the ECS Cluster and CloudWatch Log Groups for telemetry.
 * 5. Register the Task Definition (The worker's execution blueprint).
 * 6. Automatically discover VPC networking (Subnets/Security Groups) and update local .env.
 */

import { ECSClient, CreateClusterCommand, RegisterTaskDefinitionCommand } from "@aws-sdk/client-ecs";
import { AWS_ACCESS_KEY_ID, AWS_REGION, AWS_SECRET_ACCESS_KEY, S3_BUCKET_NAME } from "../envs";
import { CloudWatchLogsClient, CreateLogGroupCommand, PutRetentionPolicyCommand } from "@aws-sdk/client-cloudwatch-logs";
import { ECRClient, CreateRepositoryCommand, DescribeRepositoriesCommand, GetAuthorizationTokenCommand } from "@aws-sdk/client-ecr";
import { IAMClient, CreateRoleCommand, AttachRolePolicyCommand, GetRoleCommand } from "@aws-sdk/client-iam";
import { EC2Client, DescribeVpcsCommand, DescribeSubnetsCommand, DescribeSecurityGroupsCommand } from "@aws-sdk/client-ec2";
import path from "path";
import { execSync } from "child_process";
import logger from "../logger/winston.logger";
import { updateEnv } from "../utils/env-updater";

// Configuration for AWS Client communication.
const region = AWS_REGION;
const accessKeyId = AWS_ACCESS_KEY_ID;
const secretAccessKey = AWS_SECRET_ACCESS_KEY;

// Validation: The script cannot interact with AWS without these core credentials.
if (!region || !accessKeyId || !secretAccessKey) {
  logger.error("❌ Missing AWS credentials. Cannot proceed with infrastructure setup.");
  process.exit(1);
}

// Global credentials object for SDK client instantiation.
const credentials = { accessKeyId, secretAccessKey };

// Initialize specialized AWS clients for individual infrastructure components.
const ecsClient = new ECSClient({ region, credentials });
const ecrClient = new ECRClient({ region, credentials });
const iamClient = new IAMClient({ region, credentials });
const ec2Client = new EC2Client({ region, credentials });
const cwLogsClient = new CloudWatchLogsClient({ region, credentials });

// Identifying constant for the worker container.
const CONTAINER_NAME = "transcoding-container";

/**
 * Utility: Find or Create an IAM Role.
 * Handles the common 'Idempotent' check to avoid errors if the role is already defined.
 */
async function getOrCreateRole(roleName: string, assumeRolePolicyDocument: string) {
  try {
    const roleRes = await iamClient.send(new GetRoleCommand({ RoleName: roleName }));
    logger.info(`ℹ️ IAM Role '${roleName}' already exists, reusing ARN.`);
    if (!roleRes.Role || !roleRes.Role.Arn) {
      throw new Error(`❌ Found role '${roleName}' but its Amazon Resource Name is missing.`);
    }
    return roleRes.Role.Arn;
  } catch (error: any) {
    if (error.name === "NoSuchEntityException" || error.name === "NoSuchEntity") {
      logger.info(`🔧 Creating new IAM Role: ${roleName}...`);
      const createRes = await iamClient.send(new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: assumeRolePolicyDocument,
      }));
      
      // Inject a short delay to allow for AWS IAM eventual consistency propagation.
      await new Promise(resolve => setTimeout(resolve, 5000));
      if (!createRes.Role || !createRes.Role.Arn) {
        throw new Error("❌ IAM Role creation failed: ARN not returned.");
      }
      return createRes.Role.Arn;
    }
    throw error;
  }
}

/**
 * Automation: Local Build, Tag, and Push to AWS ECR.
 * This function handles the entire container deployment pipeline.
 */
async function autoPushDockerImage(repositoryUri: string) {
    logger.info(`\n🐳 Initiating Docker authentication with AWS ECR...`);
    
    // Step 1: Fetch a temporary authorization token from ECR.
    const authRes = await ecrClient.send(new GetAuthorizationTokenCommand({}));
    if (!authRes.authorizationData || authRes.authorizationData.length === 0) {
        throw new Error("❌ ECR Authorization failed: No data returned.");
    }
    
    const authData = authRes.authorizationData[0];
    if (!authData || !authData.authorizationToken || !authData.proxyEndpoint) {
        throw new Error("❌ ECR Authorization failed: Token or Endpoint missing.");
    }
    
    // Step 2: Decode the Base64 token and run 'docker login'.
    const decodedToken = Buffer.from(authData.authorizationToken, "base64").toString("utf-8");
    const parts = decodedToken.split(":"); // Format is 'AWS:PASSWORD'.
    const password = parts[1];
    const endpoint = authData.proxyEndpoint;

    logger.info(`🔐 Securely logging into ECR registry: ${endpoint}...`);
    execSync(`docker login --username AWS --password ${password} ${endpoint}`, { stdio: "inherit" });

    // Step 3: Build the Docker image locally from the project root.
    logger.info(`\n🔨 Compiling local Docker image: ${CONTAINER_NAME}:latest...`);
    // Find the build root (transcoding-container directory).
    const buildContext = path.join(process.cwd(), "..", "transcoding-container");
    execSync(`docker build -t transcoding-container:latest ${buildContext}`, { stdio: "inherit" });

    // Step 4: Tag the local image with the remote ECR URI.
    logger.info(`🏷️ Tagging image for remote registry...`);
    execSync(`docker tag transcoding-container:latest ${repositoryUri}:latest`, { stdio: "inherit" });

    // Step 5: Push the image upstream to AWS.
    logger.info(`🚀 Pushing container image to Cloud (Network intensive)...`);
    execSync(`docker push ${repositoryUri}:latest`, { stdio: "inherit" });
    
    logger.info(`✅ Image deployment successful!`);
}

/**
 * Primary Infrastructure Orchestration Function.
 */
async function setupECS() {
  logger.info("🚀 Starting end-to-end AWS ECS Fargate environment provisioning...");

  try {
    // --- 1. IAM SECURITY ARCHITECTURE ---
    // Trust document allowing ECS tasks to assume these roles.
    const ecsAssumeRolePolicy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [{
        Effect: "Allow",
        Principal: { Service: "ecs-tasks.amazonaws.com" },
        Action: "sts:AssumeRole"
      }]
    });

    // EXECUTION ROLE: Permission to pull images from ECR and write logs to CloudWatch.
    const executionRoleArn = await getOrCreateRole("VideoTranscodingTaskExecutionRole", ecsAssumeRolePolicy);
    await iamClient.send(new AttachRolePolicyCommand({
      RoleName: "VideoTranscodingTaskExecutionRole",
      PolicyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
    }));

    // TASK ROLE: Internal container permissions (Full admin for this demo to allow S3/DB access).
    const taskRoleArn = await getOrCreateRole("VideoTranscodingTaskRole", ecsAssumeRolePolicy);
    await iamClient.send(new AttachRolePolicyCommand({
      RoleName: "VideoTranscodingTaskRole",
      PolicyArn: "arn:aws:iam::aws:policy/AdministratorAccess"
    }));
    logger.info("✅ IAM Security Roles verified.");

    // --- 2. ECR REGISTRY PROVISIONING ---
    let repositoryUri = "";
    try {
      // Check if the repository already exists.
      const ecrRes = await ecrClient.send(new DescribeRepositoriesCommand({ repositoryNames: ["transcoding-container"] }));
      repositoryUri = ecrRes.repositories?.[0]?.repositoryUri || "";
      logger.info(`ℹ️ ECR Repository already active.`);
    } catch (error: any) {
      if (error.name === "RepositoryNotFoundException") {
        // Create the repository if missing.
        logger.info(`🔧 Provisioning new ECR Repository: transcoding-container...`);
        const createEcr = await ecrClient.send(new CreateRepositoryCommand({ repositoryName: "transcoding-container" }));
        repositoryUri = createEcr.repository?.repositoryUri || "";
      } else throw error;
    }
    const containerImageUri = `${repositoryUri}:latest`;

    // --- 3. DOCKER IMAGE DEPLOYMENT ---
    // Automate the local build and remote push cycle.
    await autoPushDockerImage(repositoryUri);

    // --- 4. ECS CLUSTER PROVISIONING ---
    logger.info(`🔧 Creating ECS Cluster: video-transcoding-cluster...`);
    const clusterRes = await ecsClient.send(new CreateClusterCommand({ clusterName: "video-transcoding-cluster" }));
    const clusterArn = clusterRes.cluster?.clusterArn || "";
    logger.info(`✅ ECS Cluster ready.`);

    // --- 5. CLOUDWATCH LOGGING CONFIGURATION ---
    const logGroupName = `/ecs/${CONTAINER_NAME}`;
    logger.info(`🔧 Syncing CloudWatch Log Group: ${logGroupName}...`);
    try {
        await cwLogsClient.send(new CreateLogGroupCommand({ logGroupName }));
    } catch (error: any) {
        if (error.name !== "ResourceAlreadyExistsException") throw error;
    }

    // Apply a 7-day TTL to logs to strictly control AWS costs.
    await cwLogsClient.send(new PutRetentionPolicyCommand({ logGroupName, retentionInDays: 7 }));
    logger.info(`✅ Logging retention and policies enforced.`);

    // --- 6. TASK DEFINITION REGISTRATION ---
    // This 'blueprint' tells ECS exactly how to launch our transcoding containers.
    logger.info(`🔧 Registering ECS Task Definition: video-transcoding-task...`);
    const taskDefRes = await ecsClient.send(new RegisterTaskDefinitionCommand({
        family: "video-transcoding-task",
        cpu: "256",    // Smallest Fargate tier for cost efficiency.
        memory: "512",
        networkMode: "awsvpc", // Required for Fargate.
        requiresCompatibilities: ["FARGATE"],
        executionRoleArn,
        taskRoleArn,
        containerDefinitions: [
            {
                name: CONTAINER_NAME,
                image: containerImageUri,
                essential: true,
                environment: [
                    // Provide baseline AWS context to the container.
                    { name: "AWS_REGION", value: AWS_REGION },
                    { name: "AWS_ACCESS_KEY_ID", value: AWS_ACCESS_KEY_ID },
                    { name: "AWS_SECRET_ACCESS_KEY", value: AWS_SECRET_ACCESS_KEY },
                    { name: "S3_BUCKET_NAME", value: S3_BUCKET_NAME },
                ],
                logConfiguration: {
                    logDriver: "awslogs",
                    options: {
                        "awslogs-group": logGroupName,
                        "awslogs-region": region,
                        "awslogs-stream-prefix": "ecs"
                    }
                }
            }
        ]
    }));
    const taskDefArn = taskDefRes.taskDefinition?.taskDefinitionArn || "";
    logger.info(`✅ Task blueprint (Definition) registered.`);

    // --- 7. AUTOMATED NETWORK DISCOVERY ---
    logger.info(`🔍 Discovering Default VPC networking requirements...`);
    
    // Find the Default VPC in the region.
    const vpcs = await ec2Client.send(new DescribeVpcsCommand({ Filters: [{ Name: "isDefault", Values: ["true"] }] }));
    const defaultVpcId = vpcs.Vpcs?.[0]?.VpcId || "";
    if (!defaultVpcId) throw new Error("No default VPC found. ECS Networking cannot be resolved.");

    // Map all Subnet IDs within that VPC.
    const subnets = await ec2Client.send(new DescribeSubnetsCommand({ Filters: [{ Name: "vpc-id", Values: [defaultVpcId] }] }));
    const subnetIds = (subnets.Subnets || []).map(s => s.SubnetId).join(",");

    // Identify the 'default' Security Group (Firewall).
    const securityGroups = await ec2Client.send(new DescribeSecurityGroupsCommand({ Filters: [{ Name: "vpc-id", Values: [defaultVpcId] }, { Name: "group-name", Values: ["default"] }] }));
    const securityGroupId = securityGroups.SecurityGroups?.[0]?.GroupId || "";

    // --- 8. CONFIGURATION FINALIZATION ---
    // Inject all resolved Cloud ARNs and Network IDs into the local .env file.
    updateEnv("ECS_CLUSTER_ARN", clusterArn);
    updateEnv("ECS_TASK_DEFINITION_ARN", taskDefArn);
    updateEnv("ECS_CONTAINER_NAME", CONTAINER_NAME);
    updateEnv("ECS_SUBNETS", subnetIds);
    updateEnv("ECS_SECURITY_GROUPS", securityGroupId);

    logger.info(`\n🎉 ECS Infrastructure Provisioned! .env updated automatically.`);
    logger.info(`✅ Compute engine and container registry are fully operational.`);
    
  } catch (error) {
    // Handle fatal setup exceptions.
    logger.error("❌ Infrastructure Setup failed:", error);
    process.exit(1);
  }
}

// Execute the async setup process.
setupECS().then(() => {
  process.exit(0);
});

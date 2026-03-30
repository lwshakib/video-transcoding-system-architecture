/**
 * AWS ECS Infrastructure Setup Script.
 * This script automates a comprehensive AWS Fargate setup including:
 * 1. IAM Roles (Execution and Task Roles).
 * 2. ECR Repository for the build container.
 * 3. Automatic Docker image build and push to ECR.
 * 4. ECS Cluster and CloudWatch Log Group creation.
 * 5. ECS Task Definition registration.
 * 6. Default VPC/Networking discovery and .env updates.
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
const ec2Client = new EC2Client({ region, credentials });
const cwLogsClient = new CloudWatchLogsClient({ region, credentials });

// Static constant for the transcoding container name
const CONTAINER_NAME = "transcoding-container";

/**
 * Utility function to find or create an IAM role with a given policy.
 */
async function getOrCreateRole(roleName: string, assumeRolePolicyDocument: string) {
  try {
    const roleRes = await iamClient.send(new GetRoleCommand({ RoleName: roleName }));
    logger.info(`ℹ️ IAM Role ${roleName} already exists.`);
    if (!roleRes.Role || !roleRes.Role.Arn) {
      throw new Error(`❌ Role ${roleName} found but Arn is missing.`);
    }
    return roleRes.Role.Arn;
  } catch (error: any) {
    if (error.name === "NoSuchEntityException" || error.name === "NoSuchEntity") {
      logger.info(`🔧 Creating IAM Role: ${roleName}...`);
      const createRes = await iamClient.send(new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: assumeRolePolicyDocument,
      }));
      
      // Wait for AWS IAM propagation delay
      await new Promise(resolve => setTimeout(resolve, 5000));
      if (!createRes.Role || !createRes.Role.Arn) {
        throw new Error("❌ Role created but Arn is missing.");
      }
      return createRes.Role.Arn;
    }
    throw error;
  }
}

/**
 * Automates the build and push of the local Docker image to AWS ECR.
 */
async function autoPushDockerImage(repositoryUri: string) {
    logger.info(`\n🐳 Authenticating Docker with AWS ECR...`);
    const authRes = await ecrClient.send(new GetAuthorizationTokenCommand({}));
    if (!authRes.authorizationData || authRes.authorizationData.length === 0) {
        throw new Error("❌ No authorization data returned from ECR");
    }
    
    // Extract authentication token
    const authData = authRes.authorizationData[0];
    if (!authData || !authData.authorizationToken || !authData.proxyEndpoint) {
        throw new Error("❌ Malformed authorization data returned from ECR");
    }
    
    // Decode token and execute docker login
    const decodedToken = Buffer.from(authData.authorizationToken, "base64").toString("utf-8");
    const parts = decodedToken.split(":");
    if (parts.length < 2) {
        throw new Error("❌ Decoded authorization token is malformed");
    }
    const password = parts[1];
    const endpoint = authData.proxyEndpoint;

    logger.info(`🔐 Logging into ECR: ${endpoint}...`);
    execSync(`docker login --username AWS --password ${password} ${endpoint}`, { stdio: "inherit" });

    // Build the Docker image locally from the transcoding-container directory
    logger.info(`\n🔨 Building Docker image: transcoding-container:latest...`);
    const buildContext = path.join(process.cwd(), "..", "transcoding-container");
    execSync(`docker build -t transcoding-container:latest ${buildContext}`, { stdio: "inherit" });

    // Tag and Push the image
    logger.info(`🏷️ Tagging local image...`);
    execSync(`docker tag transcoding-container:latest ${repositoryUri}:latest`, { stdio: "inherit" });

    logger.info(`🚀 Pushing image to ECR (This will take a few minutes)...`);
    execSync(`docker push ${repositoryUri}:latest`, { stdio: "inherit" });
    
    logger.info(`✅ Image automatically pushed to ECR!`);
}

/**
 * Comprehensive Setup function for ECS Fargate.
 */
async function setupECS() {
  logger.info("🚀 Starting comprehensive AWS ECS Fargate setup...");

  try {
    // 1. IAM Roles Setup: Execution and Task Roles
    const ecsAssumeRolePolicy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [{
        Effect: "Allow",
        Principal: { Service: "ecs-tasks.amazonaws.com" },
        Action: "sts:AssumeRole"
      }]
    });

    // Create or Verify Task Execution Role (responsible for pulling images and logging)
    const executionRoleArn = await getOrCreateRole("ReactAppDeployTaskExecutionRole", ecsAssumeRolePolicy);
    await iamClient.send(new AttachRolePolicyCommand({
      RoleName: "ReactAppDeployTaskExecutionRole",
      PolicyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
    }));

    // Create or Verify Task Role (the role the actual running container assumes)
    const taskRoleArn = await getOrCreateRole("ReactAppDeployTaskRole", ecsAssumeRolePolicy);
    await iamClient.send(new AttachRolePolicyCommand({
      RoleName: "ReactAppDeployTaskRole",
      PolicyArn: "arn:aws:iam::aws:policy/AdministratorAccess"
    }));
    logger.info("✅ IAM Roles configured.");

    // 2. ECR Repository Setup for Transcoding Container
    let repositoryUri = "";
    try {
      const ecrRes = await ecrClient.send(new DescribeRepositoriesCommand({ repositoryNames: ["transcoding-container"] }));
      const repos = ecrRes.repositories;
      const firstRepo = repos?.[0];
      if (!firstRepo || !firstRepo.repositoryUri) {
        throw new Error("❌ ECR repository found but URI is missing.");
      }
      repositoryUri = firstRepo.repositoryUri;
      logger.info(`ℹ️ ECR Repo transcoding-container exists.`);
    } catch (error: any) {
      if (error.name === "RepositoryNotFoundException") {
        logger.info(`🔧 Creating ECR Repository: transcoding-container...`);
        const createEcr = await ecrClient.send(new CreateRepositoryCommand({ repositoryName: "transcoding-container" }));
        const repo = createEcr.repository;
        if (!repo || !repo.repositoryUri) {
          throw new Error("❌ ECR repository created but URI is missing.");
        }
        repositoryUri = repo.repositoryUri;
      } else throw error;
    }
    const containerImageUri = `${repositoryUri}:latest`;
    logger.info(`✅ ECR URI: ${containerImageUri}`);

    // Automatically build and push the container image
    await autoPushDockerImage(repositoryUri);

    // 3. ECS Cluster Setup
    logger.info(`🔧 Creating ECS Cluster: react-app-deploy-cluster...`);
    const clusterRes = await ecsClient.send(new CreateClusterCommand({ clusterName: "react-app-deploy-cluster" }));
    const cluster = clusterRes.cluster;
    if (!cluster || !cluster.clusterArn) {
      throw new Error("❌ ECS Cluster created but Arn is missing.");
    }
    const clusterArn = cluster.clusterArn;
    logger.info(`✅ ECS Cluster created / verified.`);

    // 4. CloudWatch Logging Setup
    const logGroupName = `/ecs/${CONTAINER_NAME}`;
    logger.info(`🔧 Ensuring CloudWatch Log Group: ${logGroupName}...`);
    try {
        await cwLogsClient.send(new CreateLogGroupCommand({ logGroupName }));
        logger.info(`✅ Log Group ${logGroupName} created.`);
    } catch (error: any) {
        if (error.name === "ResourceAlreadyExistsException") {
            logger.info(`ℹ️ Log Group ${logGroupName} already exists.`);
        } else throw error;
    }

    // Configure Log Retention (7 days)
    await cwLogsClient.send(new PutRetentionPolicyCommand({ logGroupName, retentionInDays: 7 }));
    logger.info(`✅ Log Group retention set to 7 days.`);

    // 5. Task Definition Registration for Transcoding
    logger.info(`🔧 Registering ECS Task Definition: video-transcode-task...`);
    const taskDefRes = await ecsClient.send(new RegisterTaskDefinitionCommand({
        family: "video-transcode-task",
        cpu: "256",
        memory: "512",
        networkMode: "awsvpc",
        requiresCompatibilities: ["FARGATE"],
        executionRoleArn,
        taskRoleArn,
        containerDefinitions: [
            {
                name: CONTAINER_NAME,
                image: containerImageUri,
                essential: true,
                environment: [
                  { name: "AWS_REGION", value: AWS_REGION },
                  { name: "AWS_ACCESS_KEY_ID", value: AWS_ACCESS_KEY_ID },
                  { name: "AWS_SECRET_ACCESS_KEY", value: AWS_SECRET_ACCESS_KEY },
                  { name: "S3_BUCKET_NAME", value: S3_BUCKET_NAME },
                ],
                logConfiguration: {
                    logDriver: "awslogs",
                    options: {
                        "awslogs-group": `/ecs/${CONTAINER_NAME}`,
                        "awslogs-region": region,
                        "awslogs-stream-prefix": "ecs"
                    }
                }
            }
        ]
    }));
    const taskDef = taskDefRes.taskDefinition;
    if (!taskDef || !taskDef.taskDefinitionArn) {
      throw new Error("❌ ECS Task Definition registered but Arn is missing.");
    }
    const taskDefArn = taskDef.taskDefinitionArn;
    logger.info(`✅ ECS Task Definition registered.`);

    // 6. Network Discovery (Default VPC, Subnets, and Security Groups)
    logger.info(`🔍 Auto-discovering Default VPC networking...`);
    const vpcs = await ec2Client.send(new DescribeVpcsCommand({ Filters: [{ Name: "isDefault", Values: ["true"] }] }));
    const vpc = vpcs.Vpcs?.[0];
    if (!vpc || !vpc.VpcId) throw new Error("No default VPC found in this region.");
    const defaultVpcId = vpc.VpcId;
    logger.info(`🔍 Default VPC ID: ${defaultVpcId}`);

    // Discover all subnets in the default VPC
    const subnets = await ec2Client.send(new DescribeSubnetsCommand({ Filters: [{ Name: "vpc-id", Values: [defaultVpcId] }] }));
    const subnetIds = (subnets.Subnets || []).map(s => s.SubnetId).filter((id): id is string => !!id).join(",");

    // Discover the default security group
    const securityGroups = await ec2Client.send(new DescribeSecurityGroupsCommand({ Filters: [{ Name: "vpc-id", Values: [defaultVpcId] }, { Name: "group-name", Values: ["default"] }] }));
    const securityGroupId = securityGroups.SecurityGroups?.[0]?.GroupId || "";
    logger.info(`✅ Discovered Network details.`);

    // 7. Update .env file with discovered and created infrastructure details
    updateEnv("ECS_CLUSTER_ARN", clusterArn);
    updateEnv("ECS_TASK_DEFINITION_ARN", taskDefArn);
    updateEnv("ECS_CONTAINER_NAME", CONTAINER_NAME);
    updateEnv("ECS_SUBNETS", subnetIds);
    updateEnv("ECS_SECURITY_GROUPS", securityGroupId);

    logger.info(`\n🎉 ECS Setup Complete! Your server/.env was automatically updated.`);
    logger.info(`✅ The infrastructure and ECR image are fully deployed and ready for use!`);
    
  } catch (error) {
    logger.error("❌ ECS Setup failed:", error);
    process.exit(1);
  }
}

setupECS().then(() => {
  process.exit(0);
});

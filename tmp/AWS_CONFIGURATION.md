# AWS Configuration & Deployment Guide

This document provides a comprehensive guide for provisioning the cloud infrastructure required for the **Video Transcoding System**. You can choose between two deployment paths:

1.  **Path A: Automated Orchestration (Recommended)**: Uses pre-configured scripts to provision security roles, message queues, container registries, and compute clusters.
2.  **Path B: Manual Infrastructure Provisioning**: Detailed steps for users who prefer to configure every AWS resource manually via the Console.

---

## 🚀 Path A: Automated Orchestration (Recommended)

This path is the fastest way to get the system operational. It relies on administrative scripts located in the `server` directory to handle all complex AWS configurations.

### 1. IAM Administrative Prerequisite
Before running the automation, you need a set of credentials with sufficient privileges to create other IAM roles and resources.

1.  **Create IAM Admin**: 
    - Go to **IAM Console** -> **Users** -> **Create User**.
    - Name: `transcoding-setup-admin`.
    - Permissions: Attach **`AdministratorAccess`** (This user will be used to run the setup scripts).
2.  **Generate Access Keys**:
    - Under the **Security Credentials** tab, create **Access Keys** (CLI usage).
    - **Save the `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` safely.**

### 2. Manual Service Prerequisites
Even with automation, you must manually provide the following persistent resources:

1.  **S3 Bucket**: Create a bucket (e.g., `my-transcoding-bucket`) in your preferred region.
2.  **PostgreSQL**: Provision a database (RDS or [Neon](https://neon.tech/)) and obtain the `DATABASE_URL`.

### 3. Initialize & Execute Setup
Navigate to the `server` directory and configure your `.env` file first:

```env
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET_NAME=my-transcoding-bucket
DATABASE_URL=postgres://...
```

Run the orchestration lifecycle:
```bash
# In the /server directory
bun run infra:setup
```

**Automation Breakdown:**
- **IAM Security**: Provisions `VideoTranscodingTaskExecutionRole` and `VideoTranscodingTaskRole`.
- **ECR Registry**: Creates the `transcoding-container` repository.
- **Docker Integration**: Authenticates, builds, tags, and pushes the worker image.
- **ECS Compute**: Creates the cluster and registers the `video-transcoding-task` definition.
- **SQS Messaging**: Provisions the transcoding job queue and updates your `.env` with the URL.
- **Network Discovery**: Automatically maps the Default VPC subnets and security groups.


---

## 🛠️ Path B: Manual Infrastructure Provisioning

This path is for users who want full control over their AWS environment. Follow these steps in order to ensure all permissions and resources are compatible with the application code.

### 1. IAM Task Roles
The transcoding worker needs specific permissions to function. 
1.  **Create Execution Role**: 
    - Name: `VideoTranscodingTaskExecutionRole`.
    - Trusted Entity: `ecs-tasks.amazonaws.com`.
    - Policy: Attach **`AmazonECSTaskExecutionRolePolicy`**.
2.  **Create Task Role**:
    - Name: `VideoTranscodingTaskRole`.
    - Trusted Entity: `ecs-tasks.amazonaws.com`.
    - Policy: For initial setup, attach **`AdministratorAccess`**. (In production, restrict to specific S3, SQS, and CloudWatch permissions).

### 2. S3 Bucket Configuration
1.  **Create Bucket**: Name it (e.g., `my-videos`) and disable **"Block all public access"**.
2.  **CORS Policy**: Under the **Permissions** tab, add this CORS configuration to allow browser uploads:
    ```json
    [
      {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
        "AllowedOrigins": ["*"],
        "ExposeHeaders": ["ETag"]
      }
    ]
    ```
3.  **Public Access Policy**: Add this policy to allow public HLS streaming:
    ```json
    {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Sid": "PublicRead",
          "Effect": "Allow",
          "Principal": "*",
          "Action": "s3:GetObject",
          "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
        }
      ]
    }
    ```

### 3. SQS Queue Setup
1.  Create a **Standard Queue** named `video-transcoding-queue`.
2.  Set the **Visibility Timeout** to 15 minutes (to account for long transcoding jobs).
3.  Copy the **Queue URL**.

### 4. ECR & Container Deployment
1.  **Create Repository**: Go to ECR -> Private -> Create Repository named `transcoding-container`.
2.  **Push Image**: Use the **"View push commands"** button in ECR to build and push the local `/transcoding-container` source.

### 5. ECS Fargate Setup
1.  **Create Cluster**: Use the "Fargate only" template. Name: `video-transcoding-cluster`.
2.  **Register Task Definition**:
    - Family: `video-transcoding-task`.
    - Infrastructure: **Fargate**.
    - Memory: `0.5 GB`, CPU: `0.25 vCPU`.
    - Roles: Use the `ExecutionRole` and `TaskRole` created in Step 1.
    - Container: Name it `transcoding-container`, use the **ECR Image URI**, and enable **CloudWatch Logs**.

---

## 🏗️ Detailed Environment Reference

| Variable | Description | Requirement |
| :--- | :--- | :--- |
| `AWS_REGION` | The global AWS region (e.g., `us-east-1`) | Required |
| `AWS_ACCESS_KEY_ID` | API User Access Key | Required |
| `AWS_SECRET_ACCESS_KEY` | API User Secret Key | Required |
| `S3_BUCKET_NAME` | Name of the video storage bucket | Required |
| `DATABASE_URL` | Postgres Connection String | Required |
| `AWS_SQS_QUEUE_URL` | The endpoint for transcoding jobs | Required |
| `ECS_CLUSTER_ARN` | ARN of the compute cluster | Required |
| `ECS_TASK_DEFINITION_ARN` | ARN of the worker task blueprint | Required |
| `ECS_CONTAINER_NAME` | Must match task definition (`transcoding-container`) | Required |
| `ECS_SUBNETS` | Comma-separated list of VPC Subnets | Required |
| `ECS_SECURITY_GROUPS` | Comma-separated list of Security Groups | Required |

---

## 🔄 Teardown & Reset

If you need to purge the infrastructure and start from scratch, use the integrated reset utility:
```bash
# In the /server directory
bun run infra:reset
```
*Caution: This will delete all ECS tasks, ECR images, SQS queues, and S3 objects permanently.*


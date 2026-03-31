# AWS Configuration & Deployment Guide

This document details the configuration of the AWS infrastructure for the 
Video Transcoding System. It covers both the manual prerequisites and the 
automated provisioning scripts.

---

## 🛠️ Manual Prerequisites

Before running the automated setup, you must manually configure the 
following resources in the AWS Console:

### 1. IAM Admin User
1.  Go to the IAM Console -> Users -> Create User.
2.  Provide a name (e.g., `transcoding-admin`).
3.  Attach the **`AdministratorAccess`** managed policy (Needed for initial 
    setup only).
4.  Once created, navigate to the user's **Security Credentials** tab and 
    create **Access Keys**.
5.  **Save the `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` safely.**

### 2. S3 Bucket
1.  Create an S3 bucket (e.g., `video-transcoding-uploads`).
2.  Enable **Public Access** (The setup script will attach a specific policy 
    later).
3.  Note the **Bucket Name** and **AWS Region** (e.g., `ap-south-1`).

### 3. PostgreSQL Database
1.  Provision a PostgreSQL instance (e.g., [Neon](https://neon.tech/) or RDS).
2.  Obtain the **Connection String** (`DATABASE_URL`).

---

## 🚀 Automated Infrastructure Setup

The automated orchestration relies on the IAM credentials you created in the 
Manual Prerequisites. **You must add these keys to your `.env` file before 
executing the setup script.**

### Step 1: Initialize Environment
Navigate to the `server` directory and update your `.env` file with your 
manual prerequisites:

```env
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=YOUR_ACCESS_KEY    # <-- Required for script execution
AWS_SECRET_ACCESS_KEY=YOUR_SECRET_KEY # <-- Required for script execution
S3_BUCKET_NAME=YOUR_BUCKET_NAME
DATABASE_URL=YOUR_POSTGRES_URL
```

### Step 2: Run Orchestration Script
With the credentials in place, run the following command. The script will 
automatically provision all remaining cloud resources.
Execute the following commands in the `server` directory:
```bash
bun run infra:setup
```

**What this script does:**
1.  **IAM Security**: Provisions the `VideoTranscodingTaskExecutionRole` and 
    `VideoTranscodingTaskRole` for ECS tasks.
2.  **ECR Registry**: Creates the `transcoding-container` repository and 
    authenticates Docker.
3.  **Docker Build**: Compiles the local transcoding worker and pushes it to 
    the cloud registry.
4.  **ECS Execution**: Creates the `video-transcoding-cluster` and registers 
    the `video-transcoding-task` definition.
5.  **Networking**: Automatically discovers your Default VPC subnets and 
    security groups.
6.  **Messaging**: Creates the SQS queue and updates your `.env` with the 
    resulting ARNs.

---

## 🏗️ Detailed Environment Reference

| Variable | Description | Source |
| :--- | :--- | :--- |
| `AWS_REGION` | The AWS region used for all services. | Manual |
| `S3_BUCKET_NAME` | The bucket for source/processed videos. | Manual |
| `AWS_SQS_QUEUE_URL` | The endpoint for transcoding messages. | Script |
| `ECS_CLUSTER_ARN` | The identifier for the compute cluster. | Script |
| `ECS_TASK_DEFINITION_ARN` | The blueprint for the worker task. | Script |
| `ECS_SUBNETS` | Network paths for Fargate execution. | Script |
| `ECS_SECURITY_GROUPS` | Firewall rules for the worker. | Script |

---

## 🔄 Teardown & Reset

If you need to purge the infrastructure and start from scratch, use the 
integrated reset utility:
```bash
bun run infra:reset
```
*Caution: This will delete all ECS tasks, ECR images, SQS queues, and S3 
objects permanently.*

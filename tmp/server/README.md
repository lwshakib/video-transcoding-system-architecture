# Video Transcoding API (Server)

The central orchestrator for the video transcoding system. This Node.js 
Express server handles the logic for S3 pre-signed URLs, PostgreSQL 
metadata, and SQS task management.

---

## 🛠️ Main Features

- **Upload Orchestration**: Secure, signed URL generation for direct-to-S3 
  binary uploads.
- **Task Dispatching**: Automated SQS job creation for background processing.
- **Compute Management**: Tracking for AWS ECS Fargate tasks and local 
  Docker worker containers.
- **Telemetry**: Structured Winston logging with environment-specific 
  transports.
- **Infrastructure Scripts**: Automated `infra:setup` and `infra:reset` 
  utilities for entire AWS environments.

---

## 🚀 Development Setup

### 1. Prerequisites
- [Bun](https://bun.sh/)
- [PostgreSQL](https://www.postgresql.org/)
- [AWS Keys](./AWS_CONFIGURATION.md)

### 2. Basic Setup
```bash
bun install
```

### 3. Environment Variables
Copy `.env.example` to `.env` and configure accordingly:
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `S3_BUCKET_NAME`
- `DATABASE_URL`

### 4. Run Development Server
```bash
bun run dev
```

---

## 📡 API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| **GET** | `/videos` | List all videos in the library. |
| **GET** | `/videos/:id` | Get detailed metadata for a specific video. |
| **GET** | `/videos/upload-url` | Generate a secure S3 pre-signed path. |
| **POST** | `/videos` | Create a new video record in PostgreSQL. |
| **POST** | `/videos/:id/start` | Trigger the transcoding job via SQS. |
| **DELETE** | `/videos/:id` | Delete a video and all HLS segments from S3. |

---

## 🏗️ Technical Architecture

- **PostgreSQL (Neon)**: Relational schema for tracking video states, 
  original S3 keys, and HLS master playlist locations.
- **AWS SQS**: The messaging layer that decouples the API from high-compute 
  worker tasks.
- **Morgan + Winston**: Integrated logging system for HTTP audits and 
  service-level telemetry.

For more details on the event-driven system architecture, see the 
**[Architecture Documentation](../ARCHITECTURE.md)**.

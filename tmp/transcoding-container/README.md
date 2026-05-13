# Transcoding Worker (Bun + FFmpeg)

The compute engine for the video transcoding system. This worker processes 
asynchronous jobs from SQS, generates HLS segments, and performs AI-driven 
speech-to-text.

---

## 🛠️ Main Features

- **HLS Segmenting**: FFmpeg generates optimized .m3u8 playlists and .ts segments.
- **Adaptive Bitrate**: Multi-resolution transcoding (1080p, 720p, 480p).
- **Vosk AI**: Professional-grade speech-to-text engine for WebVTT subtitles.
- **S3 Synchronization**: Binary file orchestration for source downloads 
  and processed artifacts.
- **PostgreSQL Updates**: Real-time job status tracking via direct database 
  connections.

---

## 🚀 Development Setup

### 1. Prerequisites
- [Bun](https://bun.sh/)
- [FFmpeg](https://ffmpeg.org/) (Ensure it's in your PATH)
- [Python 3](https://www.python.org/) (With `vosk` and `pydub` installed)
- [Docker](https://www.docker.com/) (For local container execution)

### 2. Environment Variables
Copy `.env.example` to `.env` and configure accordingly:
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `S3_BUCKET_NAME`
- `DATABASE_URL`

### 3. Run Locally (Node Mode)
```bash
bun install
bun run dev
```

### 4. Run Locally (Docker Mode)
```bash
docker build -t transcoding-container:latest .
docker run --env-file .env transcoding-container:latest
```

---

## 🏗️ Processing Pipeline

1.  **Ingestion**: Downloads the primary source from S3 based on the SQS payload.
2.  **Analysis**: Runs `ffprobe` to gather source metadata.
3.  **Transcode**: FFmpeg converts the source into segments and HLS playlists.
4.  **STT (Speech-to-Text)**:
    - Extracts the audio to a temporary `.wav` file.
    - Runs the custom **[transcribe.py](./src/transcribe.py)** script using Vosk.
    - Generates high-fidelity WebVTT and `.txt` segments.
5.  **Finalize**:
    - Generates video thumbnails (1080p).
    - Uploads all assets to the assigned S3 folder.
    - Sets the video status to `COMPLETED` in PostgreSQL.

For more details on the event-driven system architecture, see the 
**[Architecture Documentation](../ARCHITECTURE.md)**.

# Video Transcoding Web Dashboard (Frontend)

The modern, responsive user interface for the video transcoding system. 
Built with Next.js, this dashboard provides real-time upload progress, 
video management, and an advanced HLS media player.

---

## 🛠️ Main Features

- **Optimistic UI**: Real-time upload feedback with percentage tracking 
  before the server record exists.
- **Custom HLS Player**: High-fidelity media player with adaptive bitrate 
  switching (1080p, 720p, 480p).
- **Subtitles & Captions**: Native VTT support powered by AI-generated 
  speech-to-text.
- **Library Management**: Dynamic video list with status badges (Queued, 
  Processing, Completed).
- **Direct S3 Upload**: Bypasses the API server for binary transfers using 
  secure pre-signed URLs.

---

## 🚀 Development Setup

### 1. Prerequisites
- [Bun](https://bun.sh/)
- [Node.js 18+](https://nodejs.org/)

### 2. Basic Setup
```bash
bun install
```

### 3. Environment Variables
Copy `.env.example` to `.env.local` and configure accordingly:
- `NEXT_PUBLIC_API_URL` (Normally `http://localhost:8000`)

### 4. Run Development Server
```bash
bun run dev
```

---

## 🏗️ Technical Architecture

- **Next.js (App Router)**: Modern React framework for high-performance 
  rendering and routing.
- **Tailwind CSS + Radix UI**: Sleek, accessible design system with 
  premium shadow effects.
- **Hls.js**: Adaptive bitrate streaming engine for .m3u8 playback across 
  all modern browsers.
- **Lucide Icons**: Consistent, high-fidelity iconography.

### Key Components
- **`VideoUpload`**: Orchestrates the multi-stage upload sequence.
- **`VideoList`**: Renders the library with dynamic state indicators.
- **`VideoPlayer`**: Advanced custom controls for HLS playback and 
  scrubbing.

For more details on the event-driven system architecture, see the 
**[Architecture Documentation](../ARCHITECTURE.md)**.

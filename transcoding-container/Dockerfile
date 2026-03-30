FROM ubuntu:latest

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    unzip \
    python3 \
    python3-pip \
    python3-venv \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

# Create a virtual environment for Python dependencies
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir vosk

# Download small English model for Vosk
RUN wget -q https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip \
    && unzip vosk-model-small-en-us-0.15.zip \
    && mv vosk-model-small-en-us-0.15 model \
    && rm vosk-model-small-en-us-0.15.zip

# Copy dependency files and install
COPY package.json bun.lock ./
RUN bun install

# Copy application source
COPY . .

# Build the TypeScript project
RUN bun run build

# Ensure required directories exist
RUN mkdir -p /tmp /mnt/original /mnt/transcoded

# Copy Python transcription script to the root so it's accessible to the worker
RUN cp src/transcribe.py transcribe.py

WORKDIR /app

# Run the container from the root, pointing to the compiled JS in dist/
CMD ["bun", "dist/index.js"]

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

# The script expects transcribe.py to be in the same directory as index.js
# or we can adjust the path in index.ts. 
# Our transcribe.py is in src/transcribe.py, and index.ts calls it as 'transcribe.py'.
# So we should copy src/transcribe.py to the root or dist/ folder.
RUN cp src/transcribe.py dist/transcribe.py

WORKDIR /app/dist

CMD ["bun", "dist/index.js"]

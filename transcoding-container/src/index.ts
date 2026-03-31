/**
 * Video Transcoding Worker - Main Entry Point.
 * This script orchestrates the complete video processing pipeline:
 * 1. Database status updates (Processing/Completed/Failed).
 * 2. Downloading source assets from AWS S3.
 * 3. Extracting video metadata (Resolution, Duration) using FFprobe.
 * 4. Generating Multi-bitrate HLS (HTTP Live Streaming) playlists and segments using FFmpeg.
 * 5. Creating high-resolution thumbnails and time-based preview snapshots.
 * 6. Running an AI-driven Speech-to-Text pipeline to generate VTT subtitles.
 * 7. Finalizing asset deployment back to S3.
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { glob } from 'glob';
import logger from './logger/winston.logger';
import { s3Service } from './services/s3.services';
import { postgresService } from './services/postgres.services';
import { VIDEO_ID, VIDEO_URL } from './envs';

/**
 * Utility helper to execute shell commands (ffmpeg, ffprobe, python3).
 * Uses child_process.spawn for better performance and real-time output handling.
 * @param cmd - The command to run (e.g., 'ffmpeg').
 * @param args - Array of CLI arguments.
 * @returns A Promise that resolves with the command output or rejects on error.
 */
const runCommand = (cmd: string, args: string[]): Promise<string> => {
  return new Promise((resolve, reject) => {
    logger.info(`Executing: ${cmd} ${args.join(' ')}`);
    const child = spawn(cmd, args);

    let stdout = '';
    let stderr = '';

    // Capture standard output from the running process.
    child.stdout.on('data', (data) => (stdout += data.toString()));
    // Capture standard error (FFmpeg logs its progress to stderr).
    child.stderr.on('data', (data) => (stderr += data.toString()));

    // Handle process termination.
    child.on('close', (code) => {
      // Exit code 0 indicates success.
      if (code === 0) {
        resolve(stdout.trim() || stderr.trim());
      } else {
        // Log failure details and reject the promise.
        logger.error(`Command failed with code ${code}: ${stderr}`);
        reject(new Error(stderr || `Exit code ${code}`));
      }
    });

    // Handle internal child process errors (e.g., command not found).
    child.on('error', (err) => {
      reject(err);
    });
  });
};

// Define the root mount point for EBS/EFS volumes or local disk storage.
const baseMount = '/mnt';
// Extract the original filename (e.g., 'movie.mp4') from the S3 key.
const originalFileName = path.basename(VIDEO_URL); 
// Construct the temporary local path for the source video.
const inputPath = path.join(baseMount, 'original', originalFileName);

/**
 * Standard Quality Tiers for Adaptive Bitrate Streaming (ABR).
 * Each entry defines the resolution and target bandwidth for the HLS manifest.
 */
const TARGET_QUALITIES = [
  { name: '144p', width: 256, height: 144, bandwidth: 200000 },
  { name: '240p', width: 426, height: 240, bandwidth: 400000 },
  { name: '360p', width: 640, height: 360, bandwidth: 800000 },
  { name: '480p', width: 854, height: 480, bandwidth: 1400000 },
  { name: '720p', width: 1280, height: 720, bandwidth: 2800000 },
  { name: '1080p', width: 1920, height: 1080, bandwidth: 5000000 },
  { name: '1440p', width: 2560, height: 1440, bandwidth: 8000000 },
  { name: '2160p', width: 3840, height: 2160, bandwidth: 15000000 },
  { name: '4320p', width: 7680, height: 4320, bandwidth: 30000000 },
];

/**
 * Transcodes the input video into a specific HLS quality tier.
 * @param quality - The target resolution/bandwidth object.
 * @returns The local directory path containing the generated m3u8 and .ts segments.
 */
const transcodeHLS = async (quality: any) => {
  // Create a sub-directory for this specific quality level.
  const localDir = path.join('/tmp', VIDEO_ID, quality.name);
  if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });

  const playlistPath = path.join(localDir, 'index.m3u8');

  logger.info(`[HLS ${quality.name}] Processing ${quality.width}x${quality.height}...`);

  // FFmpeg HLS Transcoding Parameters:
  const args = [
    '-i', inputPath, // Input source.
    '-vf', `scale=${quality.width}:${quality.height}`, // Scale to target resolution.
    '-c:v', 'libx264', // Use H.264 video codec.
    '-profile:v', 'baseline', // High compatibility profile.
    '-level', '3.0', // Compatibility level.
    '-c:a', 'aac', // Use AAC audio codec.
    '-ar', '44100', // Audio sample rate.
    '-ac', '2', // Stereo audio.
    '-start_number', '0', // Starting segment index.
    '-hls_time', '10', // 10-second segments.
    '-hls_list_size', '0', // Include all segments in the playlist (no sliding window).
    '-f', 'hls', // Output format HLS.
    playlistPath, // Final playlist file path.
  ];

  await runCommand('ffmpeg', args);
  return localDir;
};

/**
 * Recursively scans a local directory and uploads all files to S3.
 * Automatically identifies and sets the correct Content-Type for web manifests and segments.
 */
const uploadDirectory = async (localDir: string, remotePrefix: string) => {
  // Find all files (segments, manifests) in the directory.
  const files = await glob('**/*', { cwd: localDir, nodir: true });
  logger.info(`Uploading ${files.length} segments for: ${remotePrefix}`);

  for (const file of files) {
    const localFilePath = path.join(localDir, file);
    // Construct the remote S3 path, ensuring Unix-style forward slashes.
    const remoteFilePath = path.join(remotePrefix, file).replace(/\\/g, '/');
    
    // Determine the Content-Type to ensure browsers handle the file correctly during playback.
    let contentType = undefined;
    if (file.endsWith('.m3u8')) contentType = 'application/x-mpegURL'; // HLS Playlist.
    if (file.endsWith('.ts')) contentType = 'video/MP2T'; // MPEG-TS Segment.
    if (file.endsWith('.jpg')) contentType = 'image/jpeg'; // Image asset.
    
    // Perform the cross-network upload to S3.
    await s3Service.uploadObject(remoteFilePath, localFilePath, contentType);
  }
};

/**
 * Main execution loop of the transcoding worker.
 */
async function run() {
  try {
    logger.info(`Starting Transcoding Job for Video ID: ${VIDEO_ID}`);
    
    // 0. Update database to reflect that the container is actively processing this video.
    await postgresService.setProcessing();

    // 1. Synchronize the raw source asset from S3 to the local worker disk.
    await s3Service.downloadObject(VIDEO_URL, inputPath);

    // Verify the download succeeded before proceeding to heavy compute tasks.
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file failed to download: ${inputPath}`);
    }

    // 2. Extract Video Insights (Resolution).
    const ffprobeResArgs = [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=s=x:p=0',
      inputPath,
    ];
    const resOutput = await runCommand('ffprobe', ffprobeResArgs);
    const [inputWidth, inputHeight] = resOutput.split('x').map(Number).filter(n => !isNaN(n));
    if (!inputWidth || !inputHeight) {
      throw new Error(`Invalid resolution detected: ${resOutput}`);
    }

    // Extract Video Duration for internal logging and verification.
    const ffprobeDurArgs = [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      inputPath,
    ];
    const duration = parseFloat(await runCommand('ffprobe', ffprobeDurArgs));

    logger.info(`Source Video Insights: ${inputWidth}x${inputHeight}, Duration: ${duration}s`);

    // Only transcode to qualities lower than or equal to the source resolution to avoid upscaling artifacts.
    const applicableQualities = TARGET_QUALITIES.filter((q) => q.height <= inputHeight);

    // 2.5 Deploy the source video to its final project-organized destination in S3.
    const sourceExtension = path.extname(originalFileName);
    const sourceS3Key = `${VIDEO_ID}/video${sourceExtension}`;
    logger.info(`Uploading source video to permanent location: ${sourceS3Key}`);
    await s3Service.uploadObject(sourceS3Key, inputPath, 'video/mp4');

    // 3. Multi-bitrate HLS Transcoding Pipeline.
    // Initialize the master playlist (Manifest of Manifests).
    let masterPlaylist = '#EXTM3U\n#EXT-X-VERSION:3\n';
    const transcodedBasePrefix = `${VIDEO_ID}/transcoded`;
    
    // Iteratively process each quality tier.
    for (const q of applicableQualities) {
      // Create local m3u8/segments.
      const localQualityDir = await transcodeHLS(q);
      const remotePrefix = `${transcodedBasePrefix}/${q.name}`;
      
      // Upload the entire quality tier directory to S3.
      await uploadDirectory(localQualityDir, remotePrefix);
      
      // Append this quality level to the master playlist.
      masterPlaylist += `#EXT-X-STREAM-INF:BANDWIDTH=${q.bandwidth},RESOLUTION=${q.width}x${q.height}\n`;
      masterPlaylist += `${q.name}/index.m3u8\n`;
    }

    // Create and upload the final Master Playlist (M3U8).
    const localMasterPath = path.join('/tmp', VIDEO_ID, 'master.m3u8');
    fs.writeFileSync(localMasterPath, masterPlaylist);
    
    const masterS3Key = `${transcodedBasePrefix}/master.m3u8`;
    await s3Service.uploadObject(masterS3Key, localMasterPath, 'application/x-mpegURL');

    // 4. Secondary Task: High-Quality Thumbnail Generation.
    try {
      const localThumbPath = path.join('/tmp', VIDEO_ID, 'thumbnail.jpg');
      await runCommand('ffmpeg', [
        '-i', inputPath,
        '-ss', '00:00:01.000', // Capture precisely at the 1-second mark.
        '-vframes', '1',
        localThumbPath,
      ]);
      const thumbS3Key = `${VIDEO_ID}/thumbnail.jpg`;
      await s3Service.uploadObject(thumbS3Key, localThumbPath, 'image/jpeg');
    } catch (err) {
      // Hardened: Skip if thumbnail fails, don't crash the entire pipeline.
      logger.error('⚠️ Thumbnail generation failed, skipping...', err);
    }

    // 5. Secondary Task: Time-based Preview Snapshots (used for player seek bars).
    try {
      const localPreviewDir = path.join('/tmp', VIDEO_ID, 'previews');
      if (!fs.existsSync(localPreviewDir)) fs.mkdirSync(localPreviewDir, { recursive: true });

      logger.info('Generating preview snapshots...');
      await runCommand('ffmpeg', [
        '-i', inputPath,
        '-vf', 'fps=1/10,scale=160:-1', // One snapshot every 10 seconds, scaled to 160px width.
        path.join(localPreviewDir, 'preview%d.jpg'),
      ]);
      await uploadDirectory(localPreviewDir, `${VIDEO_ID}/previews`);
    } catch (err) {
      logger.error('⚠️ Preview generation failed, skipping...', err);
    }

    // 6. AI Subtitles Pipeline (Speech-to-Text).
    const localAudioPath = path.join('/tmp', VIDEO_ID, 'audio.wav');
    const localSubtitlePath = path.join('/tmp', VIDEO_ID, 'subtitles.vtt');
    const subtitleS3Key = `${VIDEO_ID}/subtitles.vtt`;

    try {
      logger.info('Extracting audio for transcription...');
      // Extract high-quality mono PCM audio for the AI engine.
      await runCommand('ffmpeg', [
        '-i', inputPath,
        '-ar', '16000',
        '-ac', '1',
        '-c:a', 'pcm_s16le',
        localAudioPath,
      ]);

      logger.info('Running AI transcription engine...');
      // Calls the python transcribe script which uses Vosk.
      await runCommand('python3', ['transcribe.py', localAudioPath, localSubtitlePath]);

      // Upload the final VTT subtitle file.
      await s3Service.uploadObject(subtitleS3Key, localSubtitlePath, 'text/vtt');
      logger.info('✅ AI Captions generated and uploaded successfully.');
    } catch (err: any) {
      // If transcription fails, generate a fallback subtitle to avoid 404 errors in the player.
      logger.error('⚠️ STT Pipeline Failed, generating fallback subtitle...', err);
      fs.writeFileSync(
        localSubtitlePath,
        'WEBVTT\n\n1\n00:00:00.000 --> 00:00:10.000\n[Transcribing audio...]\n'
      );
      await s3Service.uploadObject(subtitleS3Key, localSubtitlePath, 'text/vtt');
    }

    // 7. Success Finalization.
    // Update DB status to 'COMPLETED' so the video becomes visible in the UI.
    await postgresService.setCompleted();
    logger.info(`🎉 Pipeline Finished Successfully for ${VIDEO_ID}.`);
    
    // Close the database connection pool before the container lifecycle ends.
    await postgresService.end();
    process.exit(0);

  } catch (error) {
    // 8. Global Catch-All Failure.
    logger.error('❌ Pipeline Failure:', error);
    if (error instanceof Error) {
      logger.error(error.stack);
    }
    // Update DB to 'FAILED' so the system knows the job needs attention.
    await postgresService.setFailed();
    await postgresService.end();
    process.exit(1);
  }
}

// Kick off the core transcoding process.
run();
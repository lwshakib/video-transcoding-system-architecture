import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { glob } from 'glob';
import logger from './logger/winston.logger';
import { s3Service } from './services/s3.services';
import { postgresService } from './services/postgres.services';
import { VIDEO_ID, VIDEO_URL } from './envs';

// Helper to run commands using spawn
const runCommand = (cmd: string, args: string[]): Promise<string> => {
  return new Promise((resolve, reject) => {
    logger.info(`Executing: ${cmd} ${args.join(' ')}`);
    const child = spawn(cmd, args);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => (stdout += data.toString()));
    child.stderr.on('data', (data) => (stderr += data.toString()));

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim() || stderr.trim());
      } else {
        logger.error(`Command failed with code ${code}: ${stderr}`);
        reject(new Error(stderr || `Exit code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
};

const baseMount = '/mnt';
const originalFileName = path.basename(VIDEO_URL); // Extracts filename from 'videos/ID/filename.mp4'
const inputPath = path.join(baseMount, 'original', originalFileName);

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

const transcodeHLS = async (quality: any) => {
  const localDir = path.join('/tmp', VIDEO_ID, quality.name);
  if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });

  const playlistPath = path.join(localDir, 'index.m3u8');

  logger.info(`[HLS ${quality.name}] Processing ${quality.width}x${quality.height}...`);

  const args = [
    '-i', inputPath,
    '-vf', `scale=${quality.width}:${quality.height}`,
    '-c:v', 'libx264',
    '-profile:v', 'baseline',
    '-level', '3.0',
    '-c:a', 'aac',
    '-ar', '44100',
    '-ac', '2',
    '-start_number', '0',
    '-hls_time', '10',
    '-hls_list_size', '0',
    '-f', 'hls',
    playlistPath,
  ];

  await runCommand('ffmpeg', args);
  return localDir;
};

const uploadDirectory = async (localDir: string, remotePrefix: string) => {
  const files = await glob('**/*', { cwd: localDir, nodir: true });
  logger.info(`Uploading ${files.length} segments for: ${remotePrefix}`);

  for (const file of files) {
    const localFilePath = path.join(localDir, file);
    const remoteFilePath = path.join(remotePrefix, file).replace(/\\/g, '/');
    
    // Guess basic mime types
    let contentType = undefined;
    if (file.endsWith('.m3u8')) contentType = 'application/x-mpegURL';
    if (file.endsWith('.ts')) contentType = 'video/MP2T';
    if (file.endsWith('.jpg')) contentType = 'image/jpeg';
    
    await s3Service.uploadObject(remoteFilePath, localFilePath, contentType);
  }
};

async function run() {
  try {
    logger.info(`Starting Transcoding Job for Video ID: ${VIDEO_ID}`);
    // 0. Set Status to PROCESSING
    await postgresService.setProcessing();

    // 1. Download source from S3
    await s3Service.downloadObject(VIDEO_URL, inputPath);

    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file failed to download: ${inputPath}`);
    }

    // 2. Get Video Metadata
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

    const ffprobeDurArgs = [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      inputPath,
    ];
    const duration = parseFloat(await runCommand('ffprobe', ffprobeDurArgs));

    logger.info(`Source Video Insights: ${inputWidth}x${inputHeight}, Duration: ${duration}s`);

    const applicableQualities = TARGET_QUALITIES.filter((q) => q.height <= inputHeight);

    // 2.5 Upload Source to its final destination
    const sourceExtension = path.extname(originalFileName);
    const sourceS3Key = `${VIDEO_ID}/video${sourceExtension}`;
    logger.info(`Uploading source video to permanent location: ${sourceS3Key}`);
    await s3Service.uploadObject(sourceS3Key, inputPath, 'video/mp4'); // Assume mp4 or keeping original type

    // 3. Transcode HLS
    let masterPlaylist = '#EXTM3U\n#EXT-X-VERSION:3\n';
    const transcodedBasePrefix = `${VIDEO_ID}/transcoded`;
    
    for (const q of applicableQualities) {
      const localQualityDir = await transcodeHLS(q);
      const remotePrefix = `${transcodedBasePrefix}/${q.name}`;
      
      await uploadDirectory(localQualityDir, remotePrefix);
      
      masterPlaylist += `#EXT-X-STREAM-INF:BANDWIDTH=${q.bandwidth},RESOLUTION=${q.width}x${q.height}\n`;
      masterPlaylist += `${q.name}/index.m3u8\n`;
    }

    const localMasterPath = path.join('/tmp', VIDEO_ID, 'master.m3u8');
    fs.writeFileSync(localMasterPath, masterPlaylist);
    
    const masterS3Key = `${transcodedBasePrefix}/master.m3u8`;
    await s3Service.uploadObject(masterS3Key, localMasterPath, 'application/x-mpegURL');

    // 4. Generate Main Thumbnail
    try {
      const localThumbPath = path.join('/tmp', VIDEO_ID, 'thumbnail.jpg');
      await runCommand('ffmpeg', [
        '-i', inputPath,
        '-ss', '00:00:01.000',
        '-vframes', '1',
        localThumbPath,
      ]);
      const thumbS3Key = `${VIDEO_ID}/thumbnail.jpg`;
      await s3Service.uploadObject(thumbS3Key, localThumbPath, 'image/jpeg');
    } catch (err) {
      logger.error('⚠️ Thumbnail generation failed, skipping...', err);
    }

    // 5. Generate Preview Images (every 10 seconds)
    try {
      const localPreviewDir = path.join('/tmp', VIDEO_ID, 'previews');
      if (!fs.existsSync(localPreviewDir)) fs.mkdirSync(localPreviewDir, { recursive: true });

      logger.info('Generating preview snapshots...');
      await runCommand('ffmpeg', [
        '-i', inputPath,
        '-vf', 'fps=1/10,scale=160:-1',
        path.join(localPreviewDir, 'preview%d.jpg'),
      ]);
      await uploadDirectory(localPreviewDir, `${VIDEO_ID}/previews`);
    } catch (err) {
      logger.error('⚠️ Preview generation failed, skipping...', err);
    }

    // 6. Generate Real AI Subtitles (Speech-to-Text)
    const localAudioPath = path.join('/tmp', VIDEO_ID, 'audio.wav');
    const localSubtitlePath = path.join('/tmp', VIDEO_ID, 'subtitles.vtt');
    const subtitleS3Key = `${VIDEO_ID}/subtitles.vtt`;

    try {
      logger.info('Extracting audio for transcription...');
      // Extract mono audio at 16kHz (preferred by Vosk)
      await runCommand('ffmpeg', [
        '-i', inputPath,
        '-ar', '16000',
        '-ac', '1',
        '-c:a', 'pcm_s16le',
        localAudioPath,
      ]);

      logger.info('Running AI transcription engine...');
      await runCommand('python3', ['transcribe.py', localAudioPath, localSubtitlePath]);

      await s3Service.uploadObject(subtitleS3Key, localSubtitlePath, 'text/vtt');
      logger.info('✅ AI Captions generated and uploaded successfully.');
    } catch (err: any) {
      logger.error('⚠️ STT Pipeline Failed, generating fallback subtitle...', err);
      // Generate a fallback empty file so player track doesn't 404
      fs.writeFileSync(
        localSubtitlePath,
        'WEBVTT\n\n1\n00:00:00.000 --> 00:00:10.000\n[Transcribing audio...]\n'
      );
      await s3Service.uploadObject(subtitleS3Key, localSubtitlePath, 'text/vtt');
    }

    // 7. Success Cleanup & DB Update
    await postgresService.setCompleted();
    logger.info(`🎉 Pipeline Finished Successfully for ${VIDEO_ID}.`);
    
    // Explicitly end postgres pool to exit process smoothly
    await postgresService.end();
    process.exit(0);

  } catch (error) {
    logger.error('❌ Pipeline Failure:', error);
    if (error instanceof Error) {
      logger.error(error.stack);
    }
    await postgresService.setFailed();
    await postgresService.end();
    process.exit(1);
  }
}

// Start the core transcoding job
run();
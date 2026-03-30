import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { glob } from 'glob';

// Helper to decode Base64
const decodeBase64 = (b64: string) => Buffer.from(b64, 'base64').toString('utf-8');

// Helper to run commands using spawn (safer against shell interpolation)
const runCommand = (cmd: string, args: string[]): Promise<string> => {
  return new Promise((resolve, reject) => {
    console.log(`Executing: ${cmd} ${args.join(' ')}`);
    const child = spawn(cmd, args);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => (stdout += data.toString()));
    child.stderr.on('data', (data) => (stderr += data.toString()));

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim() || stderr.trim());
      } else {
        console.error(`Command failed with code ${code}: ${stderr}`);
        reject(new Error(stderr || `Exit code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
};

const b64FileName = process.env.FILENAME_B64;
const b64VideoTitle = process.env.VIDEO_TITLE_B64;
const bucketUrl = process.env.BUCKET_URL;
const sessionToken = process.env.SESSION_TOKEN;
const baseMount = '/mnt';

if (!b64FileName || !b64VideoTitle || !bucketUrl || !sessionToken) {
  console.error('Missing required environment variables.');
  process.exit(1);
}

const fileName = decodeBase64(b64FileName);
const videoTitle = decodeBase64(b64VideoTitle);
const inputPath = path.join(baseMount, 'original', fileName);

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

if (!fs.existsSync(inputPath)) {
  console.error(`Input file not found: ${inputPath}`);
  process.exit(1);
}

const transcodeHLS = async (quality: any) => {
  const localDir = path.join('/tmp', videoTitle, quality.name);
  if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });

  const playlistPath = path.join(localDir, 'index.m3u8');

  console.log(`[HLS ${quality.name}] Processing ${quality.width}x${quality.height}...`);

  const args = [
    '-i',
    inputPath,
    '-vf',
    `scale=${quality.width}:${quality.height}`,
    '-c:v',
    'libx264',
    '-profile:v',
    'baseline',
    '-level',
    '3.0',
    '-c:a',
    'aac',
    '-ar',
    '44100',
    '-ac',
    '2',
    '-start_number',
    '0',
    '-hls_time',
    '10',
    '-hls_list_size',
    '0',
    '-f',
    'hls',
    playlistPath,
  ];

  await runCommand('ffmpeg', args);
  return localDir;
};

const uploadFile = async (localPath: string, relativePath: string) => {
  const encodedPath = relativePath.split('/').map(encodeURIComponent).join('/');
  const uploadUrl = `${bucketUrl}/upload/${encodedPath}?token=${sessionToken}`;
  const fileStream = fs.createReadStream(localPath);

  try {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      body: fileStream,
      // @ts-ignore
      duplex: 'half',
    });

    if (!res.ok) {
      throw new Error(`Upload failed for ${relativePath}: ${res.statusText}`);
    }
  } catch (err: any) {
    console.error(`Failed to upload ${relativePath}:`, err.message);
    throw err;
  }
};

const uploadDirectory = async (localDir: string, remotePrefix: string) => {
  const files = await glob('**/*', { cwd: localDir, nodir: true });
  console.log(`Uploading ${files.length} segments for: ${remotePrefix}`);

  for (const file of files) {
    const localFilePath = path.join(localDir, file);
    // Force forward slashes for the remote path regardless of OS
    const remoteFilePath = path.join(remotePrefix, file).replace(/\\/g, '/');
    await uploadFile(localFilePath, remoteFilePath);
  }
};

async function run() {
  try {
    // 1. Get Video Metadata
    const ffprobeResArgs = [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height',
      '-of',
      'csv=s=x:p=0',
      inputPath,
    ];
    const resOutput = await runCommand('ffprobe', ffprobeResArgs);
    const [inputWidth, inputHeight] = resOutput.split('x').map(Number).filter(n => !isNaN(n));
    if (!inputWidth || !inputHeight) {
      throw new Error(`Invalid resolution detected: ${resOutput}`);
    }

    const ffprobeDurArgs = [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      inputPath,
    ];
    const duration = parseFloat(await runCommand('ffprobe', ffprobeDurArgs));

    console.log(`Source Video: ${inputWidth}x${inputHeight}, Duration: ${duration}s`);

    const applicableQualities = TARGET_QUALITIES.filter((q) => q.height <= inputHeight);

    // 2. Transcode HLS
    let masterPlaylist = '#EXTM3U\n#EXT-X-VERSION:3\n';
    for (const q of applicableQualities) {
      await transcodeHLS(q);
      const remotePrefix = `transcoded/${videoTitle}/${q.name}`;
      await uploadDirectory(path.join('/tmp', videoTitle, q.name), remotePrefix);
      masterPlaylist += `#EXT-X-STREAM-INF:BANDWIDTH=${q.bandwidth},RESOLUTION=${q.width}x${q.height}\n`;
      masterPlaylist += `${q.name}/index.m3u8\n`;
    }

    const masterPath = path.join('/tmp', videoTitle, 'master.m3u8');
    fs.writeFileSync(masterPath, masterPlaylist);
    await uploadFile(masterPath, `transcoded/${videoTitle}/master.m3u8`);

    // 3. Generate Main Thumbnail
    const thumbPath = path.join('/tmp', videoTitle, 'thumbnail.jpg');
    await runCommand('ffmpeg', [
      '-i',
      inputPath,
      '-ss',
      '00:00:01.000',
      '-vframes',
      '1',
      thumbPath,
    ]);
    await uploadFile(thumbPath, `transcoded/${videoTitle}/thumbnail.jpg`);

    // 4. Generate Preview Images (every 10 seconds)
    const previewDir = path.join('/tmp', videoTitle, 'previews');
    if (!fs.existsSync(previewDir)) fs.mkdirSync(previewDir, { recursive: true });

    console.log('Generating preview snapshots...');
    await runCommand('ffmpeg', [
      '-i',
      inputPath,
      '-vf',
      'fps=1/10,scale=160:-1',
      path.join(previewDir, 'preview%d.jpg'),
    ]);
    await uploadDirectory(previewDir, `transcoded/${videoTitle}/previews`);

    // 5. Generate Real AI Subtitles (Speech-to-Text)
    const audioPath = path.join('/tmp', videoTitle, 'audio.wav');
    const subtitlePath = path.join('/tmp', videoTitle, 'subtitles.vtt');

    try {
      console.log('Extracting audio for transcription...');
      // Extract mono audio at 16kHz (preferred by Vosk)
      await runCommand('ffmpeg', [
        '-i',
        inputPath,
        '-ar',
        '16000',
        '-ac',
        '1',
        '-c:a',
        'pcm_s16le',
        audioPath,
      ]);

      console.log('Running AI transcription engine...');
      await runCommand('python3', ['transcribe.py', audioPath, subtitlePath]);

      await uploadFile(subtitlePath, `transcoded/${videoTitle}/subtitles.vtt`);
      console.log('AI Captions generated and uploaded successfully.');
    } catch (err: any) {
      console.error('STT Pipeline Failed:', err.message);
      // Optional: Generate a fallback empty file so player track doesn't 404
      fs.writeFileSync(
        subtitlePath,
        'WEBVTT\n\n1\n00:00:00.000 --> 00:00:10.000\n[Transcribing audio...]\n'
      );
      await uploadFile(subtitlePath, `transcoded/${videoTitle}/subtitles.vtt`);
    }

    console.log(`Pipeline Finished Successfully.`);
    process.exit(0);
  } catch (error) {
    console.error('Pipeline Failure:', error);
    process.exit(1);
  }
}

run();
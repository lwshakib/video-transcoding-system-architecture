/**
 * Docker Service.
 * This module is designed for local development and testing environments.
 * It provides the capability to launch the 'transcoding-container' directly on the host 
 * machine using the local Docker daemon, bypassing the need for AWS ECS during fast-iteration cycles.
 */

import { spawn } from "child_process";
import logger from "../logger/winston.logger";
import * as envs from "../envs";

class DockerService {
  /**
   * Spawns a new Docker process to execute a transcoding job locally.
   * This mimics the behavior of an ECS task but runs on the developer's workstation.
   * @param params - Metadata defining the job context: videoId and the S3 source URL.
   * @returns A promise that resolves when the container exits successfully (code 0).
   */
  async runTask(params: {
    videoId: string;
    videoUrl: string;
    thumbnailUrl?: string;
  }) {
    const { videoId, videoUrl } = params;

    // Collate the system environment variables that the container requires for S3 and DB access.
    const envVars: Record<string, string | undefined> = {
      AWS_REGION: envs.AWS_REGION,
      AWS_ACCESS_KEY_ID: envs.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: envs.AWS_SECRET_ACCESS_KEY,
      S3_BUCKET_NAME: envs.S3_BUCKET_NAME,
      DATABASE_URL: envs.DATABASE_URL
    };

    // Construct the initial arguments for the 'docker run' CLI command.
    // --rm: Automatically remove the container filesystem when it exits.
    // --name: Assign a predictable name based on the video ID for easy tracking and stopping.
    const args = ["run", "--rm", "--name", `transcoder-${videoId}`];

    // Map each identified environment variable into the '-e' Docker CLI flag.
    Object.entries(envVars).forEach(([key, value]) => {
      if (value) {
        args.push("-e", `${key}=${value}`);
      }
    });

    // Inject the specific transcoding context (parameters) required by the worker script.
    args.push("-e", `VIDEO_ID=${videoId}`);
    args.push("-e", `VIDEO_URL=${videoUrl}`);

    // Finalize the command with the target Docker image name and tag.
    args.push("transcoding-container:latest");

    logger.info(`🛠️ Triggering local Docker transcoding for video: ${videoId}...`);

    return new Promise((resolve, reject) => {
      // Initiate the 'docker' command as an asynchronous child process.
      const p = spawn("docker", args);

      // Pipe the container's standard output stream into the server's primary logger for visibility.
      p.stdout?.on("data", (data) => logger.info(`[Docker Stdout]: ${String(data).trim()}`));
      // Pipe any error output (STDERR) as well, prefixing it for identification.
      p.stderr?.on("data", (data) => logger.error(`[Docker Stderr]: ${String(data).trim()}`));

      // Listen for the process closure event to determine success or failure.
      p.on("close", (code) => {
        // Exit code 0 is the universal signal for a successful process completion.
        if (code === 0) {
          logger.info(`✅ Local Docker build completed successfully.`);
          resolve(true); 
        } else {
          // If the container crashes or returns an error code, we log the failure and reject.
          logger.error(`❌ Local Docker build failed with exit code ${code}`);
          reject(new Error(`Docker build failed with code ${code}`)); 
        }
      });
    });
  }

  /**
   * Forcibly stops an active local Docker transcoding container.
   * Used during the 'Delete' lifecycle to halt resource consumption for a cancelled job.
   * @param videoId - Unique ID used to identify the target container by name.
   */
  async stopTask(videoId: string) {
    logger.info(`🛑 Stopping local Docker transcoding for video: ${videoId}...`);
    return new Promise((resolve) => {
      // Execute 'docker stop' to gracefully shut down the container.
      const p = spawn("docker", ["stop", `transcoder-${videoId}`]);
      
      p.on("close", (code) => {
        if (code === 0) {
          logger.info(`✅ Docker container transcoder-${videoId} stopped.`);
          resolve(true);
        } else {
          // A non-zero exit code here often means the container was already finished or didn't exist.
          logger.warn(`⚠️ Failed to stop Docker container or it wasn't running (code ${code}).`);
          resolve(false);
        }
      });
    });
  }
}

// Export a singleton instance to be shared across the Express controllers.
export const dockerService = new DockerService();
export default dockerService;

/**
 * Docker Service.
 * This service is used for local development/testing to run the builder container
 * directly on the host machine via the Docker CLI, instead of using AWS ECS.
 */

import { spawn } from "child_process";
import logger from "../logger/winston.logger";
import * as envs from "../envs";

class DockerService {
  /**
   * Spawns a new Docker process to run the transcoding container locally.
   * @param params - Video metadata including unique ID and source URL
   * @returns A promise that resolves if the transcoding completes successfully
   */
  async runTask(params: {
    videoId: string;
    videoUrl: string;
    thumbnailUrl?: string;
  }) {
    const { videoId, videoUrl } = params;

    // Define the environment variables the container needs to interact with S3
    const envVars: Record<string, string | undefined> = {
      AWS_REGION: envs.AWS_REGION,
      AWS_ACCESS_KEY_ID: envs.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: envs.AWS_SECRET_ACCESS_KEY,
      S3_BUCKET_NAME: envs.S3_BUCKET_NAME,
      DATABASE_URL: envs.DATABASE_URL
    };

    // Prepare the 'docker run' command arguments
    const args = ["run", "--rm"];

    // Inject system-wide environment variables into the container
    Object.entries(envVars).forEach(([key, value]) => {
      if (value) {
        args.push("-e", `${key}=${value}`);
      }
    });

    // Inject video-specific transcoding parameters
    args.push("-e", `VIDEO_ID=${videoId}`);
    args.push("-e", `VIDEO_URL=${videoUrl}`);

    // Specify the local image name to run
    args.push("transcoding-container:latest");

    logger.info(`🛠️ Triggering local Docker transcoding for video: ${videoId}...`);

    return new Promise((resolve, reject) => {
      // Spawn the 'docker' command as a child process
      const p = spawn("docker", args);

      // Stream stdout from the container to the server's logger
      p.stdout?.on("data", (data) => logger.info(`[Docker Stdout]: ${String(data).trim()}`));
      // Stream stderr from the container to the server's logger
      p.stderr?.on("data", (data) => logger.error(`[Docker Stderr]: ${String(data).trim()}`));

      // Handle process completion
      p.on("close", (code) => {
        if (code === 0) {
          logger.info(`✅ Local Docker build completed successfully.`);
          resolve(true); // Build succeeded
        } else {
          logger.error(`❌ Local Docker build failed with exit code ${code}`);
          reject(new Error(`Docker build failed with code ${code}`)); // Build failed
        }
      });
    });
  }
}

// Export a singleton instance of the DockerService
export const dockerService = new DockerService();
export default dockerService;

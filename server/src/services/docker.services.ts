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
   * Spawns a new Docker process to run the project builder container locally.
   * @param params - Build metadata including Git URL and unique identifiers
   * @returns A promise that resolves if the build completes successfully
   */
  async runTask(params: {
    gitURL: string;
    projectId: string;
    deploymentId: string;
    projectName: string;
  }) {
    const { gitURL, projectId, deploymentId, projectName } = params;

    // Define the environment variables the container needs to interact with S3
    const envVars: Record<string, string | undefined> = {
      AWS_REGION: envs.AWS_REGION,
      AWS_ACCESS_KEY_ID: envs.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: envs.AWS_SECRET_ACCESS_KEY,
      S3_BUCKET_NAME: envs.S3_BUCKET_NAME
    };

    // Prepare the 'docker run' command arguments
    const args = ["run", "--rm"]; // --rm ensures the container is deleted after exiting

    // Inject system-wide environment variables into the container
    Object.entries(envVars).forEach(([key, value]) => {
      if (value) {
        args.push("-e", `${key}=${value}`);
      }
    });

    // Inject deployment-specific build parameters
    args.push("-e", `GIT_REPOSITORY__URL=${gitURL}`);
    args.push("-e", `PROJECT_ID=${projectId}`);
    args.push("-e", `DEPLOYMENT_ID=${deploymentId}`);
    args.push("-e", `PROJECT_NAME=${projectName}`);

    // Specify the local image name to run
    args.push("transcoding-container:latest");

    logger.info(`🛠️ Triggering local Docker transcoding build for project: ${projectName}...`);

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

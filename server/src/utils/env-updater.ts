/**
 * Environment Variable Updater Utility.
 * This script provides a mechanism to programmatically modify the local .env file.
 * It is primarily used by the 'infra setup' scripts to automatically inject 
 * newly provisioned AWS resource ARNs and URLs into the server's configuration.
 */

import fs from "fs";
import path from "path";
import logger from "../logger/winston.logger";

/**
 * Surgically updates or adds an environment variable in the .env file.
 * 
 * Logic Flow:
 * 1. Checks if the .env file exists; creates an empty string if not.
 * 2. Uses Regex to find existing keys for replacement.
 * 3. Appends the key if it does not exist.
 * 
 * @param key - The name of the environment variable (e.g., "AWS_SQS_QUEUE_URL").
 * @param value - The value to associate with the key.
 */
export function updateEnv(key: string, value: string) {
  // Pinpoint the absolute path to the .env file in the process's working directory.
  const envPath = path.join(process.cwd(), ".env");
  
  // Read existing content or initialize a fresh buffer.
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";

  // Split content based on newline to evaluate each entry individually.
  const lines = envContent.split("\n");
  
  // Exact regex to match the key at the start of a line to avoid partial matches.
  const keyRegex = new RegExp(`^${key}=`);
  let keyFound = false;

  // Rebuild the file line by line.
  const newLines = lines.map((line) => {
    if (keyRegex.test(line.trim())) {
      keyFound = true;
      // Found the key: Perform a surgical replacement of the value.
      // We wrap the value in single quotes to handle potential spaces or special characters.
      return `${key}='${value}'`;
    }
    return line;
  });

  // Key was not present in the original file: Append it to the EOF.
  if (!keyFound) {
    if (newLines.length > 0) {
      const lastLine = newLines[newLines.length - 1];
      // Insert an empty line if the file didn't already have a trailing newline.
      if (lastLine !== undefined && lastLine.trim() !== "") {
        newLines.push("");
      }
    }
    newLines.push(`${key}='${value}'`);
  }

  // Finalize the write back to the filesystem, ensuring a clean trailing newline.
  fs.writeFileSync(envPath, newLines.join("\n").trim() + "\n");
  
  // Log the update with the key/value for confirmation.
  logger.info(`✅ Environment updated: ${key}='${value}'`);
}

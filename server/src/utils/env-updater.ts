import fs from "fs";
import path from "path";
import logger from "../logger/winston.logger";

/**
 * Surgically updates or adds an environment variable in the .env file.
 * If the key exists, its value is replaced.
 * If the key does not exist, it is appended to the bottom of the file.
 * 
 * @param key - The name of the environment variable (e.g., "AWS_SQS_QUEUE_URL")
 * @param value - The new value (will be wrapped in single quotes)
 */
export function updateEnv(key: string, value: string) {
  const envPath = path.join(process.cwd(), ".env");
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";

  const lines = envContent.split("\n");
  const keyRegex = new RegExp(`^${key}=`);
  let keyFound = false;

  const newLines = lines.map((line) => {
    if (keyRegex.test(line.trim())) {
      keyFound = true;
      return `${key}='${value}'`;
    }
    return line;
  });

  if (!keyFound) {
    if (newLines.length > 0) {
      const lastLine = newLines[newLines.length - 1];
      if (lastLine !== undefined && lastLine.trim() !== "") {
        newLines.push("");
      }
    }
    newLines.push(`${key}='${value}'`);
  }

  // Write changes back to the .env file
  fs.writeFileSync(envPath, newLines.join("\n").trim() + "\n");
  logger.info(`✅ .env updated: ${key}=${value}`);
}

/**
 * Morgan HTTP Request Logger Middleware.
 * This module integrates the Morgan middleware with our custom Winston logger
 * to ensure that all incoming HTTP requests are logged consistently.
 */

import morgan, { type StreamOptions } from "morgan";
import logger from "./winston.logger";
import { NODE_ENV } from "../envs";

/**
 * Winston-compatible stream for Morgan.
 * Forwards Morgan's output to Winston's .http() level for centralized logging.
 */
const stream: StreamOptions = {
  // Use the HTTP severity level for web request logs
  write: (message: string): void => {
    // Trim to remove the trailing newline added by Morgan
    logger.http(message.trim());
  },
};

/**
 * Logic to skip logging for certain requests.
 * Currently configured to skip non-development requests to keep production logs clean.
 */
const skip = (): boolean => {
  const env = NODE_ENV;
  return env !== "development";
};

/**
 * Initialize the Morgan middleware.
 * format: ':remote-addr :method :url :status - :response-time ms'
 * options: custom stream and skip logic
 */
const morganMiddleware = morgan(
  ":remote-addr :method :url :status - :response-time ms",
  {
    stream,
    skip,
  }
);

// Export as the default middleware for use in index.ts
export default morganMiddleware;

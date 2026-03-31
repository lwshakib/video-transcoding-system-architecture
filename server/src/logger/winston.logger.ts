/**
 * Winston Logging Configuration.
 * This module sets up a centralized logger for the main server, supporting
 * console colorization and multiple log file destinations categorized by severity.
 */

import winston from "winston";
import { NODE_ENV } from "../envs";

/**
 * Custom severity levels for the application.
 * Lower numbers represent higher priority (0 is the most critical).
 * - error: System failures or critical exceptions.
 * - warn: Potential issues that don't halt the process.
 * - info: Key milestone events (server start, job completion).
 * - http: Incoming web request telemetry from Morgan.
 * - debug: Granular execution details for development.
 */
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
} as const;

// Define a type for our supported log levels to ensure type-safe logging calls.
type LogLevel = keyof typeof levels;

/**
 * Select the minimum log level to record based on the current environment.
 * @returns 'debug' in development for detailed logs, 'warn' in production to avoid logging noise.
 */
const level = (): LogLevel => {
  const env = NODE_ENV;
  const isDevelopment = env === "development";
  // In development, we want to see everything; in production, only warnings and errors.
  return isDevelopment ? "debug" : "warn";
};

/**
 * Color mapping for each log level for high-contrast console readability.
 */
const colors: Record<LogLevel, string> = {
  error: "red",
  warn: "yellow",
  info: "blue",
  http: "magenta",
  debug: "white",
};

// Register the custom colors globally with the Winston engine.
winston.addColors(colors);

/**
 * Defines the final log message format.
 * Combination of:
 * 1. Timestamp injection.
 * 2. Visual colorization (for local console).
 * 3. Custom layout template: [Timestamp] LEVEL: Message
 */
const format = winston.format.combine(
  // Standardized human-readable timestamp format.
  winston.format.timestamp({ format: "DD MMM, YYYY - HH:mm:ss:ms" }),
  // Apply colors to the level and message text for terminal clarity.
  winston.format.colorize({ all: true }),
  // Print function to define the exact string layout.
  winston.format.printf((info: winston.Logform.TransformableInfo) => {
    const { timestamp, level, message } = info;
    // Construct the formatted line.
    return `[${timestamp}] ${level}: ${String(message)}`;
  })
);

/**
 * Define where the logs should be transmitted (transports).
 * Our setup includes the console (real-time) and persisted rotating log files.
 */
const transports: winston.transport[] = [
  // Output logs to the standard terminal console (Pickled up by Docker/PM2/CloudWatch).
  new winston.transports.Console(),
  
  // Persist severe system errors to a dedicated error.log for easier debugging.
  new winston.transports.File({
    filename: "logs/error.log",
    level: "error", // Only captures 'error' level messages.
  }),
  
  // Persist general application milestones to info.log.
  new winston.transports.File({
    filename: "logs/info.log",
    level: "info", // Captures 'info', 'warn', and 'error'.
  }),
  
  // Persist HTTP request telemetry (redirected from Morgan) to a standalone http.log.
  new winston.transports.File({
    filename: "logs/http.log",
    level: "http", // Captures everything including HTTP hits and below.
  }),
];

/**
 * Initialize and instantiate the primary Winston logger.
 */
const logger = winston.createLogger({
  level: level(), // Set the minimum threshold for recording.
  levels,         // Apply our custom priority hierarchy.
  format,         // Apply the message template.
  transports,     // Dispatch to defined outputs.
});

// Export the singleton logger as the default instance for the entire backend.
export default logger;

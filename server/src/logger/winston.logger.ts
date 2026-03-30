/**
 * Winston Logging Configuration.
 * This module sets up a centralized logger for the main server, supporting
 * console colorization and multiple log file destinations based on severity.
 */

import winston from "winston";
import { NODE_ENV } from "../envs";

/**
 * Custom severity levels for the application.
 * Lower numbers represent higher priority.
 */
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
} as const;

// Define a type for our supported log levels
type LogLevel = keyof typeof levels;

/**
 * Select the minimum log level to record based on the current environment.
 * @returns 'debug' in development for detailed logs, 'warn' in production to minimize storage.
 */
const level = (): LogLevel => {
  const env = NODE_ENV;
  const isDevelopment = env === "development";
  return isDevelopment ? "debug" : "warn";
};

/**
 * Color mapping for each log level for console readability.
 */
const colors: Record<LogLevel, string> = {
  error: "red",
  warn: "yellow",
  info: "blue",
  http: "magenta",
  debug: "white",
};

// Register custom colors with Winston
winston.addColors(colors);

/**
 * Defines the log message format: [Timestamp] LEVEL: Message
 */
const format = winston.format.combine(
  // Standardized timestamp format
  winston.format.timestamp({ format: "DD MMM, YYYY - HH:mm:ss:ms" }),
  // Colorize the entire log line for the console
  winston.format.colorize({ all: true }),
  // Custom print function to generate the final log string
  winston.format.printf((info: winston.Logform.TransformableInfo) => {
    const { timestamp, level, message } = info;
    return `[${timestamp}] ${level}: ${String(message)}`;
  })
);

/**
 * Define where the logs should be sent (transports).
 */
const transports: winston.transport[] = [
  // Output logs to the standard console
  new winston.transports.Console(),
  // Persist critical errors to a dedicated error file
  new winston.transports.File({
    filename: "logs/error.log",
    level: "error",
  }),
  // Persist general information to info.log
  new winston.transports.File({
    filename: "logs/info.log",
    level: "info",
  }),
  // Persist HTTP request logs (from Morgan) to http.log
  new winston.transports.File({
    filename: "logs/http.log",
    level: "http",
  }),
];

/**
 * Initialize the primary Winston logger instance.
 */
const logger = winston.createLogger({
  level: level(), // Set minimum logging threshold
  levels,         // Use custom severity hierarchy
  format,         // Use custom message template
  transports,     // Use defined output destinations
});

// Export the logger as the default for application-wide use
export default logger;

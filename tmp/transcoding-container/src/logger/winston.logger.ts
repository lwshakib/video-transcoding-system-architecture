/**
 * Winston Logger Configuration.
 * This module sets up a centralized logger for the transcoding worker, ensuring that 
 * logs are formatted consistently and include essential metadata like timestamps and error stacks.
 */

import winston from 'winston';

// Create a new Winston logger instance.
const logger = winston.createLogger({
  // Set the default logging level to 'info'. Logs with lower priority (like 'debug') will be ignored unless changed.
  level: 'info',
  
  // Combine multiple formatters to enrich the log output.
  format: winston.format.combine(
    // Adds a human-readable timestamp to each log entry.
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    
    // Automatically extracts and formats the stack trace if an Error object is logged.
    winston.format.errors({ stack: true }),
    
    // Adds terminal-friendly colors to the log levels (e.g., red for errors, green for info).
    winston.format.colorize(),
    
    // Custom print function to define the exact string layout of the log.
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
      // Base message format including timestamp, service identifier, level, and the message text.
      let msg = `[${timestamp}] [TRANSCODER] ${level}: ${message}`;
      
      // If a stack trace exists (from an error), append it to the message on a new line.
      if (stack) {
        msg += `\n${stack}`;
      }
      
      // If there are additional metadata properties (e.g., videoId), append them as a JSON string.
      if (Object.keys(meta).length > 0) {
        msg += `\n${JSON.stringify(meta, null, 2)}`; // Using null, 2 for pretty-printing JSON.
      }
      
      return msg;
    })
  ),
  
  // Define where the logs should be sent. 
  transports: [
    // Output all logs to the standard console (STDOUT/STDERR), which is picked up by Docker and CloudWatch.
    new winston.transports.Console(),
  ],
});

// Export the logger instance for use throughout the application.
export default logger;

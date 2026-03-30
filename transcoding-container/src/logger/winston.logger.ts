import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
      let msg = `[${timestamp}] [TRANSCODER] ${level}: ${message}`;
      if (stack) {
        msg += `\n${stack}`;
      }
      // If there are other properties, append them nicely
      if (Object.keys(meta).length > 0) {
        msg += `\n${JSON.stringify(meta)}`;
      }
      return msg;
    })
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

export default logger;

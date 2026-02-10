import winston from "winston";

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "HH:mm:ss" }),
    winston.format.errors({ stack: true }),
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, module: mod, duration, stack }) => {
          const tag = mod ? ` [${mod}]` : "";
          const time = duration !== undefined ? ` (${duration})` : "";
          if (stack) return `${timestamp} ${level}:${tag} ${message}\n${stack}`;
          return `${timestamp} ${level}:${tag} ${message}${time}`;
        })
      ),
    }),
  ],
});

export default logger;

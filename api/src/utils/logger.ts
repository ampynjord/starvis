import { existsSync, mkdirSync } from "fs";
import path from "path";
import winston from "winston";

const LOG_DIR = process.env.LOG_DIR || "logs";
const LOG_LEVEL = process.env.LOG_LEVEL || "info";

// Ensure log directory exists
if (!existsSync(LOG_DIR)) {
  try { mkdirSync(LOG_DIR, { recursive: true }); }
  catch (e) { console.warn(`[logger] Could not create log dir "${LOG_DIR}": ${(e as Error).message}`); }
}

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.printf(({ level, message, timestamp, module: mod, duration, stack }) => {
    const tag = mod ? ` [${mod}]` : "";
    const time = duration !== undefined ? ` (${duration})` : "";
    if (stack) return `${timestamp} ${level}:${tag} ${message}\n${stack}`;
    return `${timestamp} ${level}:${tag} ${message}${time}`;
  })
);

const fileFormat = winston.format.combine(
  winston.format.uncolorize(),
  winston.format.json()
);

const transports: winston.transport[] = [
  new winston.transports.Console({ format: consoleFormat }),
];

// File transports in production or when LOG_DIR is set
if (process.env.NODE_ENV === "production" || process.env.LOG_DIR) {
  transports.push(
    new winston.transports.File({
      filename: path.join(LOG_DIR, "error.log"),
      level: "error",
      format: fileFormat,
      maxsize: 5 * 1024 * 1024,  // 5 MB
      maxFiles: 3,
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, "combined.log"),
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 5,
    })
  );
}

const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp({ format: "HH:mm:ss" }),
    winston.format.errors({ stack: true }),
  ),
  transports,
});

export default logger;

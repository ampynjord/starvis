/**
 * Configuration centralisée
 */

export const DB_CONFIG = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "3306"),
  user: process.env.DB_USER || "starapi",
  password: process.env.DB_PASSWORD || "starapi",
  database: process.env.DB_NAME || "starapi",
  waitForConnections: true,
  connectionLimit: 10,
};

export const P4K_CONFIG = {
  path: process.env.P4K_PATH || "/game/Data.p4k",
  chunkSize: 64 * 1024 * 1024, // 64MB
};

export const API_CONFIG = {
  port: parseInt(process.env.PORT || "3000"),
  maxPageSize: 250,
  defaultPageSize: 50,
};

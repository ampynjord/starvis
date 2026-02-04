import { NextFunction, Request, Response } from "express";

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "starapi_admin_2024";

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers["x-api-key"] || req.query.api_key;

  if (!apiKey || apiKey !== ADMIN_API_KEY) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Valid API key required. Use X-API-Key header or ?api_key= query parameter"
    });
  }

  next();
}

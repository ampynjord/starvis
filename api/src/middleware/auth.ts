import { timingSafeEqual } from "crypto";
import { NextFunction, Request, Response } from "express";

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
  if (!ADMIN_API_KEY) {
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  const apiKey = String(req.headers["x-api-key"] || "");
  const keyBuf = Buffer.from(apiKey);
  const expectedBuf = Buffer.from(ADMIN_API_KEY);

  if (!apiKey || keyBuf.length !== expectedBuf.length || !timingSafeEqual(keyBuf, expectedBuf)) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Valid API key required. Use X-API-Key header.",
    });
  }

  next();
}

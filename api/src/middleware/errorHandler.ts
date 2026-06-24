import type { NextFunction, Request, Response } from 'express';
import logger from '../utils/logger.js';

export class ApiError extends Error {
  public status: number;
  public type?: string;
  public detail?: string;
  public instance?: string;

  constructor(status: number, title: string, detail?: string, type?: string) {
    super(title);
    this.status = status;
    this.detail = detail;
    this.type = type ?? 'about:blank';
  }
}

export function rfc7807ErrorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    return next(err);
  }

  const isApiError = err instanceof ApiError;
  const status = isApiError ? err.status : 500;
  const title = isApiError ? err.message : 'Internal Server Error';
  const detail = isApiError ? err.detail : 'An unexpected error occurred.';
  const type = isApiError ? err.type : 'about:blank';

  if (status >= 500) {
    logger.error('Unhandled exception caught by error middleware', { err, path: req.path });
  }

  res.status(status).json({
    type,
    title,
    status,
    detail,
    instance: req.originalUrl,
  });
}

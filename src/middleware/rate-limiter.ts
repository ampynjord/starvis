import rateLimit from "express-rate-limit";

// Public API rate limit: 100 requests per minute
export const publicLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100,
  message: {
    error: "Too Many Requests",
    message: "Rate limit exceeded. Max 100 requests per minute for public endpoints.",
    retryAfter: "60 seconds"
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Admin API rate limit: 30 requests per minute
export const adminLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: {
    error: "Too Many Requests",
    message: "Rate limit exceeded. Max 30 requests per minute for admin endpoints.",
    retryAfter: "60 seconds"
  },
  standardHeaders: true,
  legacyHeaders: false,
});

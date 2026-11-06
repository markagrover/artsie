import type { RequestHandler } from "express";
import type { AuthedRequest } from "../middleware/auth.js";

type Bucket = { count: number; resetAt: number };

/**
 * Simple in-memory rate limit. Keyed by authenticated user id, else IP.
 * Adequate for Phase 1 single-instance publish hosting.
 */
export function rateLimit(options: {
  windowMs: number;
  max: number;
  name: string;
}): RequestHandler {
  const buckets = new Map<string, Bucket>();

  return (req, res, next) => {
    const authed = req as AuthedRequest;
    const key =
      authed.user?.id ??
      req.ip ??
      req.socket.remoteAddress ??
      "anonymous";
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > options.max) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        error: `Too many ${options.name} requests. Try again in ${retryAfterSec}s.`,
      });
      return;
    }
    next();
  };
}

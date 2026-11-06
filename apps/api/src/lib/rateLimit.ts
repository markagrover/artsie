import type { RequestHandler } from "express";
import type { AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../db/prisma.js";

type Bucket = { count: number; resetAt: number };

/**
 * In-memory rate limit for authenticated / low-impact routes.
 * Prefer {@link durableRateLimit} for registration and other
 * storage-growth gates on serverless hosts.
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

/**
 * Postgres-backed rate limit. Survives cold starts so registration cannot
 * reset by recycling the process.
 */
export function durableRateLimit(options: {
  windowMs: number;
  max: number;
  name: string;
  /** Prefix for the bucket id (e.g. "registration"). */
  scope: string;
}): RequestHandler {
  /** Fallback if the RateLimitBucket table is not migrated yet. */
  const memoryFallback = rateLimit(options);

  return (req, res, next) => {
    void (async () => {
      const authed = req as AuthedRequest;
      const identity =
        authed.user?.id ??
        req.ip ??
        req.socket.remoteAddress ??
        "anonymous";
      const id = `${options.scope}:${identity}`;
      const now = new Date();

      let result: { count: number; resetAt: Date };
      try {
        result = await prisma.$transaction(async (tx) => {
          const existing = await tx.rateLimitBucket.findUnique({
            where: { id },
          });
          if (!existing || existing.resetAt <= now) {
            const resetAt = new Date(now.getTime() + options.windowMs);
            return tx.rateLimitBucket.upsert({
              where: { id },
              create: { id, count: 1, resetAt },
              update: { count: 1, resetAt },
            });
          }
          return tx.rateLimitBucket.update({
            where: { id },
            data: { count: { increment: 1 } },
          });
        });
      } catch (err) {
        console.error(
          "[rateLimit] durable store unavailable; using in-memory fallback:",
          err instanceof Error ? err.message : err,
        );
        memoryFallback(req, res, next);
        return;
      }

      if (result.count > options.max) {
        const retryAfterSec = Math.max(
          1,
          Math.ceil((result.resetAt.getTime() - now.getTime()) / 1000),
        );
        res.setHeader("Retry-After", String(retryAfterSec));
        res.status(429).json({
          error: `Too many ${options.name} requests. Try again in ${retryAfterSec}s.`,
        });
        return;
      }
      next();
    })().catch(next);
  };
}

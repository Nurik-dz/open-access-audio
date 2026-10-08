import type { NextFunction, Request, Response } from "express";

/**
 * Minimal fixed-window, per-IP rate limiter. In-memory, so it only protects a single
 * process; that is exactly the deployment this app targets.
 */
export function createRateLimiter(limit: number, windowMs = 60_000) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, windowMs);
  sweeper.unref();

  return function rateLimit(req: Request, res: Response, next: NextFunction) {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    if (entry.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        success: false,
        error: `Too many requests. Try again in ${retryAfter}s.`,
      });
    }
    next();
  };
}

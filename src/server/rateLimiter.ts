import { Request, Response, NextFunction } from 'express';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
}

interface ClientRecord {
  count: number;
  resetTime: number;
}

/**
 * High-performance, lightweight in-memory sliding-window rate limiter
 * Returns HTTP 429 when threshold is reached and sets standard Retry-After headers.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const store = new Map<string, ClientRecord>();

  // Periodically sweep expired entries to prevent memory growth
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      if (record.resetTime <= now) {
        store.delete(key);
      }
    }
  }, Math.min(options.windowMs, 60000));

  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      req.ip ||
      'unknown-client';

    const key = options.keyGenerator ? options.keyGenerator(req) : clientIp;
    const now = Date.now();
    let record = store.get(key);

    if (!record || record.resetTime <= now) {
      record = { count: 0, resetTime: now + options.windowMs };
      store.set(key, record);
    }

    // For failure-only rate limiting (e.g. login brute force protection)
    if (options.skipSuccessfulRequests) {
      if (record.count >= options.max) {
        const retryAfterSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
        res.setHeader('Retry-After', retryAfterSeconds.toString());
        res.setHeader('X-RateLimit-Limit', options.max.toString());
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000).toString());
        return res.status(429).json({
          error: 'RATE_LIMIT_EXCEEDED',
          message: options.message || 'تم تجاوز الحد المسموح به من المحاولات الفاشلة. يرجى الانتظار والمحاولة لاحقاً.',
          retryAfterSeconds
        });
      }

      // Intercept finish to count only 4xx client errors
      res.on('finish', () => {
        if (res.statusCode >= 400 && res.statusCode < 500) {
          if (record) {
            record.count++;
          }
        }
      });

      return next();
    }

    if (record.count >= options.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
      res.setHeader('Retry-After', retryAfterSeconds.toString());
      res.setHeader('X-RateLimit-Limit', options.max.toString());
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000).toString());
      return res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: options.message || 'تم تجاوز الحد المسموح به من الطلبات. يرجى الانتظار والمحاولة لاحقاً.',
        retryAfterSeconds
      });
    }

    record.count++;
    res.setHeader('X-RateLimit-Limit', options.max.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, options.max - record.count).toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000).toString());
    next();
  };
}

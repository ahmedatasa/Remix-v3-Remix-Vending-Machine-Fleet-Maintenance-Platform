import { Request, Response, NextFunction } from 'express';

interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
}

interface ClientRecord {
  count: number;
  resetTime: number;
}

export function createCloudRateLimiter(options: RateLimitConfig) {
  const clients = new Map<string, ClientRecord>();

  // Periodically clean expired records
  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of clients.entries()) {
      if (now > record.resetTime) {
        clients.delete(ip);
      }
    }
  }, 60 * 1000).unref?.();

  return (req: Request, res: Response, next: NextFunction) => {
    const ip =
      req.ip ||
      req.socket.remoteAddress ||
      'unknown-ip';

    const now = Date.now();
    const record = clients.get(ip);

    if (!record || now > record.resetTime) {
      clients.set(ip, {
        count: 1,
        resetTime: now + options.windowMs
      });
      res.setHeader('X-RateLimit-Limit', options.max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, options.max - 1));
      return next();
    }

    if (record.count >= options.max) {
      const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);
      res.setHeader('X-RateLimit-Limit', options.max);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));
      return res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: options.message || 'تم تجاوز الحد الأقصى للطلبات. يرجى الانتظار والمحاولة لاحقاً.',
        retryAfterSeconds
      });
    }

    record.count++;
    res.setHeader('X-RateLimit-Limit', options.max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, options.max - record.count));

    if (options.skipSuccessfulRequests) {
      res.on('finish', () => {
        if (res.statusCode < 400 && record.count > 0) {
          record.count--;
        }
      });
    }

    next();
  };
}

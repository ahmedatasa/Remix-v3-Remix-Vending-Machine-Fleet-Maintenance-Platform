import { Request, Response, NextFunction } from 'express';
import { cloudConfig } from '../config/cloudConfig';

export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

export function cloudCors(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;

  // In development, allow localhost and loopback
  if (cloudConfig.isDev) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  } else if (origin) {
    const allowed = [
      ...cloudConfig.publicWebOrigin,
      ...cloudConfig.technicianWebOrigin,
      ...cloudConfig.adminOrigin
    ];
    if (allowed.length === 0 || allowed.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-technician-token, x-sync-client-id, x-sync-client-secret, x-idempotency-key');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
}

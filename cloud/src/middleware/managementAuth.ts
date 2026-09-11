import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { cloudConfig } from '../config/cloudConfig';

const ALLOWED_MANAGEMENT_ROLES = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'MAINTENANCE_MANAGER'
]);

function secureEqual(actual: string, expected: string): boolean {
  if (!actual || !expected) return false;

  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

/**
 * Authenticates trusted Main Server -> Cloud management traffic.
 *
 * Security model:
 * - Browser clients must never possess these credentials.
 * - Management credentials are independent from Desktop Sync credentials.
 * - Actor identity is accepted only after the management client is authenticated.
 * - Location management routes must use req.managementActor rather than
 *   actorId/actorName/approverId supplied by request bodies.
 */
export function requireCloudManagementAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const clientId = String(
    req.headers['x-management-client-id'] || ''
  ).trim();

  const clientSecret = String(
    req.headers['x-management-client-secret'] || ''
  ).trim();

  if (!cloudConfig.managementClientId || !cloudConfig.managementClientSecret) {
    return res.status(503).json({
      error: 'MANAGEMENT_AUTH_NOT_CONFIGURED',
      message: 'Cloud management authentication is not configured.'
    });
  }

  if (!clientId || !clientSecret) {
    return res.status(401).json({
      error: 'MANAGEMENT_UNAUTHORIZED',
      message: 'Management authentication credentials are required.'
    });
  }

  const validClient =
    secureEqual(clientId, cloudConfig.managementClientId) &&
    secureEqual(clientSecret, cloudConfig.managementClientSecret);

  if (!validClient) {
    return res.status(403).json({
      error: 'MANAGEMENT_FORBIDDEN',
      message: 'Invalid management authentication credentials.'
    });
  }

  const actorId = String(
    req.headers['x-management-actor-id'] || ''
  ).trim();

  const actorNameEncoded = String(
    req.headers['x-management-actor-name-b64'] || ''
  ).trim();

  let actorName = '';

  if (actorNameEncoded) {
    try {
      actorName = Buffer
        .from(actorNameEncoded, 'base64url')
        .toString('utf8')
        .trim();
    } catch {
      actorName = '';
    }
  }

  const actorRole = String(
    req.headers['x-management-actor-role'] || ''
  ).trim().toUpperCase();

  if (!actorId || !actorName || !actorRole) {
    return res.status(400).json({
      error: 'MANAGEMENT_ACTOR_REQUIRED',
      message: 'Trusted management actor context is required.'
    });
  }

  if (!ALLOWED_MANAGEMENT_ROLES.has(actorRole)) {
    return res.status(403).json({
      error: 'MANAGEMENT_ROLE_FORBIDDEN',
      message: 'The authenticated management actor is not authorized.'
    });
  }

  (req as any).managementActor = {
    id: actorId,
    name: actorName,
    role: actorRole
  };

  next();
}

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { cloudConfig } from '../config/cloudConfig';

const ALLOWED_TICKET_LIFECYCLE_ROLES = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'MAINTENANCE_MANAGER',
  'TECHNICIAN'
]);

function secureEqual(actual: string, expected: string): boolean {
  if (!actual || !expected) return false;

  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function requireCloudTicketLifecycleAuth(
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

  if (
    !secureEqual(clientId, cloudConfig.managementClientId) ||
    !secureEqual(clientSecret, cloudConfig.managementClientSecret)
  ) {
    return res.status(403).json({
      error: 'MANAGEMENT_FORBIDDEN',
      message: 'Invalid management authentication credentials.'
    });
  }

  const actorId = String(
    req.headers['x-management-actor-id'] || ''
  ).trim();

  const encodedName = String(
    req.headers['x-management-actor-name-b64'] || ''
  ).trim();

  let actorName = '';

  try {
    actorName = Buffer
      .from(encodedName, 'base64url')
      .toString('utf8')
      .trim();
  } catch {
    actorName = '';
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

  if (!ALLOWED_TICKET_LIFECYCLE_ROLES.has(actorRole)) {
    return res.status(403).json({
      error: 'TICKET_LIFECYCLE_ROLE_FORBIDDEN',
      message: 'Actor is not authorized to update ticket lifecycle.'
    });
  }

  (req as any).managementActor = {
    id: actorId,
    name: actorName,
    role: actorRole
  };

  next();
}

// Generic trusted Main -> Cloud ticket-management authentication.
// Kept as an alias so existing lifecycle integrations remain compatible.
export const requireCloudTicketManagementAuth =
  requireCloudTicketLifecycleAuth;

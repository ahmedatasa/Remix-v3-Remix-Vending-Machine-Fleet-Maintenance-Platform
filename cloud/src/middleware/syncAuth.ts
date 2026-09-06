import { Request, Response, NextFunction } from 'express';
import { cloudConfig } from '../config/cloudConfig';
import { cloudDb } from '../db/cloudDb';

export function requireSyncAuth(req: Request, res: Response, next: NextFunction) {
  const clientId = req.headers['x-sync-client-id'] as string;
  const clientSecret = req.headers['x-sync-client-secret'] as string;

  if (!clientId || !clientSecret) {
    cloudDb.logAudit('DESKTOP_SYNC', 'ANONYMOUS', 'Desktop Sync Client', 'SYNC_AUTH_FAILED', 'SYNC_API', 'BLOCKED', {
      reason: 'MISSING_SYNC_CREDENTIALS',
      ip: req.ip
    });
    return res.status(401).json({
      error: 'SYNC_UNAUTHORIZED',
      message: 'بيانات اعتماد مزامنة سطح المكتب مفقودة. يرجى توفير x-sync-client-id و x-sync-client-secret.'
    });
  }

  if (clientId !== cloudConfig.syncClientId || clientSecret !== cloudConfig.syncClientSecret) {
    cloudDb.logAudit('DESKTOP_SYNC', clientId, 'Unknown Sync Client', 'SYNC_AUTH_FAILED', 'SYNC_API', 'BLOCKED', {
      reason: 'INVALID_SYNC_CREDENTIALS',
      ip: req.ip
    });
    return res.status(403).json({
      error: 'SYNC_FORBIDDEN',
      message: 'بيانات اعتماد مزامنة سطح المكتب غير صحيحة.'
    });
  }

  next();
}

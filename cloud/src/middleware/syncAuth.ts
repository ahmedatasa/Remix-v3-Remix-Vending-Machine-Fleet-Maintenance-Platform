import { Request, Response, NextFunction } from 'express';
import { cloudConfig } from '../config/cloudConfig';
import { getCloudRepository } from '../repositories';

export async function requireSyncAuth(req: Request, res: Response, next: NextFunction) {
  const clientId = req.headers['x-sync-client-id'] as string;
  const clientSecret = req.headers['x-sync-client-secret'] as string;
  const repo = getCloudRepository();

  if (!clientId || !clientSecret) {
    await repo.audit.log({
      actorType: 'DESKTOP_SYNC',
      actorId: 'ANONYMOUS',
      actorName: 'Desktop Sync Client',
      action: 'SYNC_AUTH_FAILED',
      entity: 'SYNC_API',
      result: 'BLOCKED',
      details: {
        reason: 'MISSING_SYNC_CREDENTIALS',
        ip: req.ip
      },
      ip: req.ip
    });
    return res.status(401).json({
      error: 'SYNC_UNAUTHORIZED',
      message: 'بيانات اعتماد مزامنة سطح المكتب مفقودة. يرجى توفير x-sync-client-id و x-sync-client-secret.'
    });
  }

  if (clientId !== cloudConfig.syncClientId || clientSecret !== cloudConfig.syncClientSecret) {
    await repo.audit.log({
      actorType: 'DESKTOP_SYNC',
      actorId: clientId,
      actorName: 'Unknown Sync Client',
      action: 'SYNC_AUTH_FAILED',
      entity: 'SYNC_API',
      result: 'BLOCKED',
      details: {
        reason: 'INVALID_SYNC_CREDENTIALS',
        ip: req.ip
      },
      ip: req.ip
    });
    return res.status(403).json({
      error: 'SYNC_FORBIDDEN',
      message: 'بيانات اعتماد مزامنة سطح المكتب غير صحيحة.'
    });
  }

  next();
}

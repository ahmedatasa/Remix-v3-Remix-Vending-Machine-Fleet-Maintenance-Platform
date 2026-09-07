import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getCloudRepository } from '../repositories';

export async function requireCloudTechnicianAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers['authorization'] || req.headers['x-technician-token'];
    let rawToken = '';

    if (typeof authHeader === 'string') {
      rawToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : authHeader.trim();
    }

    if (!rawToken) {
      return res.status(401).json({
        error: 'TECHNICIAN_AUTH_REQUIRED',
        message: 'رمز جلسة الفني مفقود. يرجى تسجيل الدخول إلى بوابة الفنيين السحابية أولاً.'
      });
    }

    const repo = getCloudRepository();
    // Tokens are stored server-side as SHA-256 hashes to prevent plain token compromise
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const session = await repo.sessions.findSessionByTokenHash(tokenHash);

    if (!session) {
      await repo.audit.log({
        actorType: 'ANONYMOUS',
        actorId: 'UNKNOWN',
        actorName: 'Unknown Actor',
        action: 'INVALID_SESSION_TOKEN',
        entity: 'SESSION',
        result: 'FAILURE',
        details: { ip: req.ip },
        ip: req.ip
      });
      return res.status(401).json({
        error: 'INVALID_TECHNICIAN_SESSION',
        message: 'جلسة العمل غير صالحة أو تم تسجيل الخروج. يرجى إعادة تسجيل الدخول.'
      });
    }

    // Check 8-hour expiry
    const expiresAt = new Date(session.expiresAt).getTime();
    if (Date.now() > expiresAt) {
      await repo.sessions.deleteSession(session.sessionId);
      return res.status(401).json({
        error: 'TECHNICIAN_SESSION_EXPIRED',
        message: 'انتهت صلاحية جلسة العمل الميدانية (أقصى مدة 8 ساعات). يرجى تسجيل الدخول مجدداً.'
      });
    }

    // Verify technician account status
    const tech = (await repo.technicians.findById(session.technicianId)) || (await repo.technicians.findByEmployeeCode(session.employeeCode));
    if (tech && tech.status === 'DISABLED') {
      await repo.sessions.deleteSession(session.sessionId);
      return res.status(403).json({
        error: 'TECHNICIAN_ACCOUNT_DISABLED',
        message: 'تم تعطيل حساب الفني من قبل إدارة النظام. تم إنهاء الجلسة.'
      });
    }

    (req as any).technician = tech || {
      id: session.technicianId,
      employeeCode: session.employeeCode,
      fullName: session.fullName
    };
    (req as any).technicianSession = session;
    (req as any).sessionTokenHash = tokenHash;

    next();
  } catch (err: any) {
    return res.status(500).json({
      error: 'AUTH_MIDDLEWARE_ERROR',
      message: err.message
    });
  }
}

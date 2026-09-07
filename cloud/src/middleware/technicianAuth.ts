import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getCloudRepository } from '../repositories';

/**
 * Technician authentication middleware.
 *
 * Security rules:
 * - Raw session tokens are never stored in PostgreSQL.
 * - Session tokens are SHA-256 hashed before lookup.
 * - passwordHash must NEVER be attached to req or returned to clients.
 * - tokenHash must NEVER be returned to clients.
 * - Expired/disabled sessions are invalidated immediately.
 */
export async function requireCloudTechnicianAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // -------------------------------------------------------------------------
    // 1. Extract technician session token
    // -------------------------------------------------------------------------

    const authHeader =
      req.headers['authorization'] ||
      req.headers['x-technician-token'];

    let rawToken = '';

    if (typeof authHeader === 'string') {
      rawToken = authHeader.startsWith('Bearer ')
        ? authHeader.substring(7).trim()
        : authHeader.trim();
    }

    if (!rawToken) {
      return res.status(401).json({
        error: 'TECHNICIAN_AUTH_REQUIRED',
        message:
          'رمز جلسة الفني مفقود. يرجى تسجيل الدخول إلى بوابة الفنيين السحابية أولاً.'
      });
    }

    // -------------------------------------------------------------------------
    // 2. Hash token before repository lookup
    // -------------------------------------------------------------------------

    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const repo = getCloudRepository();

    const session =
      await repo.sessions.findSessionByTokenHash(tokenHash);

    if (!session) {
      await repo.audit.log({
        actorType: 'ANONYMOUS',
        actorId: 'UNKNOWN',
        actorName: 'Unknown Actor',
        action: 'INVALID_SESSION_TOKEN',
        entity: 'SESSION',
        result: 'FAILURE',
        details: {
          ip: req.ip
        },
        ip: req.ip
      });

      return res.status(401).json({
        error: 'INVALID_TECHNICIAN_SESSION',
        message:
          'جلسة العمل غير صالحة أو تم تسجيل الخروج. يرجى إعادة تسجيل الدخول.'
      });
    }

    // -------------------------------------------------------------------------
    // 3. Validate 8-hour session expiry
    // -------------------------------------------------------------------------

    const expiresAt =
      new Date(session.expiresAt).getTime();

    if (
      !Number.isFinite(expiresAt) ||
      Date.now() > expiresAt
    ) {
      await repo.sessions.deleteSession(
        session.sessionId
      );

      return res.status(401).json({
        error: 'TECHNICIAN_SESSION_EXPIRED',
        message:
          'انتهت صلاحية جلسة العمل الميدانية (أقصى مدة 8 ساعات). يرجى تسجيل الدخول مجدداً.'
      });
    }

    // -------------------------------------------------------------------------
    // 4. Load authoritative technician account
    // -------------------------------------------------------------------------

    const tech =
      (await repo.technicians.findById(
        session.technicianId
      )) ||
      (await repo.technicians.findByEmployeeCode(
        session.employeeCode
      ));

    if (
      tech &&
      tech.status === 'DISABLED'
    ) {
      await repo.sessions.deleteSession(
        session.sessionId
      );

      await repo.audit.log({
        actorType: 'TECHNICIAN',
        actorId: tech.employeeCode,
        actorName: tech.fullName,
        action: 'TECHNICIAN_SESSION_TERMINATED',
        entity: 'SESSION',
        result: 'BLOCKED',
        details: {
          reason: 'ACCOUNT_DISABLED',
          ip: req.ip
        },
        ip: req.ip
      });

      return res.status(403).json({
        error: 'TECHNICIAN_ACCOUNT_DISABLED',
        message:
          'تم تعطيل حساب الفني من قبل إدارة النظام. تم إنهاء الجلسة.'
      });
    }

    // -------------------------------------------------------------------------
    // 5. SECURITY: Build sanitized technician object explicitly.
    //
    // NEVER attach:
    // - passwordHash
    // - tokenHash
    // - password
    // - PIN
    // - database/internal secrets
    // -------------------------------------------------------------------------

    const sanitizedTechnician = tech
      ? {
          id: tech.id,
          employeeCode: tech.employeeCode,
          fullName: tech.fullName,
          email: tech.email,
          phone: tech.phone,
          specialization: tech.specialization,
          status: tech.status
        }
      : {
          id: session.technicianId,
          employeeCode: session.employeeCode,
          fullName: session.fullName,
          email: '',
          phone: undefined,
          specialization: undefined,
          status: 'ACTIVE'
        };

    // -------------------------------------------------------------------------
    // 6. Attach sanitized authenticated context to request
    // -------------------------------------------------------------------------

    (req as any).technician =
      sanitizedTechnician;

    (req as any).technicianSession = {
      sessionId: session.sessionId,
      technicianId: session.technicianId,
      employeeCode: session.employeeCode,
      fullName: session.fullName,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt
    };

    /**
     * Internal-only value required by logout.
     * This is never returned by /technician/me.
     */
    (req as any).sessionTokenHash =
      tokenHash;

    next();
  } catch (err: unknown) {
    /**
     * Do not expose internal exception details to public clients.
     */
    console.error(
      '[TechnicianAuth] Authentication middleware failure:',
      err instanceof Error
        ? err.message
        : String(err)
    );

    return res.status(500).json({
      error: 'AUTH_MIDDLEWARE_ERROR',
      message:
        'حدث خطأ داخلي أثناء التحقق من جلسة الفني.'
    });
  }
}
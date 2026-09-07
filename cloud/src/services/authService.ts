import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type { CloudTechnicianSession } from '../db/cloudDb';
import { getCloudRepository } from '../repositories';

export interface TechnicianLoginResult {
  success: boolean;
  token: string;
  expiresAt: string;
  technician: {
    id: string;
    employeeCode: string;
    fullName: string;
    email: string;
    phone?: string;
    specialization?: string;
    status: string;
  };
}

export class AuthService {
  /**
   * Secure technician authentication
   * FIX 1: Strict rejection of unknown technicians
   * FIX 2: Rejection of unconfigured credentials (no bcrypt hash)
   * FIX 3: 192-bit cryptographic session token with SHA-256 server storage
   * FIX 4: 8-hour expiry window
   */
  public static async loginTechnician(
    identifier: string,
    secret: string,
    clientIp?: string
  ): Promise<TechnicianLoginResult> {
    const repo = getCloudRepository();
    const cleanId = (identifier || '').trim();
    const cleanSecret = (secret || '').trim();

    if (!cleanId) {
      throw new Error('CREDENTIALS_REQUIRED: الكود الوظيفي أو البريد الإلكتروني مطلوب.');
    }
    if (!cleanSecret) {
      throw new Error('CREDENTIALS_REQUIRED: كلمة المرور أو رمز الـ PIN مطلوب.');
    }

    // Lookup technician in authoritative cloud accounts
    const tech = await repo.technicians.findByEmployeeCode(cleanId);

    if (!tech) {
      await repo.audit.log({
        actorType: 'TECHNICIAN',
        actorId: cleanId,
        actorName: 'Unknown Technician',
        action: 'TECHNICIAN_LOGIN_FAILED',
        entity: 'AUTH',
        result: 'FAILURE',
        details: {
          reason: 'TECHNICIAN_NOT_FOUND',
          ip: clientIp
        },
        ip: clientIp
      });
      throw new Error('TECHNICIAN_NOT_AUTHORIZED: الفني غير مسجل في النظام السحابي أو حسابه غير مفعل.');
    }

    if (tech.status === 'DISABLED') {
      await repo.audit.log({
        actorType: 'TECHNICIAN',
        actorId: tech.employeeCode,
        actorName: tech.fullName,
        action: 'TECHNICIAN_LOGIN_FAILED',
        entity: 'AUTH',
        result: 'BLOCKED',
        details: {
          reason: 'ACCOUNT_DISABLED',
          ip: clientIp
        },
        ip: clientIp
      });
      throw new Error('TECHNICIAN_ACCOUNT_DISABLED: تم تعطيل حساب الفني من قبل إدارة النظام.');
    }

    if (!tech.passwordHash) {
      await repo.audit.log({
        actorType: 'TECHNICIAN',
        actorId: tech.employeeCode,
        actorName: tech.fullName,
        action: 'TECHNICIAN_LOGIN_FAILED',
        entity: 'AUTH',
        result: 'BLOCKED',
        details: {
          reason: 'NO_CREDENTIALS_CONFIGURED',
          ip: clientIp
        },
        ip: clientIp
      });
      throw new Error('TECHNICIAN_CREDENTIALS_NOT_CONFIGURED: لم يتم ضبط كلمة مرور أو رمز PIN لهذا الحساب بعد.');
    }

    // Secure bcrypt hash verification
    const isValid = bcrypt.compareSync(cleanSecret, tech.passwordHash);
    if (!isValid) {
      await repo.audit.log({
        actorType: 'TECHNICIAN',
        actorId: tech.employeeCode,
        actorName: tech.fullName,
        action: 'TECHNICIAN_LOGIN_FAILED',
        entity: 'AUTH',
        result: 'FAILURE',
        details: {
          reason: 'INVALID_CREDENTIALS',
          ip: clientIp
        },
        ip: clientIp
      });
      throw new Error('INVALID_CREDENTIALS: كلمة المرور أو رمز الـ PIN غير صحيح.');
    }

    // Generate 192-bit cryptographic session token
    const rawToken = `tech-sess-${crypto.randomBytes(24).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString();

    // Store session in authoritative repository
    const session: CloudTechnicianSession = {
      sessionId: `sess-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      tokenHash,
      technicianId: tech.id,
      employeeCode: tech.employeeCode,
      fullName: tech.fullName,
      createdAt: now.toISOString(),
      expiresAt
    };
    await repo.sessions.createSession(session);

    await repo.audit.log({
      actorType: 'TECHNICIAN',
      actorId: tech.employeeCode,
      actorName: tech.fullName,
      action: 'TECHNICIAN_LOGIN_SUCCESS',
      entity: 'AUTH',
      result: 'SUCCESS',
      details: {
        expiresAt,
        ip: clientIp
      },
      ip: clientIp
    });

    return {
      success: true,
      token: rawToken,
      expiresAt,
      technician: {
        id: tech.id,
        employeeCode: tech.employeeCode,
        fullName: tech.fullName,
        email: tech.email,
        phone: tech.phone,
        specialization: tech.specialization,
        status: tech.status
      }
    };
  }

  public static async logoutTechnician(tokenHash: string): Promise<boolean> {
    const repo = getCloudRepository();
    const session = await repo.sessions.findSessionByTokenHash(tokenHash);
    if (session) {
      await repo.sessions.deleteSession(session.sessionId);
      return true;
    }
    return false;
  }
}

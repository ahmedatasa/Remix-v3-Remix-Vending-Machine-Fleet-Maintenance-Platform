import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { cloudDb, CloudTechnicianAccount } from '../db/cloudDb';

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
    const cleanId = (identifier || '').trim().toLowerCase();
    const cleanSecret = (secret || '').trim();

    if (!cleanId) {
      throw new Error('CREDENTIALS_REQUIRED: الكود الوظيفي أو البريد الإلكتروني مطلوب.');
    }
    if (!cleanSecret) {
      throw new Error('CREDENTIALS_REQUIRED: كلمة المرور أو رمز الـ PIN مطلوب.');
    }

    // Lookup technician in cloud accounts
    const tech = cloudDb.getData().technician_accounts.find(t => {
      const code = (t.employeeCode || '').toLowerCase().trim();
      const mail = (t.email || '').toLowerCase().trim();
      const id = (t.id || '').toLowerCase().trim();
      return code === cleanId || mail === cleanId || id === cleanId;
    });

    if (!tech) {
      cloudDb.logAudit('TECHNICIAN', cleanId, 'Unknown Technician', 'TECHNICIAN_LOGIN_FAILED', 'AUTH', 'FAILURE', {
        reason: 'TECHNICIAN_NOT_FOUND',
        ip: clientIp
      });
      throw new Error('TECHNICIAN_NOT_AUTHORIZED: الفني غير مسجل في النظام السحابي أو حسابه غير مفعل.');
    }

    if (tech.status === 'DISABLED') {
      cloudDb.logAudit('TECHNICIAN', tech.employeeCode, tech.fullName, 'TECHNICIAN_LOGIN_FAILED', 'AUTH', 'BLOCKED', {
        reason: 'ACCOUNT_DISABLED',
        ip: clientIp
      });
      throw new Error('TECHNICIAN_ACCOUNT_DISABLED: تم تعطيل حساب الفني من قبل إدارة النظام.');
    }

    if (!tech.passwordHash) {
      cloudDb.logAudit('TECHNICIAN', tech.employeeCode, tech.fullName, 'TECHNICIAN_LOGIN_FAILED', 'AUTH', 'BLOCKED', {
        reason: 'NO_CREDENTIALS_CONFIGURED',
        ip: clientIp
      });
      throw new Error('TECHNICIAN_CREDENTIALS_NOT_CONFIGURED: لم يتم ضبط كلمة مرور أو رمز PIN لهذا الحساب بعد.');
    }

    // Secure bcrypt hash verification
    const isValid = bcrypt.compareSync(cleanSecret, tech.passwordHash);
    if (!isValid) {
      cloudDb.logAudit('TECHNICIAN', tech.employeeCode, tech.fullName, 'TECHNICIAN_LOGIN_FAILED', 'AUTH', 'FAILURE', {
        reason: 'INVALID_CREDENTIALS',
        ip: clientIp
      });
      throw new Error('INVALID_CREDENTIALS: كلمة المرور أو رمز الـ PIN غير صحيح.');
    }

    // Generate 192-bit cryptographic session token
    const rawToken = `tech-sess-${crypto.randomBytes(24).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString();

    // Store ONLY the token hash server-side
    cloudDb.getData().technician_sessions[tokenHash] = {
      sessionId: `sess-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      tokenHash,
      technicianId: tech.id,
      employeeCode: tech.employeeCode,
      fullName: tech.fullName,
      createdAt: now.toISOString(),
      expiresAt
    };
    cloudDb.save();

    cloudDb.logAudit('TECHNICIAN', tech.employeeCode, tech.fullName, 'TECHNICIAN_LOGIN_SUCCESS', 'AUTH', 'SUCCESS', {
      expiresAt,
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

  public static logoutTechnician(tokenHash: string): boolean {
    if (cloudDb.getData().technician_sessions[tokenHash]) {
      delete cloudDb.getData().technician_sessions[tokenHash];
      cloudDb.save();
      return true;
    }
    return false;
  }
}

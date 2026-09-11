import readline from 'readline';
import { getRuntimeStoreManager, RuntimeStoreManager } from './runtimeStoreManager';
import {
  validatePasswordStrength,
  hashPassword,
  invalidateUserSessions
} from './authSecurity';

export interface RecoverAdminOptions {
  email?: string;
  targetEmail?: string;
  newPassword?: string;
  storeManager?: RuntimeStoreManager;
}

export interface RecoverAdminResult {
  success: boolean;
  message: string;
  backupFile?: string;
  targetUser?: {
    id: string;
    email: string;
    fullName: string;
    role: string;
  };
}

/**
 * PHASE 5.4.7C: Secure Local Server Admin Recovery Engine
 *
 * Executable ONLY from server terminal / filesystem.
 * Strictly operates on existing SUPER_ADMIN accounts.
 * NEVER creates a new administrator or modifies other operational fleet records.
 */
export async function recoverSuperAdminCredential(
  options: RecoverAdminOptions
): Promise<RecoverAdminResult> {
  const manager = options.storeManager || getRuntimeStoreManager();
  const store = manager.getStore();

  const users = store.users || [];
  if (users.length === 0) {
    throw new Error('لا يوجد مستخدمون في النظام. النظام بحاجة إلى تهيئة أولية وليس استعادة.');
  }

  // 1. Locate all existing SUPER_ADMIN accounts
  const superAdmins = users.filter((u: any) => u.role === 'SUPER_ADMIN');
  if (superAdmins.length === 0) {
    throw new Error(
      'لم يتم العثور على أي حساب برتبة المشرف العام (SUPER_ADMIN) في النظام لاستعادته.'
    );
  }

  // 2. Select the target SUPER_ADMIN
  let targetUser: any = null;
  const specifiedEmail = (options.targetEmail || options.email || '').trim();
  if (specifiedEmail) {
    const cleanEmail = specifiedEmail.toLowerCase();
    targetUser = superAdmins.find((u: any) => u.email?.trim().toLowerCase() === cleanEmail);
    if (!targetUser) {
      throw new Error(
        `No SUPER_ADMIN user found with email '${cleanEmail}'. Recovery only operates on existing SUPER_ADMIN accounts.`
      );
    }
  } else if (superAdmins.length === 1) {
    targetUser = superAdmins[0];
  } else {
    throw new Error(
      `توجد عدة حسابات برتبة SUPER_ADMIN (${superAdmins.map((u: any) => u.email).join(', ')}). يجب تحديد البريد الإلكتروني للحساب المطلوب بدقة.`
    );
  }

  // 3. Validate new password
  if (!options.newPassword) {
    throw new Error('كلمة المرور الجديدة مطلوبة.');
  }

  const pwCheck = validatePasswordStrength(options.newPassword);
  if (!pwCheck.valid) {
    throw new Error(pwCheck.error || 'كلمة المرور لا تحقق اشتراطات الأمان (10 خانات على الأقل).');
  }

  // 4. Create pre-change backup using existing persistence mechanism
  let backupFile = '';
  try {
    backupFile = manager.createBackup('pre-admin-recovery');
  } catch (err: any) {
    console.warn('[Recovery] Backup notice:', err?.message);
  }

  // 5. Hash password with bcrypt (work factor 10)
  const passwordHash = hashPassword(options.newPassword);

  // 6. Update target user record
  targetUser.passwordHash = passwordHash;
  delete targetUser.password;
  delete targetUser.passwordSalt;
  delete targetUser.resetToken;
  delete targetUser.resetSecret;
  targetUser.isActive = true;
  targetUser.updatedAt = new Date().toISOString();

  // 7. Revoke any existing active sessions for this user
  invalidateUserSessions(targetUser.id);

  // 8. Persist authoritative audit event
  if (!store.auditLogs) store.auditLogs = [];
  store.auditLogs.unshift({
    id: `aud-recovery-${Date.now()}`,
    action: 'ADMIN_CREDENTIAL_RECOVERED_LOCALLY',
    entityName: 'User',
    entityId: targetUser.email,
    userName: targetUser.fullName || targetUser.name || 'System Operator (Console)',
    newValues: {
      message: 'تمت استعادة بيانات مرور المشرف العام بنجاح عبر أداة الاستعادة المحلية بالخادم',
      email: targetUser.email,
      role: 'SUPER_ADMIN',
      backupFile: backupFile || undefined
    },
    createdAt: new Date().toISOString()
  });

  // 9. Save updated store atomically
  manager.saveStore(store);

  return {
    success: true,
    message: `تمت استعادة حساب المشرف العام (${targetUser.email}) بنجاح.`,
    backupFile,
    targetUser: {
      id: targetUser.id,
      email: targetUser.email,
      fullName: targetUser.fullName || targetUser.name || '',
      role: targetUser.role
    }
  };
}

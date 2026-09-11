import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import { createRateLimiter } from './rateLimiter';

export interface ServerSession {
  token: string;
  userId: string;
  userRole: string;
  userEmail: string;
  createdAt: number;
  expiresAt: number;
}

// In-memory server-authoritative session store
const sessionStore = new Map<string, ServerSession>();

// Session configuration: 24-hour lifetime
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Validate password strength against policy:
 * - Must be non-empty string
 * - Minimum 10 characters
 */
export function validatePasswordStrength(password: unknown): { valid: boolean; error?: string } {
  if (typeof password !== 'string' || !password.trim()) {
    return { valid: false, error: 'كلمة المرور مطلوبة ولا يمكن أن تكون فارغة' };
  }
  if (password.length < 10) {
    return { valid: false, error: 'يجب ألا تقل كلمة المرور عن 10 أحرف' };
  }
  return { valid: true };
}

/**
 * Hash password securely with bcryptjs (work factor 10)
 */
export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

/**
 * Verify plaintext password against bcrypt hash
 */
export function verifyPassword(password: string, hash: string): boolean {
  try {
    if (!password || !hash) return false;
    return bcrypt.compareSync(password, hash);
  } catch {
    return false;
  }
}

/**
 * Sanitize user object to ensure no credential material leaves the server
 */
export function sanitizeUserForClient(user: any): any {
  if (!user || typeof user !== 'object') return null;
  const isInactive = user.isActive === false || user.status === 'INACTIVE' || user.isDeleted === true;
  const sanitized = { ...user, isActive: !isInactive };
  delete sanitized.password;
  delete sanitized.passwordHash;
  delete sanitized.passwordSalt;
  delete sanitized.resetToken;
  delete sanitized.resetSecret;
  return sanitized;
}

/**
 * Create a new cryptographically secure session
 */
export function createSession(user: any, ttlMs: number = SESSION_TTL_MS): ServerSession {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const session: ServerSession = {
    token,
    userId: user.id,
    userRole: (user.role || '').toUpperCase().trim(),
    userEmail: (user.email || '').toLowerCase().trim(),
    createdAt: now,
    expiresAt: now + ttlMs
  };
  sessionStore.set(token, session);
  return session;
}

/**
 * Create a session for test simulation (supports custom expiration / properties)
 */
export function createTestSession(user: any, overrides: Partial<ServerSession> = {}): ServerSession {
  const session = createSession(user);
  Object.assign(session, overrides);
  sessionStore.set(session.token, session);
  return session;
}

/**
 * Retrieve session by token. Deletes expired sessions automatically.
 */
export function getSession(token: string): ServerSession | null {
  if (!token) return null;
  const session = sessionStore.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessionStore.delete(token);
    return null;
  }
  return session;
}

export const validateSession = getSession;

/**
 * Delete a session (logout)
 */
export function deleteSession(token: string): boolean {
  if (!token) return false;
  return sessionStore.delete(token);
}

/**
 * Invalidate all active sessions for a specific user ID
 */
export function invalidateUserSessions(userId: string): void {
  for (const [token, session] of sessionStore.entries()) {
    if (session.userId === userId) {
      sessionStore.delete(token);
    }
  }
}

/**
 * Clear all sessions (for test harness isolation)
 */
export function clearAllSessions(): void {
  sessionStore.clear();
}

/**
 * Get active session count (for diagnostics)
 */
export function getActiveSessionCount(): number {
  return sessionStore.size;
}

/**
 * Create the authoritative requireAuth middleware
 */
export function createRequireAuth(getStore: () => any) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentication required. No bearer token provided.',
        code: 'UNAUTHORIZED'
      });
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      return res.status(401).json({
        error: 'Authentication required. Empty bearer token provided.',
        code: 'UNAUTHORIZED'
      });
    }

    const session = getSession(token);
    if (!session) {
      return res.status(401).json({
        error: 'Invalid or expired authentication session. Please log in again.',
        code: 'UNAUTHORIZED'
      });
    }

    const store = getStore();
    const user = (store?.users || []).find((u: any) => u.id === session.userId);
    if (!user) {
      deleteSession(token);
      return res.status(401).json({
        error: 'User account associated with this session no longer exists.',
        code: 'USER_NOT_FOUND'
      });
    }

    const isInactive = user.isActive === false || user.status === 'INACTIVE' || user.isDeleted === true;
    if (isInactive) {
      deleteSession(token);
      return res.status(403).json({
        error: 'User account has been deactivated.',
        code: 'USER_DEACTIVATED'
      });
    }

    (req as any).user = sanitizeUserForClient(user);
    (req as any).userRole = (user.role || '').toUpperCase().trim();
    (req as any).rawUser = user;
    (req as any).session = session;
    next();
  };
}

/**
 * Authoritative role-based guard.
 * Must only be invoked AFTER requireAuth so that req.user is guaranteed and validated.
 */
export function createRequireEnterpriseRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({
        error: 'Authentication required before evaluating role authorization.',
        code: 'UNAUTHORIZED'
      });
    }

    const role = (user.role || '').toUpperCase().trim();
    if (role === 'SUPER_ADMIN') {
      return next();
    }

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        error: `غير مصرح بتنفيذ هذا الإجراء لصاحب رتبة '${role}'. الصلاحية مقتصرة على: ${allowedRoles.join(', ')}.`,
        code: 'PERMISSION_DENIED',
        requiredRoles: allowedRoles
      });
    }

    next();
  };
}

/**
 * Login rate limiter: 5 failed attempts per 15-minute sliding window per IP/account
 */
export const adminLoginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: 'تم تجاوز الحد المسموح به من محاولات تسجيل الدخول الفاشلة. يرجى الانتظار والمحاولة لاحقاً بعد 15 دقيقة.',
  keyGenerator: (req: Request) => {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      req.ip ||
      'unknown-ip';
    const email = (req.body?.email || '').trim().toLowerCase();
    return `auth-login:${ip}:${email}`;
  }
});

export type SystemAuthState = 'INITIAL_SETUP' | 'SYSTEM_READY' | 'ADMIN_RECOVERY_REQUIRED';

export interface SystemAuthStatus {
  state: SystemAuthState;
  setupRequired: boolean;
  recoveryRequired: boolean;
  hasUsers: boolean;
}

/**
 * Authoritative Server-Side Authentication State Machine
 * Evaluates whether the system is in:
 * - INITIAL_SETUP: Pure fresh install (users.length === 0). Setup allowed.
 * - SYSTEM_READY: System has users AND at least one active SUPER_ADMIN with a valid bcrypt hash.
 * - ADMIN_RECOVERY_REQUIRED: System has users but no active SUPER_ADMIN with valid bcrypt credentials.
 *   Setup is strictly blocked to prevent first-to-claim takeovers. Local recovery is required.
 */
export function getSystemAuthState(users: any[]): SystemAuthStatus {
  const list = users || [];
  if (list.length === 0) {
    return {
      state: 'INITIAL_SETUP',
      setupRequired: true,
      recoveryRequired: false,
      hasUsers: false
    };
  }

  const hasCredentialedAdmin = list.some(
    (u: any) =>
      (u.role === 'SUPER_ADMIN' || u.role === 'ADMIN') &&
      u.isActive !== false &&
      u.isDeleted !== true &&
      typeof u.passwordHash === 'string' &&
      u.passwordHash.startsWith('$2')
  );

  if (hasCredentialedAdmin) {
    return {
      state: 'SYSTEM_READY',
      setupRequired: false,
      recoveryRequired: false,
      hasUsers: true
    };
  }

  return {
    state: 'ADMIN_RECOVERY_REQUIRED',
    setupRequired: false,
    recoveryRequired: true,
    hasUsers: true
  };
}
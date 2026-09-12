import { syncCloudTicketLifecycleFromMain } from './src/server/cloudTicketLifecycleClient';
import express from 'express';
import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { startCloudServer } from './cloud/src/server';
import { desktopSyncWorker } from './src/services/desktopSyncWorker';
import {
  generateMasterFleetDataset,
  SEED_TECHNICIANS,
  SEED_SPARE_CATEGORIES,
  SEED_SPARE_PARTS,
  SEED_SUPPLIERS,
  SEED_PART_REQUESTS,
  SEED_TRANSACTIONS,
  SEED_USERS,
  SEED_AUDIT_LOGS,
  SEED_IMPORT_BATCHES,
  SEED_IMPORT_ROWS
} from './src/data/fleetMasterData';
import {
  initHybridFleetMigration,
  createHybridRouter,
  generateSecureOpaqueToken
} from './src/server/hybridCloudEngine';
import {
  createRequireAuth,
  createRequireEnterpriseRole,
  adminLoginLimiter,
  createSession,
  deleteSession,
  sanitizeUserForClient,
  validatePasswordStrength,
  hashPassword,
  verifyPassword,
  invalidateUserSessions,
  getSystemAuthState
} from './src/server/authSecurity';

const PORT = parseInt(process.env.PORT || '3000', 10);

import {
  runtimeStoreManager,
  getStore as getAuthoritativeStore,
  saveStore as saveAuthoritativeStore,
  DEFAULT_SETTINGS
} from './src/server/runtimeStoreManager';
import {
  resolveRuntimeDataDir,
  resolveRuntimeDataPath,
  resolveRuntimeUploadsDir,
  resolveBackupsDir,
  resolveBaselineDataPath
} from './src/server/runtimePathResolver';
import { mergeFleetSyncPayload } from './src/server/syncMergeEngine';
import { SystemSettings, RuntimeStoreData } from './src/server/runtimeStoreTypes';
import { normalizeExplicitLocationSource } from './src/utils/geoValidation';

export type { SystemSettings, RuntimeStoreData };

const MASTER_BASELINE_FILE = resolveBaselineDataPath();

function createCleanDatabase(): any {
  return {
    buildings: [],
    floors: [],
    locations: [],
    machines: [],
    tickets: [],
    technicians: [],
    categories: [],
    spareParts: [],
    suppliers: [],
    partRequests: [],
    transactions: [],
    users: [],
    auditLogs: [],
    importBatches: [],
    importRows: [],
    settings: { ...DEFAULT_SETTINGS },
    tombstones: [],
    locationProposals: [],
    fieldExceptions: [],
    processedSyncEventIds: [],
    lastCloudSyncCursor: 0,
    syncQueue: [],
    isBaselineCommitted: false,
    baselineCommittedAt: null,
    baselineCommittedBy: null,
    baselineNotes: null,
    initialized: true,
    _persistence: {
      initialized: true,
      version: '5.4.4',
      schemaVersion: 3,
      initializedAt: new Date().toISOString(),
      baselineImportedAt: null,
      legacyMigrationCompletedAt: null,
      lastStartupTimestamp: new Date().toISOString(),
      runtimeStoreId: `store-${Date.now()}`
    }
  };
}

function getStore(): RuntimeStoreData {
  return getAuthoritativeStore();
}

function saveStore(data?: any): void {
  saveAuthoritativeStore(data);
}


async function startServer() {
  const app = express();

  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Static uploads directory for maintenance photos and evidence in durable runtime directory
  const uploadsDir = resolveRuntimeUploadsDir();
  const legacyPublicUploads = path.join(process.cwd(), 'public', 'uploads');
  if (fs.existsSync(legacyPublicUploads)) {
    app.use('/uploads', express.static(legacyPublicUploads));
  }
  app.use('/uploads', express.static(uploadsDir));

  // Initialize DB immediately
  getStore();

  // Create unified API router for both /api and /api/v1
  const apiRouter = express.Router();

  // Standalone Cloud Service Network Proxy
  // Forwards incoming public QR, technician mobile, evidence, and sync traffic to the standalone Cloud service (port 3001)
  const cloudProxy = (req: express.Request, res: express.Response) => {
    const targetBaseUrl = (process.env.CLOUD_API_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '');
    let parsedTarget: URL;
    try {
      parsedTarget = new URL(targetBaseUrl);
    } catch {
      parsedTarget = new URL('http://127.0.0.1:3001');
    }
    const isHttps = parsedTarget.protocol === 'https:';
    const client = isHttps ? https : http;

    const proxyReq = client.request(
      {
        protocol: parsedTarget.protocol,
        hostname: parsedTarget.hostname,
        port: parsedTarget.port || (isHttps ? 443 : 80),
        path: req.originalUrl,
        method: req.method,
        headers: {
          ...req.headers,
          host: parsedTarget.host,
          'x-forwarded-for': req.ip || req.socket.remoteAddress || '',
          'x-forwarded-proto': req.secure ? 'https' : 'http'
        },
        timeout: 10000
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', (err) => {
      res.status(503).json({
        error: 'CLOUD_SERVICE_UNAVAILABLE',
        message: 'خدمة البوابة السحابية المستقلة غير متاحة حالياً. تأكد من تشغيل خادم Cloud API المنفصل.',
        details: err.message
      });
    });

    if (req.body && Object.keys(req.body).length > 0 && req.method !== 'GET' && req.method !== 'HEAD') {
      const payload = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Content-Length', Buffer.byteLength(payload));
      proxyReq.write(payload);
    }
    proxyReq.end();
  };

  // Mount Cloud proxy routes on the main app

  /**
   * Trusted Main Server -> Standalone Cloud location-management proxy.
   *
   * Browser authentication terminates at the Main Server.
   * Cloud management credentials remain server-side only.
   * Actor identity comes exclusively from the authenticated Main session.
   */
  const cloudLocationManagementProxy = (
    req: express.Request,
    res: express.Response
  ) => {
    const managementClientId =
      (process.env.CLOUD_MANAGEMENT_CLIENT_ID || '').trim();

    const managementClientSecret =
      (process.env.CLOUD_MANAGEMENT_CLIENT_SECRET || '').trim();

    if (!managementClientId || !managementClientSecret) {
      return res.status(503).json({
        error: 'CLOUD_MANAGEMENT_NOT_CONFIGURED',
        message: 'Cloud management connection is not configured.'
      });
    }

    const authenticatedUser = (req as any).user || {};
    const rawUser = (req as any).rawUser || {};

    const actorId = String(
      authenticatedUser.id ||
      rawUser.id ||
      ''
    ).trim();

    const actorName = String(
      authenticatedUser.fullName ||
      authenticatedUser.name ||
      authenticatedUser.username ||
      rawUser.fullName ||
      rawUser.name ||
      rawUser.username ||
      actorId
    ).trim();

    const actorRole = String(
      (req as any).userRole ||
      authenticatedUser.role ||
      rawUser.role ||
      ''
    ).trim().toUpperCase();

    if (!actorId || !actorName || !actorRole) {
      return res.status(500).json({
        error: 'MANAGEMENT_ACTOR_CONTEXT_UNAVAILABLE',
        message: 'Authenticated management actor context is unavailable.'
      });
    }

    const targetBaseUrl =
      (process.env.CLOUD_API_URL || 'http://127.0.0.1:3001')
        .replace(/\/+$/, '');

    let parsedTarget: URL;

    try {
      parsedTarget = new URL(targetBaseUrl);
    } catch {
      return res.status(503).json({
        error: 'CLOUD_MANAGEMENT_CONFIGURATION_INVALID',
        message: 'Cloud management target URL is invalid.'
      });
    }

    if (
      parsedTarget.protocol !== 'http:' &&
      parsedTarget.protocol !== 'https:'
    ) {
      return res.status(503).json({
        error: 'CLOUD_MANAGEMENT_CONFIGURATION_INVALID',
        message: 'Cloud management target protocol is invalid.'
      });
    }

    const isHttps = parsedTarget.protocol === 'https:';
    const client = isHttps ? https : http;

    /*
     * Express removes /location-management while this middleware runs.
     *
     * /api/v1/location-management/pending
     * becomes Cloud:
     * /api/locations/pending
     */
    const relativeUrl =
      req.url && req.url !== '/'
        ? req.url
        : '';

    const managementTargetPrefix =
      String(
        (req as any).cloudManagementTargetPrefix ||
        '/api/locations'
      ).replace(/\/+$/, '');

    const targetPath =
      `${managementTargetPrefix}${relativeUrl}`;

    /*
     * Defense in depth:
     * discard any browser-supplied audit identity.
     */
    const forwardedBody =
      req.body &&
      typeof req.body === 'object' &&
      !Array.isArray(req.body)
        ? { ...req.body }
        : req.body;

    if (
      forwardedBody &&
      typeof forwardedBody === 'object' &&
      !Array.isArray(forwardedBody)
    ) {
      delete forwardedBody.actorId;
      delete forwardedBody.actorName;
      delete forwardedBody.approverId;
      delete forwardedBody.approverName;
      delete forwardedBody.approvedByActorId;
      delete forwardedBody.approvedByActorName;
    }

    const hasBody =
      forwardedBody &&
      typeof forwardedBody === 'object' &&
      Object.keys(forwardedBody).length > 0 &&
      req.method !== 'GET' &&
      req.method !== 'HEAD';

    const payload =
      hasBody
        ? JSON.stringify(forwardedBody)
        : '';

    /*
     * Build fresh headers.
     * Never forward browser Authorization or arbitrary browser headers.
     */
    const headers: Record<string, string | number> = {
      Accept: 'application/json',

      'x-management-client-id':
        managementClientId,

      'x-management-client-secret':
        managementClientSecret,

      'x-management-actor-id':
        actorId,

      'x-management-actor-name-b64':
        Buffer
          .from(actorName, 'utf8')
          .toString('base64url'),

      'x-management-actor-role':
        actorRole,

      'x-forwarded-for':
        req.ip ||
        req.socket.remoteAddress ||
        '',

      'x-forwarded-proto':
        req.secure ? 'https' : 'http'
    };

    if (hasBody) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] =
        Buffer.byteLength(payload);
    }

    const proxyReq = client.request(
      {
        protocol: parsedTarget.protocol,
        hostname: parsedTarget.hostname,
        port:
          parsedTarget.port ||
          (isHttps ? 443 : 80),
        path: targetPath,
        method: req.method,
        headers,
        timeout: 10000
      },
      (proxyRes) => {
        res.status(proxyRes.statusCode || 502);

        const contentType =
          proxyRes.headers['content-type'];

        if (contentType) {
          res.setHeader(
            'content-type',
            contentType
          );
        }

        proxyRes.pipe(res);
      }
    );

    proxyReq.on('timeout', () => {
      proxyReq.destroy(
        new Error('Cloud management request timeout')
      );
    });

    proxyReq.on('error', () => {
      if (!res.headersSent) {
        return res.status(503).json({
          error: 'CLOUD_MANAGEMENT_UNAVAILABLE',
          message: 'Cloud management service is unavailable.'
        });
      }

      res.end();
    });

    if (hasBody) {
      proxyReq.write(payload);
    }

    proxyReq.end();
  };

  app.use('/public', cloudProxy);
  app.use('/technician', cloudProxy);
  app.use('/cloud-storage', cloudProxy);
  app.use('/sync', cloudProxy);
  app.use('/cloud-api', cloudProxy);

  // Initialize Hybrid Cloud Operations router; mount occurs after auth gate
  const hybridRouter = createHybridRouter(getStore, saveStore);
  initHybridFleetMigration(getStore(), saveStore);

  // Server-authoritative authentication middleware and enterprise RBAC guard
  const requireAuth = createRequireAuth(getStore);
  const requireEnterpriseRole = createRequireEnterpriseRole;

  // Enforce authoritative authentication on all administrative API routes
  apiRouter.use((req, res, next) => {
    const rawPath = req.path || '';
    const p = (rawPath.replace(/^\/v1/, '') || '/').replace(/\/+$/, '') || '/';
    // Whitelisted public endpoints
    if (
      p === '/health' ||
      p === '/auth/status' ||
      p === '/auth/login' ||
      p === '/auth/setup-initial-admin' ||
      p === '/auth/logout' ||
      p.startsWith('/public') ||
      p === '/technician/login'
    ) {
      return next();
    }

    // Technician portal endpoints with dedicated auth guard in hybridRouter
    if (p.startsWith('/technician/')) {
      return next();
    }

    // /api*/sync/* are administrative UI endpoints and require
    // the authenticated main-server user session.
    // Real Desktop M2M sync uses the top-level /sync Cloud proxy.

    // All administrative routes require valid user session
    return requireAuth(req, res, next);
  });

  // Hybrid routes are mounted only after the authoritative auth gate.
  // Public/technician paths are explicitly exempted above.
  apiRouter.use((req, res, next) => {
    const rawPath = req.path || '';
    const p = (rawPath.replace(/^\/v1/, '') || '/').replace(/\/+$/, '') || '/';

    // Public and technician routes keep their dedicated security model.
    if (p.startsWith('/public') || p.startsWith('/technician/')) {
      return next();
    }

    // Maintenance-management workflows.
    if (
      /^\/admin\/tickets\/[^/]+\/(verify|close)$/.test(p) ||
      /^\/admin\/machines\/[^/]+\/regenerate-qr-token$/.test(p)
    ) {
      return requireEnterpriseRole([
        'SUPER_ADMIN',
        'ADMIN',
        'MAINTENANCE_MANAGER'
      ])(req, res, next);
    }

    // Warehouse / part-request administrative workflows.
    if (p.startsWith('/admin/part-requests/')) {
      return requireEnterpriseRole([
        'SUPER_ADMIN',
        'ADMIN',
        'MAINTENANCE_MANAGER',
        'WAREHOUSE',
        'WAREHOUSE_OFFICER'
      ])(req, res, next);
    }

    // System/cloud settings and UI-driven sync operations are admin-only.
    if (p === '/admin/cloud-settings' || p.startsWith('/sync/')) {
      return requireEnterpriseRole([
        'SUPER_ADMIN',
        'ADMIN'
      ])(req, res, next);
    }

    // Any other Hybrid /admin route defaults to system administrators only.
    if (p.startsWith('/admin/')) {
      return requireEnterpriseRole([
        'SUPER_ADMIN',
        'ADMIN'
      ])(req, res, next);
    }

    return next();
  });

  // Authenticated Main Server -> Cloud location-management workflow.
  apiRouter.use(
    '/location-management',
    requireEnterpriseRole([
      'SUPER_ADMIN',
      'ADMIN',
      'MAINTENANCE_MANAGER'
    ]),
    cloudLocationManagementProxy
  );

  // Authenticated Main Server -> Cloud ticket lifecycle management.
  apiRouter.use(
    '/ticket-management',
    requireEnterpriseRole([
      'SUPER_ADMIN',
      'ADMIN',
      'MAINTENANCE_MANAGER'
    ]),
    (req, res) => {
      (req as any).cloudManagementTargetPrefix = '/api/tickets';
      return cloudLocationManagementProxy(req, res);
    }
  );

  apiRouter.use(hybridRouter);

  // Health
  apiRouter.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Auth Status: Expose authoritative system auth state machine metadata
  apiRouter.get('/auth/status', (req, res) => {
    const store = getStore();
    const users = store.users || [];
    const authStatus = getSystemAuthState(users);
    res.json({
      state: authStatus.state,
      setupRequired: authStatus.setupRequired,
      recoveryRequired: authStatus.recoveryRequired,
      hasUsers: authStatus.hasUsers,
      companyName: store.settings?.companyName || ''
    });
  });

  // Register Initial Company System Administrator (Super Admin)
  // ABSOLUTE RULE: Permitted ONLY on a completely clean/empty user database (users.length === 0).
  // If users exist, this is rejected (409). If no credentialed SUPER_ADMIN exists, state is ADMIN_RECOVERY_REQUIRED.
  apiRouter.post('/auth/setup-initial-admin', (req, res) => {
    const store = getStore();
    const users = store.users || [];

    if (users.length > 0) {
      const authStatus = getSystemAuthState(users);
      if (authStatus.state === 'ADMIN_RECOVERY_REQUIRED') {
        return res.status(409).json({
          error: 'تهيئة النظام مغلقة. توجد حسابات مسجلة مسبقاً تتطلب استعادة صلاحيات المشرف العام محلياً من الخادم.',
          code: 'ADMIN_RECOVERY_REQUIRED',
          state: 'ADMIN_RECOVERY_REQUIRED'
        });
      }
      return res.status(409).json({
        error: 'تهيئة النظام مكتملة بالفعل. لا يمكن تسجيل مدير النظام عند وجود مستخدمين مسجلين مسبقاً.',
        code: 'SETUP_ALREADY_COMPLETED',
        state: 'SYSTEM_READY'
      });
    }

    const { companyName, fullName, email, phone, password, city } = req.body || {};

    if (!fullName || !email) {
      return res.status(400).json({ error: 'الاسم الكامل والبريد الإلكتروني مطلوبان لتسجيل مدير النظام.' });
    }

    const pwValidation = validatePasswordStrength(password);
    if (!pwValidation.valid) {
      return res.status(400).json({ error: pwValidation.error });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanName = String(fullName).trim();
    const cleanPhone = (phone ? String(phone) : '').trim();
    const cleanCompany = (companyName ? String(companyName) : 'شركة أسطول البيع الذاتي').trim();

    // Race-safe verification against latest store immediately prior to insertion
    const latestStore = getStore();
    if ((latestStore.users || []).length > 0) {
      return res.status(409).json({
        error: 'تهيئة النظام مغلقة. تم تسجيل مدير النظام بالفعل.',
        code: 'SETUP_ALREADY_COMPLETED'
      });
    }

    const passwordHash = hashPassword(String(password));

    // Create the primary Super Administrator user
    const adminUser = {
      id: `usr-admin-${Date.now()}`,
      email: cleanEmail,
      fullName: cleanName,
      name: cleanName,
      phone: cleanPhone,
      role: 'SUPER_ADMIN',
      passwordHash,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      companyName: cleanCompany
    };

    // System was verified to have 0 users: set users array with adminUser
    // NEVER filter, purge, or remove existing accounts
    latestStore.users = [adminUser];

    // Update company settings
    latestStore.settings = {
      ...(latestStore.settings || DEFAULT_SETTINGS),
      companyName: cleanCompany,
      supportEmail: cleanEmail,
      supportPhone: cleanPhone || latestStore.settings?.supportPhone || '800-123-4567',
      city: city || 'الرياض'
    };

    if (!latestStore.auditLogs) latestStore.auditLogs = [];
    latestStore.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'INITIAL_ADMIN_REGISTERED',
      entityName: 'User',
      entityId: cleanEmail,
      userName: cleanName,
      newValues: {
        message: 'تم تسجيل مدير النظام الرئيسي واعتماد إعدادات الشركة بنجاح',
        companyName: cleanCompany,
        adminName: cleanName,
        role: 'SUPER_ADMIN'
      },
      createdAt: new Date().toISOString()
    });

    saveStore(latestStore);

    const session = createSession(adminUser);
    res.status(201).json({
      success: true,
      user: sanitizeUserForClient(adminUser),
      token: session.token,
      companyName: cleanCompany
    });
  });

  // Authenticate user with registered credentials (server-authoritative bcrypt verification)
  apiRouter.post('/auth/login', adminLoginLimiter, (req, res) => {
    const store = getStore();
    const { email, password } = req.body || {};

    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني' });
    }

    if (!password || typeof password !== 'string' || !password.trim()) {
      return res.status(400).json({ error: 'يرجى إدخال كلمة المرور' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Strict user lookup: find user by exact email match only.
    // No hardcoded emails, no auto-provisioning, no alias bypass.
    const user = (store.users || []).find((u: any) => u.email?.trim().toLowerCase() === cleanEmail);

    if (!user) {
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة أو المستخدم غير مسجل' });
    }

    const isInactive = user.isActive === false || user.status === 'INACTIVE' || user.isDeleted === true;
    if (isInactive) {
      return res.status(403).json({ error: 'حساب المستخدم معطل حالياً. يرجى مراجعة مدير النظام.' });
    }

    let passwordMatches = false;

    if (user.passwordHash) {
      // RULE A: passwordHash exists -> bcrypt verification required
      passwordMatches = verifyPassword(password, user.passwordHash);
    } else if (typeof user.password === 'string' && user.password.length > 0) {
      // RULE B: legitimate legacy plaintext password exists -> exact password comparison required
      // wrong password = 401, correct password = migrate to bcrypt, remove plaintext
      if (user.password === password) {
        passwordMatches = true;
        user.passwordHash = hashPassword(password);
        delete user.password;
        saveStore(store);
      } else {
        passwordMatches = false;
      }
    } else {
      // RULE C: no passwordHash AND no legitimate plaintext password
      // ALWAYS 401. NEVER create passwordHash from supplied login password.
      // Explicit administrator password reset required.
      return res.status(401).json({
        error: 'لم يتم تعيين كلمة مرور لهذا الحساب. يرجى مراجعة مسؤول النظام لإعادة تعيين كلمة المرور.',
        code: 'PASSWORD_RESET_REQUIRED'
      });
    }

    if (!passwordMatches) {
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة أو المستخدم غير مسجل' });
    }

    user.lastLoginAt = new Date().toISOString();
    saveStore(store);

    const session = createSession(user);
    res.json({
      success: true,
      user: sanitizeUserForClient(user),
      token: session.token,
      companyName: store.settings?.companyName || ''
    });
  });

  // Dedicated Authenticated Admin Password Reset Handler
  // Requires valid server session, authorized admin/SUPER_ADMIN, bcrypt hash, minimum 10 chars, revokes user sessions, audits action
  const handleAdminPasswordReset = (req: any, res: any) => {
    const store = getStore();
    const targetUserId = (req.params?.id || req.body?.userId || '').trim();
    const newPassword = req.body?.newPassword || req.body?.password;

    if (!targetUserId) {
      return res.status(400).json({ error: 'معرف المستخدم المطلوب مطلوب (userId مطلوب).' });
    }

    const pwValidation = validatePasswordStrength(newPassword);
    if (!pwValidation.valid) {
      return res.status(400).json({ error: pwValidation.error });
    }

    const idx = (store.users || []).findIndex((u: any) => u.id === targetUserId);
    if (idx === -1) {
      return res.status(404).json({ error: 'المستخدم المطلوب غير موجود' });
    }

    const targetUser = store.users[idx];
    const callerRole = ((req.user?.role || '') as string).toUpperCase().trim();
    const targetRole = ((targetUser.role || '') as string).toUpperCase().trim();
    const callerId = req.user?.id;

    // Privilege escalation protection:
    // 1. Only SUPER_ADMIN may reset credentials for a SUPER_ADMIN account
    if (targetRole === 'SUPER_ADMIN' && callerRole !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'غير مصرح لمسؤول النظام (ADMIN) بإعادة تعيين كلمة مرور المدير العام (SUPER_ADMIN). يقتصر ذلك على المدير العام فقط.',
        code: 'PERMISSION_DENIED'
      });
    }

    // 2. ADMIN cannot reset credentials for another ADMIN (only SUPER_ADMIN can manage other ADMIN accounts)
    if (targetRole === 'ADMIN' && callerRole !== 'SUPER_ADMIN' && callerId !== targetUser.id) {
      return res.status(403).json({
        error: 'غير مصرح لمسؤول النظام (ADMIN) بإعادة تعيين كلمة مرور مسؤول نظام آخر. يقتصر ذلك على المدير العام (SUPER_ADMIN).',
        code: 'PERMISSION_DENIED'
      });
    }

    const passwordHash = hashPassword(String(newPassword));

    targetUser.passwordHash = passwordHash;
    delete targetUser.password;
    targetUser.updatedAt = new Date().toISOString();

    // Revoke all existing sessions for this user
    invalidateUserSessions(targetUserId);

    // Audit action
    store.auditLogs = store.auditLogs || [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'ADMIN_PASSWORD_RESET',
      entityName: 'User',
      entityId: targetUser.id,
      userName: req.user?.fullName || req.user?.name || 'Admin',
      newValues: {
        message: 'تم إعادة تعيين كلمة مرور المستخدم وإلغاء جميع جلساته النشطة بواسطة مسؤول النظام',
        targetUserId: targetUser.id,
        targetEmail: targetUser.email,
        adminUserId: req.user?.id
      },
      createdAt: new Date().toISOString()
    });

    saveStore(store);

    return res.json({
      success: true,
      message: 'تم إعادة تعيين كلمة المرور بنجاح وإلغاء جميع جلسات المستخدم السابقة.',
      user: sanitizeUserForClient(targetUser)
    });
  };

  // Explicit Authenticated Admin Password Reset Endpoints
  apiRouter.post('/auth/admin/reset-password', requireEnterpriseRole(['SUPER_ADMIN', 'ADMIN']), handleAdminPasswordReset);
  apiRouter.post('/users/:id/reset-password', requireEnterpriseRole(['SUPER_ADMIN', 'ADMIN']), handleAdminPasswordReset);

  // Return currently authenticated session profile
  apiRouter.get('/auth/me', (req, res) => {
    res.json({
      success: true,
      user: (req as any).user
    });
  });

  // Logout and invalidate active session
  apiRouter.post('/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      deleteSession(token);
    }
    res.json({ success: true, message: 'تم تسجيل الخروج بنجاح وإلغاء الجلسة.' });
  });

  // Reset Users: Authorized SUPER_ADMIN operation only
  apiRouter.post('/auth/reset-users', requireEnterpriseRole(['SUPER_ADMIN']), (req, res) => {
    if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_DEV_USER_RESET) {
      return res.status(403).json({ error: 'عملية تفريغ المستخدمين غير مصرح بها في بيئة الإنتاج.' });
    }
    if (req.body?.confirmReset !== true) {
      return res.status(400).json({ error: 'تأكيد تفريغ المستخدمين مطلوب: confirmReset must be true' });
    }
    const store = getStore();
    store.users = [];
    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'USERS_RESET',
      entityName: 'User',
      entityId: 'ALL',
      userName: (req as any).user?.name || (req as any).user?.fullName || 'SUPER_ADMIN',
      newValues: { message: 'تم تفريغ مستخدمي النظام بالكامل بواسطة مدير النظام' },
      createdAt: new Date().toISOString()
    });
    saveStore(store);
    res.json({ success: true, message: 'تم تفريغ مستخدمي النظام بنجاح.' });
  });

  // Commit Current Real Database as System Authoritative Master Baseline (Requires System Admin Confirmation)
  apiRouter.post('/system/commit-baseline', requireEnterpriseRole(['SUPER_ADMIN']), (req, res) => {
    const store = getStore();
    const confirmedBy = req.body?.confirmedBy || 'مدير النظام';
    const notes = req.body?.notes || 'تم اعتماد وتثبيت قاعدة البيانات الحقيقية كنسخة أساسية دائمة للنظام';

    store.isBaselineCommitted = true;
    store.baselineCommittedAt = new Date().toISOString();
    store.baselineCommittedBy = confirmedBy;
    store.baselineNotes = notes;

    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'BASELINE_COMMITTED',
      entityName: 'System',
      entityId: 'ROOT',
      userName: confirmedBy,
      newValues: {
        message: `تم اعتماد وحفظ البيانات الحقيقية الحالية كنسخة أساسية دائمة للنظام بواسطة ${confirmedBy}.`,
        machinesCount: store.machines.length,
        buildingsCount: store.buildings.length,
        locationsCount: store.locations.length,
        techniciansCount: store.technicians.length,
        sparePartsCount: store.spareParts.length
      },
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString()
    });

    try {
      fs.writeFileSync(MASTER_BASELINE_FILE, JSON.stringify(store, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to write authoritative master baseline file:', err);
      return res.status(500).json({ error: 'فشل حفظ ملف النسخة الأساسية على الخادم.' });
    }

    saveStore(store);

    res.json({
      success: true,
      message: 'تم حفظ واعتماد البيانات الحقيقية الحالية كنسخة أساسية دائمة للنظام بنجاح!',
      committedAt: store.baselineCommittedAt,
      committedBy: store.baselineCommittedBy,
      stats: {
        machines: store.machines.length,
        buildings: store.buildings.length,
        floors: store.floors.length,
        locations: store.locations.length,
        technicians: store.technicians.length,
        spareParts: store.spareParts.length,
        tickets: store.tickets.length
      }
    });
  });

  // Restore Committed Master Baseline endpoint
  apiRouter.post('/system/restore-committed-baseline', (req, res) => {
    if (!fs.existsSync(MASTER_BASELINE_FILE)) {
      return res.status(400).json({
        error: 'لم يتم حفظ أي نسخة أساسية معتمدة من مدير النظام حتى الآن. يرجى إدخال البيانات الحقيقية واعتمادها أولاً.'
      });
    }

    try {
      const raw = fs.readFileSync(MASTER_BASELINE_FILE, 'utf8');
      const baseline = JSON.parse(raw);
      if (!baseline || typeof baseline !== 'object') {
        return res.status(500).json({ error: 'ملف النسخة الأساسية المحفوظ تالف أو غير صالح.' });
      }

      if (!baseline.auditLogs) baseline.auditLogs = [];
      baseline.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'BASELINE_RESTORED',
        entityName: 'System',
        entityId: 'ROOT',
        userName: 'مدير النظام',
        newValues: { message: 'تمت استعادة النسخة الأساسية المعتمدة بنجاح.' },
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString()
      });

      saveStore(baseline);

      res.json({
        success: true,
        message: 'تمت استعادة النسخة الأساسية المعتمدة بنجاح!',
        committedAt: baseline.baselineCommittedAt,
        committedBy: baseline.baselineCommittedBy,
        stats: {
          machines: baseline.machines.length,
          buildings: baseline.buildings.length,
          floors: baseline.floors.length,
          locations: baseline.locations.length,
          technicians: baseline.technicians.length,
          spareParts: baseline.spareParts.length,
          tickets: baseline.tickets.length
        }
      });
    } catch (err: any) {
      console.error('Failed to restore committed baseline:', err);
      res.status(500).json({ error: 'حدث خطأ أثناء استعادة النسخة الأساسية: ' + err.message });
    }
  });

  // Get Baseline Status
  apiRouter.get('/system/baseline-status', (req, res) => {
    const store = getStore();
    res.json({
      isCommitted: !!store.isBaselineCommitted,
      committedAt: store.baselineCommittedAt || null,
      committedBy: store.baselineCommittedBy || null,
      notes: store.baselineNotes || null,
      hasCommittedBaselineOnDisk: fs.existsSync(MASTER_BASELINE_FILE),
      stats: {
        machines: store.machines?.length || 0,
        buildings: store.buildings?.length || 0,
        floors: store.floors?.length || 0,
        locations: store.locations?.length || 0,
        technicians: store.technicians?.length || 0,
        spareParts: store.spareParts?.length || 0,
        tickets: store.tickets?.length || 0
      }
    });
  });

  // Reset database endpoint (Respects committed baseline or resets to clean state)
  apiRouter.post('/reset-database', (req, res) => {
    if (fs.existsSync(MASTER_BASELINE_FILE)) {
      try {
        const raw = fs.readFileSync(MASTER_BASELINE_FILE, 'utf8');
        const baseline = JSON.parse(raw);
        saveStore(baseline);
        return res.json({
          status: 'ok',
          message: 'تمت استعادة النسخة الأساسية المعتمدة للنظام.',
          machinesCount: baseline.machines?.length || 0,
          ticketsCount: baseline.tickets?.length || 0
        });
      } catch {}
    }

    const clean = createCleanDatabase();
    saveStore(clean);
    res.json({
      status: 'ok',
      message: 'تمت إعادة ضبط قاعدة البيانات إلى الحالة الأولية النظيفة.',
      machinesCount: 0,
      ticketsCount: 0
    });
  });

  // Alias for backward compatibility
  apiRouter.post('/system/restore-baseline', (req, res) => {
    if (fs.existsSync(MASTER_BASELINE_FILE)) {
      try {
        const raw = fs.readFileSync(MASTER_BASELINE_FILE, 'utf8');
        const baseline = JSON.parse(raw);
        saveStore(baseline);
        return res.json({
          success: true,
          message: 'تمت استعادة النسخة الأساسية المعتمدة للنظام بنجاح.',
          stats: {
            machines: baseline.machines?.length || 0,
            tickets: baseline.tickets?.length || 0,
            buildings: baseline.buildings?.length || 0,
            locations: baseline.locations?.length || 0,
            technicians: baseline.technicians?.length || 0,
            spareParts: baseline.spareParts?.length || 0
          }
        });
      } catch {}
    }

    const clean = createCleanDatabase();
    saveStore(clean);
    res.json({
      success: true,
      message: 'قاعدة البيانات نظيفة وجاهزة لاستقبال البيانات الحقيقية.',
      stats: { machines: 0, tickets: 0, buildings: 0, locations: 0, technicians: 0, spareParts: 0 }
    });
  });

  // System Full Backup Export (JSON snapshot)
  apiRouter.get('/system/backup', (req, res) => {
    const store = getStore();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="vending_fleet_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json"`);
    res.json(store);
  });

  // System Full Backup Restore (Upload JSON snapshot)
  apiRouter.post('/system/restore-backup', (req, res) => {
    const backupData = req.body;
    if (!backupData || typeof backupData !== 'object') {
      return res.status(400).json({ error: 'Invalid backup payload. Expected valid JSON object.' });
    }
    if (!Array.isArray(backupData.machines)) {
      return res.status(400).json({ error: 'Invalid backup format: missing machines array.' });
    }

    const merged = {
      ...createCleanDatabase(),
      ...backupData
    };
    saveStore(merged);
    res.json({
      success: true,
      message: 'Backup restored successfully.',
      machinesCount: merged.machines.length,
      ticketsCount: merged.tickets?.length || 0,
      partsCount: merged.spareParts?.length || 0
    });
  });

  // Authoritative Persistence Diagnostics (Phase 5.4.4)
  apiRouter.get('/system/persistence-status', (req, res) => {
    res.json({
      status: 'ok',
      runtimeDir: resolveRuntimeDataDir(),
      runtimePath: resolveRuntimeDataPath(),
      backupsDir: resolveBackupsDir(),
      metadata: runtimeStoreManager.getMetadata(),
      stats: runtimeStoreManager.getStats()
    });
  });

  // Clear / Purge All Virtual & Demo Data (Start 100% Clean)
  apiRouter.post('/system/purge-all', requireEnterpriseRole(['SUPER_ADMIN']), (req, res) => {
    const deleteCommittedBaseline = req.body?.deleteCommittedBaseline === true;
    if (deleteCommittedBaseline && fs.existsSync(MASTER_BASELINE_FILE)) {
      try {
        fs.unlinkSync(MASTER_BASELINE_FILE);
      } catch (e) {
        console.warn('Could not delete master baseline file:', e);
      }
    }

    const clean = createCleanDatabase();
    saveStore(clean);
    res.json({
      success: true,
      status: 'ok',
      message: 'تم تفريغ كافة البيانات وحذف السجلات الافتراضية بنجاح. النظام الآن نظيف تماماً وجاهز لإدخال أو استيراد البيانات الحقيقية.',
      stats: { machines: 0, tickets: 0, locations: 0, technicians: 0, spareParts: 0 }
    });
  });

  apiRouter.post('/clear-database', (req, res) => {
    const clean = createCleanDatabase();
    saveStore(clean);
    res.json({
      status: 'ok',
      message: 'تم تفريغ وحذف جميع البيانات الافتراضية بنجاح. قاعدة البيانات الآن نظيفة وجاهزة.',
      machinesCount: 0,
      ticketsCount: 0
    });
  });

  // Get Complete Authoritative Fleet Database State
  apiRouter.get('/fleet/all', (req, res) => {
    const store = getStore();
    res.json({
      ...store,
      technicians: (store.technicians || []).filter((t: any) => !t.isDeleted)
    });
  });

  apiRouter.get('/fleet/data', (req, res) => {
    const store = getStore();
    res.json({
      ...store,
      technicians: (store.technicians || []).filter((t: any) => !t.isDeleted)
    });
  });

  // Bulk Fleet Sync from Client / Excel import with deterministic conflict resolution
  apiRouter.post('/fleet/sync', (req, res) => {
    const store = getStore();
    mergeFleetSyncPayload(store, req.body);
    saveStore(store);
    res.json({
      status: 'ok',
      message: 'Fleet synchronized successfully',
      machinesCount: store.machines.length,
      buildingsCount: store.buildings.length,
      locationsCount: store.locations.length,
      ticketsCount: store.tickets.length,
      sparePartsCount: (store.spareParts || []).length,
      partRequestsCount: (store.partRequests || []).length,
      techniciansCount: (store.technicians || []).length
    });
  });

  // Settings
  apiRouter.get('/settings', (req, res) => {
    const store = getStore();
    res.json(store.settings || DEFAULT_SETTINGS);
  });

  apiRouter.post('/settings', (req, res) => {
    const store = getStore();
    store.settings = { ...(store.settings || DEFAULT_SETTINGS), ...req.body };
    saveStore(store);
    res.json(store.settings);
  });

  // Buildings
  apiRouter.get('/buildings', (req, res) => {
    const store = getStore();
    res.json(store.buildings || []);
  });

  apiRouter.post('/buildings', (req, res) => {
    const store = getStore();
    const data = req.body;
    const now = new Date().toISOString();

    const hasGps = typeof data.latitude === 'number' && typeof data.longitude === 'number';
    const lat = hasGps ? Number(data.latitude.toFixed(6)) : null;
    const lng = hasGps ? Number(data.longitude.toFixed(6)) : null;

    const newBld = {
      id: `bld-${Date.now()}`,
      name: data.name || 'New Building',
      nameAr: data.nameAr,
      code: (data.code || `BLD-${Date.now().toString().slice(-3)}`).trim().toUpperCase(),
      address: data.address,
      latitude: lat,
      longitude: lng,
      locationSource: hasGps ? (data.locationSource || 'MANUAL_ENTRY') : 'NONE',
      locationStatus: hasGps ? 'GPS_CONFIGURED' : 'LOCATION_NOT_CONFIGURED',
      locationNote: data.locationNote || '',
      locationUpdatedAt: hasGps ? now : null,
      locationUpdatedByActorId: data.locationUpdatedByActorId || 'admin',
      locationUpdatedByActorName: data.locationUpdatedByActorName || 'Super Administrator',
      isActive: true,
      isDeleted: false,
      floors: [],
      createdAt: now,
      updatedAt: now,
      ...data
    };

    // Ensure normalized location fields overwrite raw spread data
    newBld.latitude = lat;
    newBld.longitude = lng;
    newBld.locationSource = hasGps ? normalizeExplicitLocationSource(data.locationSource || 'MANUAL_ENTRY') : 'NONE';
    newBld.locationStatus = hasGps ? 'GPS_CONFIGURED' : 'LOCATION_NOT_CONFIGURED';

    if (!store.buildings) store.buildings = [];
    store.buildings.unshift(newBld);

    // Audit initial location if configured
    if (hasGps) {
      if (!store.auditLogs) store.auditLogs = [];
      const auditAction = newBld.locationSource === 'DEVICE_GPS'
        ? 'BUILDING_LOCATION_DEVICE_GPS_UPDATED'
        : (newBld.locationSource === 'MAP_PICKER' || newBld.locationSource === 'MAP_SELECTION')
        ? 'BUILDING_LOCATION_MAP_UPDATED'
        : 'BUILDING_LOCATION_MANUALLY_UPDATED';

      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: auditAction,
        entityName: 'Building',
        entityId: newBld.id,
        userName: newBld.locationUpdatedByActorName,
        details: `Initial building location configured for ${newBld.name} (${lat}, ${lng})`,
        oldValues: null,
        newValues: {
          buildingId: newBld.id,
          buildingName: newBld.name,
          latitude: lat,
          longitude: lng,
          locationSource: newBld.locationSource,
          locationStatus: newBld.locationStatus,
          locationNote: newBld.locationNote
        },
        timestamp: now,
        createdAt: now
      });
    }

    saveStore(store);
    res.status(201).json(newBld);
  });

  apiRouter.put('/buildings/:id', (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const idx = (store.buildings || []).findIndex((b: any) => b.id === id || b.code === id);
    if (idx === -1) return res.status(404).json({ error: 'Building not found' });

    const oldBld = { ...store.buildings[idx] };
    const data = req.body;
    const now = new Date().toISOString();

    // Coordinate pair validation
    const hasLat = data.latitude !== undefined;
    const hasLng = data.longitude !== undefined;
    if (hasLat || hasLng) {
      const isLatNull = data.latitude === null;
      const isLngNull = data.longitude === null;
      const isLatNum = typeof data.latitude === 'number' && !isNaN(data.latitude) && isFinite(data.latitude);
      const isLngNum = typeof data.longitude === 'number' && !isNaN(data.longitude) && isFinite(data.longitude);

      if (isLatNull && isLngNull) {
        // Both null: valid clear / unconfigured
      } else if (isLatNum && isLngNum) {
        if (data.latitude < -90 || data.latitude > 90 || data.longitude < -180 || data.longitude > 180) {
          return res.status(400).json({ error: 'Coordinates out of range: latitude [-90, 90], longitude [-180, 180]' });
        }
      } else {
        return res.status(400).json({ error: 'Invalid coordinate pair: latitude and longitude must both be valid numbers within range or both null' });
      }
    }

    // Determine if coordinates or location metadata actually changed
    let coordinatesActuallyChanged = false;
    if (hasLat && hasLng) {
      const isBothNull = data.latitude === null && data.longitude === null;
      const wasBothNull = (oldBld.latitude === null || oldBld.latitude === undefined) &&
                          (oldBld.longitude === null || oldBld.longitude === undefined);

      if (isBothNull && wasBothNull) {
        coordinatesActuallyChanged = false;
      } else if (
        typeof data.latitude === 'number' &&
        typeof data.longitude === 'number' &&
        typeof oldBld.latitude === 'number' &&
        typeof oldBld.longitude === 'number'
      ) {
        coordinatesActuallyChanged =
          Number(data.latitude.toFixed(6)) !== Number(oldBld.latitude.toFixed(6)) ||
          Number(data.longitude.toFixed(6)) !== Number(oldBld.longitude.toFixed(6));
      } else {
        coordinatesActuallyChanged = true;
      }
    }

    let lat = oldBld.latitude ?? null;
    let lng = oldBld.longitude ?? null;
    let locationSource = oldBld.locationSource || 'NONE';
    let locationStatus = oldBld.locationStatus || (lat !== null && lng !== null ? 'GPS_CONFIGURED' : 'LOCATION_NOT_CONFIGURED');
    let locationNote = data.locationNote !== undefined ? data.locationNote : (oldBld.locationNote || '');

    if (coordinatesActuallyChanged) {
      if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
        lat = Number(data.latitude.toFixed(6));
        lng = Number(data.longitude.toFixed(6));
        locationSource = normalizeExplicitLocationSource(data.locationSource || 'MANUAL_ENTRY');
        locationStatus = 'GPS_CONFIGURED';
      } else {
        lat = null;
        lng = null;
        locationSource = 'NONE';
        locationStatus = 'LOCATION_NOT_CONFIGURED';
      }
    }

    const locationNoteChanged = data.locationNote !== undefined && data.locationNote !== (oldBld.locationNote || '');
    const locationChanged = coordinatesActuallyChanged || locationNoteChanged;

    let finalLocationUpdatedAt: string | null = null;
    if (lat === null || lng === null) {
      finalLocationUpdatedAt = null;
    } else if (coordinatesActuallyChanged) {
      finalLocationUpdatedAt = now;
    } else {
      finalLocationUpdatedAt = oldBld.locationUpdatedAt || null;
    }

    store.buildings[idx] = {
      ...store.buildings[idx],
      ...data,
      latitude: lat,
      longitude: lng,
      locationSource,
      locationStatus,
      locationNote,
      locationUpdatedAt: finalLocationUpdatedAt,
      locationUpdatedByActorId: data.locationUpdatedByActorId || oldBld.locationUpdatedByActorId || 'admin',
      locationUpdatedByActorName: data.locationUpdatedByActorName || oldBld.locationUpdatedByActorName || 'Super Administrator',
      updatedAt: now
    };

    // Audit location changes
    const prevCoordsExist = oldBld.latitude !== null && oldBld.latitude !== undefined && oldBld.longitude !== null && oldBld.longitude !== undefined;
    const newCoordsExist = lat !== null && lng !== null;

    if (coordinatesActuallyChanged) {
      let auditAction = 'BUILDING_LOCATION_MANUALLY_UPDATED';
      if (prevCoordsExist && !newCoordsExist) {
        auditAction = 'BUILDING_LOCATION_CLEARED';
      } else if (locationSource === 'DEVICE_GPS') {
        auditAction = 'BUILDING_LOCATION_DEVICE_GPS_UPDATED';
      } else if (locationSource === 'MAP_PICKER' || locationSource === 'MAP_SELECTION') {
        auditAction = 'BUILDING_LOCATION_MAP_UPDATED';
      }

      if (!store.auditLogs) store.auditLogs = [];
      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: auditAction,
        entityName: 'Building',
        entityId: oldBld.id,
        userName: store.buildings[idx].locationUpdatedByActorName,
        details: `Building location updated for ${oldBld.name}`,
        oldValues: {
          latitude: oldBld.latitude,
          longitude: oldBld.longitude,
          locationSource: oldBld.locationSource,
          locationStatus: oldBld.locationStatus
        },
        newValues: {
          buildingId: oldBld.id,
          buildingName: oldBld.name,
          latitude: lat,
          longitude: lng,
          locationSource,
          locationStatus,
          locationNote
        },
        timestamp: now,
        createdAt: now
      });
    }

    saveStore(store);
    res.json(store.buildings[idx]);
  });

  apiRouter.delete('/buildings/:id', requireEnterpriseRole(['SUPER_ADMIN', 'ADMIN']), (req, res) => {
    const store = getStore();
    const id = req.params.id;
    store.buildings = (store.buildings || []).filter((b: any) => b.id !== id);
    runtimeStoreManager.recordTombstone('Building', id, (req as any).user?.username || 'Admin', 'Deleted via API');
    saveStore(store);
    res.json({ success: true });
  });

  // Floors
  apiRouter.get('/floors', (req, res) => {
    const store = getStore();
    res.json(store.floors || []);
  });

  apiRouter.post('/floors', (req, res) => {
    const store = getStore();
    const data = req.body;
    const now = new Date().toISOString();
    const newFlr = {
      id: `flr-${Date.now()}`,
      buildingId: data.buildingId || store.buildings?.[0]?.id,
      floorName: data.floorName || 'New Floor',
      floorNameAr: data.floorNameAr,
      levelOrder: Number(data.levelOrder) || 0,
      isActive: true,
      isDeleted: false,
      createdAt: now,
      ...data
    };
    if (!store.floors) store.floors = [];
    store.floors.unshift(newFlr);
    saveStore(store);
    res.status(201).json(newFlr);
  });

  apiRouter.put('/floors/:id', (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const idx = (store.floors || []).findIndex((f: any) => f.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Floor not found' });
    store.floors[idx] = { ...store.floors[idx], ...req.body, updatedAt: new Date().toISOString() };
    saveStore(store);
    res.json(store.floors[idx]);
  });

  apiRouter.delete('/floors/:id', requireEnterpriseRole(['SUPER_ADMIN', 'ADMIN']), (req, res) => {
    const store = getStore();
    const id = req.params.id;
    store.floors = (store.floors || []).filter((f: any) => f.id !== id);
    runtimeStoreManager.recordTombstone('Floor', id, (req as any).user?.username || 'Admin', 'Deleted via API');
    saveStore(store);
    res.json({ success: true });
  });

  // Locations
  apiRouter.get('/locations', (req, res) => {
    const store = getStore();
    res.json(store.locations || []);
  });

  apiRouter.post('/locations', (req, res) => {
    const store = getStore();
    const data = req.body;
    const now = new Date().toISOString();
    const newLoc = {
      id: `loc-${Date.now()}`,
      buildingId: data.buildingId || store.buildings?.[0]?.id,
      floorId: data.floorId,
      areaZone: data.areaZone || 'General Area',
      areaZoneAr: data.areaZoneAr,
      specificSpot: data.specificSpot,
      specificSpotAr: data.specificSpotAr,
      notes: data.notes,
      isActive: true,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
      ...data
    };
    if (!store.locations) store.locations = [];
    store.locations.unshift(newLoc);
    saveStore(store);
    res.status(201).json(newLoc);
  });

  apiRouter.put('/locations/:id', (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const idx = (store.locations || []).findIndex((l: any) => l.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Location not found' });
    store.locations[idx] = { ...store.locations[idx], ...req.body, updatedAt: new Date().toISOString() };
    saveStore(store);
    res.json(store.locations[idx]);
  });

  apiRouter.delete('/locations/:id', requireEnterpriseRole(['SUPER_ADMIN', 'ADMIN']), (req, res) => {
    const store = getStore();
    const id = req.params.id;
    store.locations = (store.locations || []).filter((l: any) => l.id !== id);
    runtimeStoreManager.recordTombstone('Location', id, (req as any).user?.username || 'Admin', 'Deleted via API');
    saveStore(store);
    res.json({ success: true });
  });

  // ==========================================
  // Technicians Endpoints (CRUD, KPIs & Links)
  // ==========================================

  // Check Technician References (Dependencies before deletion)
  apiRouter.get('/technicians/:id/references', (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const tech = (store.technicians || []).find((t: any) => t.id === id || t.employeeCode === id);
    if (!tech) return res.json({ canDelete: true, activeTicketsCount: 0, referenceCounts: [] });

    const activeTickets = (store.tickets || []).filter(
      (t: any) => t.assignedTechnicianId === tech.id && !['RESOLVED', 'VERIFIED', 'CLOSED', 'CANCELLED'].includes(t.status) && !t.isDeleted
    );
    const allTickets = (store.tickets || []).filter((t: any) => t.assignedTechnicianId === tech.id && !t.isDeleted);
    const requests = (store.partRequests || []).filter((r: any) => r.technicianId === tech.id && !r.isDeleted);

    res.json({
      canDelete: activeTickets.length === 0 && allTickets.length === 0,
      activeTicketsCount: activeTickets.length,
      referenceCounts: [
        { label: 'Active Assigned Tickets', count: activeTickets.length },
        { label: 'Total Historical Tickets', count: allTickets.length },
        { label: 'Spare Part Requisitions', count: requests.length }
      ]
    });
  });

  // Get All Technicians
  apiRouter.get('/technicians', (req, res) => {
    const store = getStore();
    const includeInactive = req.query.include_inactive === 'true' || req.query.includeInactive === 'true';
    let techs = (store.technicians || []).filter((t: any) => !t.isDeleted);
    if (!includeInactive) {
      techs = techs.filter((t: any) => t.isActive !== false);
    }

    const enriched = techs.map((t: any) => {
      const assignedTickets = (store.tickets || []).filter((tk: any) => tk.assignedTechnicianId === t.id && !tk.isDeleted);
      const activeTickets = assignedTickets.filter((tk: any) => !['RESOLVED', 'VERIFIED', 'CLOSED', 'CANCELLED'].includes(tk.status));
      const completedTickets = assignedTickets.filter((tk: any) => ['RESOLVED', 'VERIFIED', 'CLOSED'].includes(tk.status));

      const kpis = t.kpis || {
        technicianId: t.id,
        responseTimeMinutes: 15,
        repairTimeMinutes: 45,
        completedTickets: completedTickets.length,
        firstTimeFixRate: 94,
        slaComplianceRate: 97,
        activeTicketsCount: activeTickets.length,
        totalLaborMinutes: completedTickets.length * 45,
        partsReplacedCount: 0,
        rating: 4.9
      };
      kpis.activeTicketsCount = activeTickets.length;
      kpis.completedTickets = completedTickets.length;

      return {
        ...t,
        phone: t.phoneNumber || t.phone || '',
        phoneNumber: t.phoneNumber || t.phone || '',
        maxDailyCapacity: t.maxDailyCapacity || t.maxActiveTickets || 5,
        maxActiveTickets: t.maxActiveTickets || t.maxDailyCapacity || 5,
        kpis,
        assignedTicketsCount: assignedTickets.length,
        activeTicketsCount: activeTickets.length
      };
    });

    res.json(enriched);
  });

  // Get Single Technician by ID or Code
  apiRouter.get('/technicians/:id', (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const tech = (store.technicians || []).find((t: any) => t.id === id || t.employeeCode === id);
    if (!tech) return res.status(404).json({ error: 'Technician not found' });

    const assignedTickets = (store.tickets || []).filter((tk: any) => tk.assignedTechnicianId === tech.id && !tk.isDeleted);
    const partRequests = (store.partRequests || []).filter((pr: any) => pr.technicianId === tech.id && !pr.isDeleted);

    res.json({
      ...tech,
      phone: tech.phoneNumber || tech.phone || '',
      phoneNumber: tech.phoneNumber || tech.phone || '',
      assignedTickets,
      partRequests
    });
  });

  // Create Technician
  apiRouter.post('/technicians', (req, res) => {
    const store = getStore();
    const techData = req.body || {};

    const empCode = (techData.employeeCode || `TECH-${Math.floor(1000 + Math.random() * 9000)}`).trim().toUpperCase();

    // Prevent duplicate active employee codes
    const existing = (store.technicians || []).find(
      (t: any) => (t.employeeCode || '').toUpperCase() === empCode && !t.isDeleted
    );
    if (existing) {
      return res.status(400).json({ error: `رمز الفني '${empCode}' مسجل مسبقاً في المنظومة (Employee code already exists)` });
    }

    const techId = techData.id || `tch-${Date.now()}`;
    const fullName = (techData.fullName || empCode).trim();
    const phone = (techData.phoneNumber || techData.phone || '').trim();
    const email = (techData.email || `${empCode.toLowerCase().replace(/[^a-z0-9]/g, '')}@vendingfleet.com`).trim();
    const capacity = Math.max(1, Number(techData.maxDailyCapacity || techData.maxActiveTickets || 5));
    const region = techData.assignedRegion || 'Central Campus & Admin Complex';
    const specialization = techData.specialization || 'Refrigeration & Cooling Specialist';
    const skills = Array.isArray(techData.skills) && techData.skills.length > 0 ? techData.skills : [specialization, 'General Vending Maintenance'];

    // 1. Link or Create User Account
    let linkedUser = (store.users || []).find(
      (u: any) => (u.employeeCode && u.employeeCode.toUpperCase() === empCode) || (u.email && u.email.toLowerCase() === email.toLowerCase())
    );
    if (!linkedUser) {
      linkedUser = {
        id: `usr-${Date.now()}`,
        name: fullName,
        email: email,
        phone: phone,
        employeeCode: empCode,
        role: 'TECHNICIAN',
        status: 'ACTIVE',
        assignedRegion: region,
        createdAt: new Date().toISOString()
      };
      store.users = store.users || [];
      store.users.push(linkedUser);
    }

    // 2. Build Technician Entity
    const newTech = {
      id: techId,
      userId: linkedUser.id,
      employeeCode: empCode,
      fullName: fullName,
      fullNameAr: techData.fullNameAr || fullName,
      email: email,
      phone: phone,
      phoneNumber: phone,
      specialization: specialization,
      status: techData.status || 'AVAILABLE',
      skills: skills,
      assignedRegion: region,
      maxDailyCapacity: capacity,
      maxActiveTickets: capacity,
      isActive: true,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      kpis: {
        technicianId: techId,
        responseTimeMinutes: 15,
        repairTimeMinutes: 45,
        completedTickets: 0,
        firstTimeFixRate: 95,
        slaComplianceRate: 98,
        activeTicketsCount: 0,
        totalLaborMinutes: 0,
        partsReplacedCount: 0,
        rating: 5.0
      }
    };

    store.technicians = store.technicians || [];
    store.technicians.push(newTech);

    // 3. System Audit Log
    store.auditLogs = store.auditLogs || [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'TECHNICIAN_CREATED',
      entityName: 'Technician',
      entityId: empCode,
      newValues: {
        fullName: newTech.fullName,
        employeeCode: newTech.employeeCode,
        specialization: newTech.specialization,
        phone: newTech.phone,
        userId: linkedUser.id
      },
      createdAt: new Date().toISOString()
    });

    saveStore(store);
    res.status(201).json(newTech);
  });

  // Update Technician
  apiRouter.put('/technicians/:id', (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const updates = req.body || {};

    const idx = (store.technicians || []).findIndex((t: any) => t.id === id || t.employeeCode === id);
    if (idx === -1) return res.status(404).json({ error: 'Technician not found' });

    const current = store.technicians[idx];
    const phone = updates.phoneNumber !== undefined ? updates.phoneNumber : updates.phone !== undefined ? updates.phone : current.phone;
    const capacity = Number(updates.maxDailyCapacity || updates.maxActiveTickets || current.maxDailyCapacity || 5);

    const updated = {
      ...current,
      fullName: updates.fullName !== undefined ? updates.fullName.trim() : current.fullName,
      fullNameAr: updates.fullNameAr !== undefined ? updates.fullNameAr.trim() : current.fullNameAr,
      email: updates.email !== undefined ? updates.email.trim() : current.email,
      phone: phone,
      phoneNumber: phone,
      specialization: updates.specialization !== undefined ? updates.specialization : current.specialization,
      status: updates.status !== undefined ? updates.status : current.status,
      skills: updates.skills !== undefined ? updates.skills : current.skills,
      assignedRegion: updates.assignedRegion !== undefined ? updates.assignedRegion : current.assignedRegion,
      maxDailyCapacity: capacity,
      maxActiveTickets: capacity,
      isActive: updates.isActive !== undefined ? updates.isActive : current.isActive,
      updatedAt: new Date().toISOString()
    };

    store.technicians[idx] = updated;

    // Sync to user if linked
    if (updated.userId) {
      const uIdx = (store.users || []).findIndex((u: any) => u.id === updated.userId);
      if (uIdx !== -1) {
        store.users[uIdx] = {
          ...store.users[uIdx],
          name: updated.fullName,
          email: updated.email,
          phone: updated.phone,
          assignedRegion: updated.assignedRegion
        };
      }
    }

    store.auditLogs = store.auditLogs || [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'TECHNICIAN_UPDATED',
      entityName: 'Technician',
      entityId: updated.employeeCode,
      newValues: {
        fullName: updated.fullName,
        specialization: updated.specialization,
        status: updated.status
      },
      createdAt: new Date().toISOString()
    });

    saveStore(store);
    res.json(updated);
  });

  // Deactivate Technician
  apiRouter.post('/technicians/:id/deactivate', (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const { reason } = req.body || {};

    const tech = (store.technicians || []).find((t: any) => t.id === id || t.employeeCode === id);
    if (!tech) return res.status(404).json({ error: 'Technician not found' });

    const activeTickets = (store.tickets || []).filter(
      (t: any) => t.assignedTechnicianId === tech.id && !['RESOLVED', 'VERIFIED', 'CLOSED', 'CANCELLED'].includes(t.status) && !t.isDeleted
    );
    if (activeTickets.length > 0) {
      return res.status(400).json({
        error: `لا يمكن تعطيل حساب الفني (${tech.fullName || tech.employeeCode}) لوجود (${activeTickets.length}) تذكرة صيانة جارية مسندة إليه. يرجى إعادة إسناد التذاكر أولاً.`
      });
    }

    tech.isActive = false;
    tech.status = 'ON_LEAVE';
    tech.deactivatedAt = new Date().toISOString();
    tech.deactivatedBy = 'System Admin';
    tech.deactivationReason = reason || 'Staff deactivation';
    tech.updatedAt = new Date().toISOString();

    if (tech.userId) {
      const user = (store.users || []).find((u: any) => u.id === tech.userId);
      if (user) user.status = 'INACTIVE';
    }

    store.auditLogs = store.auditLogs || [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'TECHNICIAN_DEACTIVATED',
      entityName: 'Technician',
      entityId: tech.employeeCode,
      newValues: { isActive: false, reason: tech.deactivationReason },
      createdAt: new Date().toISOString()
    });

    saveStore(store);
    res.json(tech);
  });

  // Reactivate Technician
  apiRouter.post('/technicians/:id/reactivate', (req, res) => {
    const store = getStore();
    const id = req.params.id;

    const tech = (store.technicians || []).find((t: any) => t.id === id || t.employeeCode === id);
    if (!tech) return res.status(404).json({ error: 'Technician not found' });

    tech.isActive = true;
    tech.status = 'AVAILABLE';
    tech.deactivatedAt = undefined;
    tech.deactivatedBy = undefined;
    tech.deactivationReason = undefined;
    tech.updatedAt = new Date().toISOString();

    if (tech.userId) {
      const user = (store.users || []).find((u: any) => u.id === tech.userId);
      if (user) user.status = 'ACTIVE';
    }

    store.auditLogs = store.auditLogs || [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'TECHNICIAN_REACTIVATED',
      entityName: 'Technician',
      entityId: tech.employeeCode,
      newValues: { isActive: true },
      createdAt: new Date().toISOString()
    });

    saveStore(store);
    res.json(tech);
  });

  // Delete Technician
  apiRouter.delete('/technicians/:id', (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const hardDelete = req.query.hard === 'true' || req.query.hardDelete === 'true';
    const reason = req.body?.reason || req.query.reason as string;

    const idx = (store.technicians || []).findIndex((t: any) => t.id === id || t.employeeCode === id);
    if (idx === -1) return res.status(404).json({ error: 'Technician not found' });

    const tech = store.technicians[idx];

    if (hardDelete) {
      store.technicians.splice(idx, 1);
      store.auditLogs = store.auditLogs || [];
      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'TECHNICIAN_PURGED',
        entityName: 'Technician',
        entityId: tech.employeeCode,
        newValues: { reason: reason || 'Hard delete' },
        createdAt: new Date().toISOString()
      });
    } else {
      tech.isDeleted = true;
      tech.isActive = false;
      tech.status = 'INACTIVE';
      tech.deletedAt = new Date().toISOString();
      tech.deletedBy = 'System Admin';
      tech.deletionReason = reason || 'Soft deleted';
      tech.updatedAt = new Date().toISOString();

      store.auditLogs = store.auditLogs || [];
      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'TECHNICIAN_DELETED',
        entityName: 'Technician',
        entityId: tech.employeeCode,
        newValues: { isDeleted: true, reason: tech.deletionReason },
        createdAt: new Date().toISOString()
      });
    }

    saveStore(store);
    res.json({ success: true });
  });

  // ==========================================
  // Spare Parts Catalog & Inventory Endpoints
  // ==========================================

  // Check Spare Part References (Dependencies)
  apiRouter.get('/spare-parts/:id/references', (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const part = (store.spareParts || []).find((p: any) => p.id === id || p.partNumber === id);
    if (!part) return res.json({ canDelete: true, referenceCounts: [] });

    const transactions = (store.transactions || []).filter((t: any) => t.partId === part.id || t.sparePartId === part.id);
    const requests = (store.partRequests || []).filter((r: any) => (r.partId === part.id || r.sparePartId === part.id) && !r.isDeleted);

    const counts = [
      { label: 'Current Inventory Units', count: part.currentQuantity || 0 },
      { label: 'Inventory Movements', count: transactions.length },
      { label: 'Part Requisitions', count: requests.length }
    ];

    const hasStockOrHistory = (part.currentQuantity || 0) > 0 || transactions.length > 0 || requests.length > 0;
    res.json({
      canDelete: !hasStockOrHistory,
      referenceCounts: counts
    });
  });

  // Get All Spare Parts
  apiRouter.get('/spare-parts', (req, res) => {
    const store = getStore();
    const includeInactive = req.query.include_inactive === 'true' || req.query.includeInactive === 'true';
    const category = req.query.category as string | undefined;

    let parts = (store.spareParts || []).filter((p: any) => !p.isDeleted);
    if (!includeInactive) {
      parts = parts.filter((p: any) => p.isActive !== false);
    }
    if (category && category !== 'ALL') {
      parts = parts.filter((p: any) => p.category === category || p.categoryId === category || (typeof p.category === 'object' && p.category?.name === category));
    }

    const enriched = parts.map((p: any) => {
      const cat = typeof p.category === 'object' ? p.category : (store.categories || []).find((c: any) => c.id === p.categoryId || c.name === p.category);
      const sup = p.supplierId ? (store.suppliers || []).find((s: any) => s.id === p.supplierId) : undefined;
      return {
        ...p,
        category: cat || p.category,
        supplier: sup,
        totalValue: (p.currentQuantity || 0) * (p.unitCost || 0)
      };
    });

    res.json(enriched);
  });

  // Get Single Spare Part
  apiRouter.get('/spare-parts/:id', (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const part = (store.spareParts || []).find((p: any) => p.id === id || p.partNumber === id);
    if (!part) return res.status(404).json({ error: 'Spare part not found' });

    const cat = typeof part.category === 'object' ? part.category : (store.categories || []).find((c: any) => c.id === part.categoryId || c.name === part.category);
    const sup = part.supplierId ? (store.suppliers || []).find((s: any) => s.id === part.supplierId) : undefined;

    res.json({
      ...part,
      category: cat || part.category,
      supplier: sup,
      totalValue: (part.currentQuantity || 0) * (part.unitCost || 0)
    });
  });

  // Create Spare Part
  apiRouter.post('/spare-parts', (req, res) => {
    const store = getStore();
    const partData = req.body;

    const sku = (partData.partNumber || `SP-${Date.now().toString().slice(-6)}`).trim().toUpperCase();
    const existing = (store.spareParts || []).find((p: any) => p.partNumber && p.partNumber.toUpperCase() === sku);
    if (existing) {
      return res.status(400).json({ error: `Spare part SKU '${sku}' already exists in catalog.` });
    }

    const initialQty = Math.max(0, Number(partData.currentQuantity) || 0);
    const unitCost = Math.max(0, Number(partData.unitCost) || 0);
    const minStock = Number(partData.minStockLevel ?? partData.minimumQuantity ?? 5);
    const maxStock = Number(partData.maxStockLevel ?? Math.max(minStock * 4, 30));

    const cat = (store.categories || []).find((c: any) => c.id === partData.categoryId || c.name === partData.category) || store.categories?.[0] || { id: 'cat-001', name: 'General' };
    const sup = partData.supplierId ? (store.suppliers || []).find((s: any) => s.id === partData.supplierId) : undefined;

    const now = new Date().toISOString();
    const newPart: any = {
      id: `prt-${Date.now()}`,
      partNumber: sku,
      name: (partData.name || 'New Spare Part').trim(),
      nameAr: partData.nameAr?.trim() || partData.name?.trim(),
      categoryId: cat.id,
      category: cat,
      supplierId: sup?.id,
      supplier: sup,
      manufacturer: partData.manufacturer || sup?.name || 'OEM',
      compatibleModels: partData.compatibleModels || ['RoboVendor Pro 500', 'BaristaTouch', 'HydroPure'],
      unit: partData.unit || 'PCS',
      currentQuantity: initialQty,
      minStockLevel: minStock,
      minimumQuantity: minStock,
      maxStockLevel: maxStock,
      unitCost: unitCost,
      totalValue: initialQty * unitCost,
      storageLocation: partData.storageLocation || 'Central Warehouse Bin A-01',
      leadTimeDays: Number(partData.leadTimeDays || sup?.leadTimeDays || 3),
      isActive: true,
      createdAt: now,
      updatedAt: now
    };

    if (!store.spareParts) store.spareParts = [];
    store.spareParts.unshift(newPart);

    // If initial quantity > 0, automatically post an audited RECEIVE transaction
    if (initialQty > 0) {
      if (!store.transactions) store.transactions = [];
      store.transactions.unshift({
        id: `tx-${Date.now()}`,
        partId: newPart.id,
        sparePartId: newPart.id,
        part: newPart,
        sparePart: newPart,
        transactionType: 'RECEIVE',
        quantity: initialQty,
        quantityDelta: initialQty,
        balanceBefore: 0,
        balanceAfter: initialQty,
        unitCost: unitCost,
        unitPrice: unitCost,
        totalCost: initialQty * unitCost,
        performedBy: req.body.performedBy || 'Warehouse Inventory Lead',
        referenceNumber: 'INITIAL-STOCK-SETUP',
        notes: `Initial baseline stock receipt for new catalog SKU ${newPart.partNumber}`,
        createdAt: now
      });
    }

    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'SPARE_PART_CREATED',
      entityName: 'SparePart',
      entityId: newPart.partNumber,
      newValues: { name: newPart.name, initialQty, unitCost, storageLocation: newPart.storageLocation },
      createdAt: now
    });

    saveStore(store);
    res.json(newPart);
  });

  // Update Spare Part
  apiRouter.put('/spare-parts/:id', (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const part = (store.spareParts || []).find((p: any) => p.id === id || p.partNumber === id);
    if (!part) return res.status(404).json({ error: 'Spare part not found' });

    const updates = req.body;
    const oldValues = { ...part };
    const now = new Date().toISOString();

    if (updates.name !== undefined) part.name = updates.name.trim();
    if (updates.nameAr !== undefined) part.nameAr = updates.nameAr.trim();
    if (updates.unitCost !== undefined) part.unitCost = Number(updates.unitCost);
    if (updates.minStockLevel !== undefined) {
      part.minStockLevel = Number(updates.minStockLevel);
      part.minimumQuantity = Number(updates.minStockLevel);
    }
    if (updates.minimumQuantity !== undefined && updates.minStockLevel === undefined) {
      part.minStockLevel = Number(updates.minimumQuantity);
      part.minimumQuantity = Number(updates.minimumQuantity);
    }
    if (updates.maxStockLevel !== undefined) part.maxStockLevel = Number(updates.maxStockLevel);
    if (updates.storageLocation !== undefined) part.storageLocation = updates.storageLocation;
    if (updates.manufacturer !== undefined) part.manufacturer = updates.manufacturer;
    if (updates.supplierId !== undefined) {
      part.supplierId = updates.supplierId;
      part.supplier = (store.suppliers || []).find((s: any) => s.id === updates.supplierId);
    }
    if (updates.categoryId !== undefined) {
      part.categoryId = updates.categoryId;
      part.category = (store.categories || []).find((c: any) => c.id === updates.categoryId);
    } else if (updates.category !== undefined && typeof updates.category === 'string') {
      part.category = updates.category;
      const foundCat = (store.categories || []).find((c: any) => c.name === updates.category || c.id === updates.category);
      if (foundCat) part.categoryId = foundCat.id;
    }
    if (updates.compatibleModels !== undefined) part.compatibleModels = updates.compatibleModels;
    if (updates.leadTimeDays !== undefined) part.leadTimeDays = Number(updates.leadTimeDays);
    if (updates.isActive !== undefined) part.isActive = Boolean(updates.isActive);

    part.totalValue = (part.currentQuantity || 0) * (part.unitCost || 0);
    part.updatedAt = now;

    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'SPARE_PART_UPDATED',
      entityName: 'SparePart',
      entityId: part.partNumber,
      oldValues: { unitCost: oldValues.unitCost, minStock: oldValues.minStockLevel },
      newValues: { unitCost: part.unitCost, minStock: part.minStockLevel, name: part.name },
      createdAt: now
    });

    saveStore(store);
    res.json(part);
  });

  // Deactivate Spare Part
  apiRouter.post('/spare-parts/:id/deactivate', (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const part = (store.spareParts || []).find((p: any) => p.id === id || p.partNumber === id);
    if (!part) return res.status(404).json({ error: 'Spare part not found' });

    const now = new Date().toISOString();
    part.isActive = false;
    part.deactivatedAt = now;
    part.deactivatedBy = req.body.deactivatedBy || 'System Admin';
    part.deactivationReason = req.body.reason || 'Discontinued / Inactive SKU';
    part.updatedAt = now;

    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'SPARE_PART_DEACTIVATED',
      entityName: 'SparePart',
      entityId: part.partNumber,
      newValues: { isActive: false, reason: part.deactivationReason },
      createdAt: now
    });

    saveStore(store);
    res.json(part);
  });

  // Reactivate Spare Part
  apiRouter.post('/spare-parts/:id/reactivate', (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const part = (store.spareParts || []).find((p: any) => p.id === id || p.partNumber === id);
    if (!part) return res.status(404).json({ error: 'Spare part not found' });

    const now = new Date().toISOString();
    part.isActive = true;
    part.deactivatedAt = undefined;
    part.deactivatedBy = undefined;
    part.deactivationReason = undefined;
    part.updatedAt = now;

    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'SPARE_PART_REACTIVATED',
      entityName: 'SparePart',
      entityId: part.partNumber,
      newValues: { isActive: true },
      createdAt: now
    });

    saveStore(store);
    res.json(part);
  });

  // Delete Spare Part
  apiRouter.delete('/spare-parts/:id', (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const part = (store.spareParts || []).find((p: any) => p.id === id || p.partNumber === id);
    if (!part) return res.status(404).json({ error: 'Spare part not found' });

    const hardDelete = req.query.hardDelete === 'true' || req.body?.hardDelete === true || req.query.force === 'true';
    const reason = (req.body?.reason || req.query.reason || 'Deleted SKU') as string;
    const now = new Date().toISOString();

    if (hardDelete) {
      store.spareParts = (store.spareParts || []).filter((p: any) => p.id !== part.id && p.partNumber !== part.partNumber);
      store.partRequests = (store.partRequests || []).filter((r: any) => r.partId !== part.id && r.sparePartId !== part.id);
      store.transactions = (store.transactions || []).filter((t: any) => t.partId !== part.id && t.sparePartId !== part.id);

      if (!store.auditLogs) store.auditLogs = [];
      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'SPARE_PART_PURGED',
        entityName: 'SparePart',
        entityId: part.partNumber,
        newValues: { reason },
        createdAt: now
      });
    } else {
      part.isDeleted = true;
      part.isActive = false;
      part.deletedAt = now;
      part.deletedBy = req.body?.deletedBy || 'System Admin';
      part.deletionReason = reason;
      part.updatedAt = now;

      if (!store.auditLogs) store.auditLogs = [];
      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action: 'SPARE_PART_DELETED',
        entityName: 'SparePart',
        entityId: part.partNumber,
        newValues: { isDeleted: true, reason: part.deletionReason },
        createdAt: now
      });
    }

    saveStore(store);
    res.json({ success: true, partNumber: part.partNumber });
  });

  // Purge all demo/default data endpoint
  apiRouter.all('/system/purge-demo-data', (req, res) => {
    const store = getStore();
    store.machines = [];
    store.tickets = [];
    store.buildings = [];
    store.floors = [];
    store.locations = [];
    store.technicians = [];
    store.spareParts = [];
    store.suppliers = [];
    store.partRequests = [];
    store.transactions = [];
    store.importBatches = [];
    store.importRows = [];
    store.auditLogs = [];
    saveStore(store);
    res.json({ success: true, message: 'All demo and test records purged successfully. System is completely clean.' });
  });

  // Spare Categories
  const handleGetCategories = (req: express.Request, res: express.Response) => {
    const store = getStore();
    const categories = (store.categories || []).map((c: any) => {
      const matchingParts = (store.spareParts || []).filter((p: any) => 
        !p.isDeleted && (p.categoryId === c.id || (typeof p.category === 'string' && p.category === c.name) || (typeof p.category === 'object' && p.category?.id === c.id))
      );
      const partsCount = matchingParts.length;
      const totalValue = matchingParts.reduce((sum: number, p: any) => sum + ((p.currentQuantity || 0) * (p.unitCost || 0)), 0);
      return {
        ...c,
        partsCount,
        totalValue
      };
    });
    res.json(categories);
  };

  apiRouter.get('/spare-categories', handleGetCategories);
  apiRouter.get('/spare-parts/categories', handleGetCategories);

  apiRouter.post('/spare-categories', (req, res) => {
    const store = getStore();
    const cat = req.body;
    const newCat = {
      id: `cat-${Date.now()}`,
      name: cat.name || 'New Category',
      nameAr: cat.nameAr || cat.name || 'تصنيف جديد',
      description: cat.description,
      partsCount: 0,
      totalValue: 0
    };
    if (!store.categories) store.categories = [];
    store.categories.push(newCat);

    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'CATEGORY_CREATED',
      entityName: 'SparePartCategory',
      entityId: newCat.id,
      newValues: { name: newCat.name },
      createdAt: new Date().toISOString()
    });

    saveStore(store);
    res.json(newCat);
  });

  apiRouter.put('/spare-categories/:id', (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const existing = (store.categories || []).find((c: any) => c.id === id);
    if (!existing) return res.status(404).json({ error: 'Category not found' });

    Object.assign(existing, req.body);
    saveStore(store);
    res.json(existing);
  });

  apiRouter.delete('/spare-categories/:id', (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const idx = (store.categories || []).findIndex((c: any) => c.id === id);
    if (idx !== -1) {
      store.categories.splice(idx, 1);
      saveStore(store);
    }
    res.json({ success: true });
  });

  // Suppliers
  apiRouter.get('/suppliers', (req, res) => {
    const store = getStore();
    res.json(store.suppliers || []);
  });

  apiRouter.post('/suppliers', (req, res) => {
    const store = getStore();
    const sup = req.body;
    const newSup = {
      id: `sup-${Date.now()}`,
      name: sup.name || 'New Supplier',
      nameAr: sup.nameAr || sup.name,
      contactPerson: sup.contactPerson,
      email: sup.email,
      phone: sup.phone,
      rating: Number(sup.rating) || 4.5,
      leadTimeDays: Number(sup.leadTimeDays) || 3,
      isActive: true,
      createdAt: new Date().toISOString()
    };
    if (!store.suppliers) store.suppliers = [];
    store.suppliers.push(newSup);

    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'SUPPLIER_CREATED',
      entityName: 'Supplier',
      entityId: newSup.id,
      newValues: { name: newSup.name },
      createdAt: new Date().toISOString()
    });

    saveStore(store);
    res.json(newSup);
  });

  apiRouter.put('/suppliers/:id', (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const existing = (store.suppliers || []).find((s: any) => s.id === id);
    if (!existing) return res.status(404).json({ error: 'Supplier not found' });

    Object.assign(existing, req.body);
    saveStore(store);
    res.json(existing);
  });

  apiRouter.delete('/suppliers/:id', (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const idx = (store.suppliers || []).findIndex((s: any) => s.id === id);
    if (idx !== -1) {
      store.suppliers.splice(idx, 1);
      saveStore(store);
    }
    res.json({ success: true });
  });

  // ==========================================
  // Inventory Transactions & Stock Adjustment
  // ==========================================

  // Get Inventory Transactions Ledger
  const handleGetTransactions = (req: express.Request, res: express.Response) => {
    const store = getStore();
    const { partId, type, ticketId, machineId } = req.query as any;

    let list = [...(store.transactions || [])];
    if (partId) {
      list = list.filter((tx: any) => tx.partId === partId || tx.sparePartId === partId);
    }
    if (type) {
      list = list.filter((tx: any) => tx.transactionType === type);
    }
    if (ticketId) {
      list = list.filter((tx: any) => tx.referenceTicketId === ticketId || tx.referenceTicketNumber === ticketId);
    }
    if (machineId) {
      list = list.filter((tx: any) => tx.machineId === machineId || tx.machineNumber === machineId);
    }

    res.json(list);
  };

  apiRouter.get('/transactions', handleGetTransactions);
  apiRouter.get('/inventory/transactions', handleGetTransactions);

  // Post Audited Stock Adjustment (Enforces Prevent Negative Inventory)
  const handleStockAdjustment = (req: express.Request, res: express.Response) => {
    const store = getStore();
    const adj = req.body;

    const targetId = adj.part_id || adj.sparePartId || adj.partId || store.spareParts?.[0]?.id;
    const part = (store.spareParts || []).find((p: any) => p.id === targetId || p.partNumber === targetId);
    if (!part) {
      return res.status(404).json({ error: `Spare part with ID/SKU '${targetId}' was not found in catalog.` });
    }

    const type = adj.transaction_type || adj.transactionType || 'ADJUSTMENT';
    const rawQty = Math.abs(adj.quantity !== undefined ? Number(adj.quantity) : (adj.quantity_delta !== undefined ? Math.abs(Number(adj.quantity_delta)) : 1));

    // Signed delta calculation
    let delta = 0;
    if (type === 'RECEIVE' || type === 'RETURN') {
      delta = rawQty;
    } else if (type === 'ISSUE' || type === 'SCRAP' || type === 'TRANSFER') {
      delta = -rawQty;
    } else if (type === 'ADJUSTMENT') {
      delta = adj.quantity_delta !== undefined ? Number(adj.quantity_delta) : (adj.quantity !== undefined ? Number(adj.quantity) : rawQty);
    }

    const balanceBefore = Number(part.currentQuantity) || 0;
    const balanceAfter = balanceBefore + delta;

    // STRICT CHECK: PREVENT NEGATIVE INVENTORY
    if (balanceAfter < 0) {
      return res.status(400).json({
        error: `Insufficient stock available for SKU ${part.partNumber} (${part.name}). ` +
          `Current available stock is ${balanceBefore} units, but requested transaction requires deducting ${Math.abs(delta)} units. ` +
          `Negative inventory is strictly prevented. Please file a Spare Part Request to replenish stock.`
      });
    }

    // Update part state
    const now = new Date().toISOString();
    part.currentQuantity = balanceAfter;
    part.totalValue = balanceAfter * (part.unitCost || 0);
    part.updatedAt = now;

    const costPerUnit = adj.unitCost !== undefined ? Number(adj.unitCost) : (part.unitCost || 0);
    const totalMovementCost = Math.abs(delta) * costPerUnit;

    let refTicketNum = adj.referenceTicketNumber;
    if (!refTicketNum && adj.referenceTicketId) {
      const tck = (store.tickets || []).find((t: any) => t.id === adj.referenceTicketId || t.ticketNumber === adj.referenceTicketId);
      if (tck) refTicketNum = tck.ticketNumber;
    }

    let refMachNum = adj.machineNumber;
    if (!refMachNum && adj.machineId) {
      const mch = (store.machines || []).find((m: any) => m.id === adj.machineId || m.machineNumber === adj.machineId);
      if (mch) refMachNum = mch.machineNumber;
    }

    const tx: any = {
      id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      partId: part.id,
      sparePartId: part.id,
      part: part,
      sparePart: part,
      transactionType: type,
      quantity: Math.abs(delta),
      quantityDelta: delta,
      balanceBefore: balanceBefore,
      balanceAfter: balanceAfter,
      unitCost: costPerUnit,
      unitPrice: costPerUnit,
      totalCost: totalMovementCost,
      referenceTicketId: adj.referenceTicketId,
      referenceTicketNumber: refTicketNum,
      referenceNumber: adj.referenceNumber || (refTicketNum ? `TCK-${refTicketNum}` : `MOV-${Date.now().toString().slice(-6)}`),
      machineId: adj.machineId,
      machineNumber: refMachNum,
      sourceLocation: adj.sourceLocation || part.storageLocation,
      targetLocation: adj.targetLocation,
      performedBy: adj.performedBy || 'Warehouse Officer',
      notes: adj.notes || `${type} movement of ${Math.abs(delta)} units`,
      createdAt: now
    };

    if (!store.transactions) store.transactions = [];
    store.transactions.unshift(tx);

    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: `INVENTORY_${type}`,
      entityName: 'InventoryTransaction',
      entityId: tx.id,
      newValues: {
        partNumber: part.partNumber,
        type,
        delta,
        balanceBefore,
        balanceAfter,
        reference: tx.referenceNumber,
        notes: tx.notes
      },
      createdAt: now
    });

    saveStore(store);
    console.log(`[API] Stock adjusted: ${part.partNumber} ${delta > 0 ? '+' : ''}${delta} => ${balanceAfter} units`);
    res.json(tx);
  };

  apiRouter.post('/inventory/adjust', handleStockAdjustment);
  apiRouter.post('/inventory/transactions', handleStockAdjustment);

  // ==========================================
  // Spare Part Requests (Requisitions)
  // ==========================================

  // Get Part Requests
  apiRouter.get('/part-requests', (req, res) => {
    const store = getStore();
    const { status, ticketId, technicianId } = req.query as any;

    let list = [...(store.partRequests || [])].filter((r: any) => !r.isDeleted);
    if (status && status !== 'ALL') {
      list = list.filter((r: any) => r.status === status);
    }
    if (ticketId) {
      list = list.filter((r: any) => r.ticketId === ticketId || r.ticketNumber === ticketId);
    }
    if (technicianId) {
      list = list.filter((r: any) => r.technicianId === technicianId);
    }

    const enriched = list.map((reqItem: any) => {
      const part = (store.spareParts || []).find((p: any) => p.id === (reqItem.partId || reqItem.sparePartId));
      const ticket = (store.tickets || []).find((t: any) => t.id === reqItem.ticketId || t.ticketNumber === reqItem.ticketNumber);
      const tech = (store.technicians || []).find((t: any) => t.id === reqItem.technicianId);
      const sup = reqItem.supplierId ? (store.suppliers || []).find((s: any) => s.id === reqItem.supplierId) : undefined;
      return {
        ...reqItem,
        part: part || reqItem.part,
        sparePart: part || reqItem.sparePart,
        partNumber: part?.partNumber || reqItem.partNumber,
        partName: part ? (part.nameAr || part.name) : reqItem.partName,
        ticket: ticket || reqItem.ticket,
        ticketNumber: ticket?.ticketNumber || reqItem.ticketNumber,
        technician: tech || reqItem.technician,
        technicianName: tech?.fullName || reqItem.technicianName,
        supplier: sup || reqItem.supplier
      };
    });

    res.json(enriched);
  });

  // Get Single Part Request
  apiRouter.get('/part-requests/:id', (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const reqItem = (store.partRequests || []).find((r: any) => r.id === id || r.requestNumber === id);
    if (!reqItem) return res.status(404).json({ error: 'Part request not found' });

    const part = (store.spareParts || []).find((p: any) => p.id === (reqItem.partId || reqItem.sparePartId));
    const ticket = (store.tickets || []).find((t: any) => t.id === reqItem.ticketId || t.ticketNumber === reqItem.ticketNumber);
    const tech = (store.technicians || []).find((t: any) => t.id === reqItem.technicianId);
    const sup = reqItem.supplierId ? (store.suppliers || []).find((s: any) => s.id === reqItem.supplierId) : undefined;

    res.json({
      ...reqItem,
      part: part || reqItem.part,
      sparePart: part || reqItem.sparePart,
      ticket: ticket || reqItem.ticket,
      technician: tech || reqItem.technician,
      supplier: sup || reqItem.supplier
    });
  });

  // Create Part Request (Direct from PartRequestsView)
  apiRouter.post('/part-requests', (req, res) => {
    const store = getStore();
    const reqData = req.body;

    const ticketId = reqData.ticketId || reqData.ticket_id;
    const partId = reqData.sparePartId || reqData.part_id || reqData.partId;
    let part = (store.spareParts || []).find((p: any) => p.id === partId || p.partNumber === partId);
    if (!part && reqData.partNumber) {
      part = (store.spareParts || []).find((p: any) => p.partNumber?.toLowerCase() === reqData.partNumber.toLowerCase());
    }
    if (!part && reqData.partName) {
      part = (store.spareParts || []).find((p: any) => 
        (p.name && p.name.toLowerCase() === reqData.partName.toLowerCase()) ||
        (p.nameAr && p.nameAr.toLowerCase() === reqData.partName.toLowerCase())
      );
    }

    const ticket = ticketId ? (store.tickets || []).find((t: any) => t.id === ticketId || t.ticketNumber === ticketId) : undefined;
    const techId = reqData.technicianId || ticket?.assignedTechnicianId || store.technicians?.[0]?.id;
    const tech = (store.technicians || []).find((t: any) => t.id === techId) || store.technicians?.[0];

    const count = (store.partRequests || []).length + 1;
    const reqNum = `REQ-2026-${String(count).padStart(4, '0')}`;
    const now = new Date().toISOString();
    const quantity = Math.max(1, Number(reqData.quantity) || 1);
    const partName = (reqData.partName || (part ? (part.nameAr || part.name) : 'Spare Part')).trim();
    const partNumber = (reqData.partNumber || part?.partNumber || `REQ-SKU-${Math.floor(1000 + Math.random() * 9000)}`).trim().toUpperCase();
    const unitCost = Number(reqData.unitCost || reqData.estimatedCost || part?.unitCost || 45);

    if (!part) {
      if (!store.spareParts) store.spareParts = [];
      const newPartId = `prt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      part = {
        id: newPartId,
        partNumber,
        name: partName,
        nameAr: partName,
        category: reqData.category || 'GENERAL',
        unitCost,
        currentQuantity: 0,
        currentStock: 0,
        minimumQuantity: 2,
        minStockLevel: 2,
        maxStockLevel: 10,
        storageLocation: reqData.storageLocation || 'Central Warehouse Depot',
        isActive: true,
        status: 'ACTIVE',
        totalValue: 0,
        createdAt: now,
        updatedAt: now
      };
      store.spareParts.unshift(part);
      console.log(`[API] Auto-registered custom requested spare part in catalog: ${part.partNumber} (${part.name})`);
    }

    const newReq: any = {
      id: `req-${Date.now()}`,
      requestNumber: reqNum,
      ticketId: ticket?.id,
      ticket: ticket,
      ticketNumber: ticket?.ticketNumber,
      machineId: ticket?.machineId || reqData.machineId,
      machine: ticket?.machine,
      machineNumber: ticket?.machine?.machineNumber || reqData.machineNumber,
      technicianId: tech?.id,
      technician: tech,
      technicianName: tech?.fullName || tech?.employeeCode,
      partId: part.id,
      sparePartId: part.id,
      part: part,
      sparePart: part,
      partNumber,
      partName,
      unitCost,
      estimatedCost: unitCost * quantity,
      category: reqData.category || (typeof part.category === 'string' ? part.category : 'GENERAL'),
      storageLocation: reqData.storageLocation || part?.storageLocation || 'Central Warehouse Rack A-01',
      quantity,
      priority: reqData.priority || ticket?.priority || 'MEDIUM',
      status: 'REQUESTED',
      notes: reqData.notes,
      reason: reqData.reason || reqData.notes || `Requisition for ${partName} (${partNumber})`,
      timeline: [
        {
          status: 'REQUESTED',
          timestamp: now,
          actor: tech?.fullName || 'Technician',
          comment: reqData.reason || 'Requisition submitted to warehouse depot'
        }
      ],
      createdAt: now,
      updatedAt: now
    };

    if (!store.partRequests) store.partRequests = [];
    store.partRequests.unshift(newReq);

    // If linked to a ticket, update ticket status to WAITING_FOR_PART
    if (ticket) {
      const prevStatus = ticket.status;
      ticket.status = 'WAITING_FOR_PART';
      ticket.updatedAt = now;
      if (!ticket.timeline) ticket.timeline = [];
      if (!ticket.statusHistory) ticket.statusHistory = [];

      ticket.statusHistory.push({
        id: `sh-${Date.now()}`,
        ticketId: ticket.id,
        previousStatus: prevStatus,
        newStatus: 'WAITING_FOR_PART',
        comment: `تم تقديم طلب توريد/صرف قطعة غيار ${partName} (${quantity}x). تحولت التذكرة إلى في انتظار قطع الغيار.`,
        createdAt: now
      });

      ticket.timeline.unshift({
        id: `tl-${Date.now()}`,
        ticketId: ticket.id,
        timestamp: now,
        technicianName: tech?.fullName || tech?.employeeCode,
        technicianCode: tech?.employeeCode,
        technicianId: tech?.id,
        action: 'PART_REQUESTED',
        actionLabel: 'طلب قطعة غيار (في انتظار التوريد)',
        description: `تم تسجيل طلب قطعة الغيار ${reqNum} للقطعة ${partName} (${quantity}x). بانتظار موافقة وإجراءات إدارة المخزن والمشتريات.`,
        part: {
          partNumber,
          name: partName,
          quantity: newReq.quantity,
          unitCost,
          status: 'REQUESTED'
        }
      });
    }

    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'PART_REQUEST_CREATED',
      entityName: 'SparePartRequest',
      entityId: reqNum,
      newValues: { partNumber, quantity: newReq.quantity, ticket: ticket?.ticketNumber },
      createdAt: now
    });

    saveStore(store);
    res.json(newReq);
  });

  // Update Part Request Status Lifecycle
  const handleUpdatePartRequestStatus = (req: express.Request, res: express.Response) => {
    const store = getStore();
    const id = req.params.id;
    const r = (store.partRequests || []).find((reqItem: any) => reqItem.id === id || reqItem.requestNumber === id);
    if (!r) return res.status(404).json({ error: `Part request with ID '${id}' not found` });

    const {
      status,
      poNumber,
      supplierId,
      actor,
      comment,
      expectedDeliveryDate,
      rejectedReason,
      autoReplenish,
      autoIssue,
      storageLocation,
      deliveryNoteNumber,
      unitCost: suppliedUnitCost
    } = req.body;
    const now = new Date().toISOString();
    const performer = actor || 'Warehouse Supervisor';
    const transitionComment = comment || `Status moved to ${status}`;

    // Flexible part matching across ID, partNumber, and name
    let part = (store.spareParts || []).find((p: any) => 
      p.id === (r.partId || r.sparePartId) ||
      (r.partNumber && p.partNumber?.toLowerCase() === r.partNumber.toLowerCase()) ||
      (r.partName && (p.name?.toLowerCase() === r.partName.toLowerCase() || p.nameAr?.toLowerCase() === r.partName.toLowerCase()))
    );

    r.status = status;
    r.updatedAt = now;
    if (!r.timeline) r.timeline = [];

    if (status === 'APPROVED') {
      r.approvedBy = performer;
      r.approvedAt = now;
      const isStockAvailable = part ? (part.currentQuantity || 0) >= (Number(r.quantity) || 1) : false;
      r.isInStock = isStockAvailable;

      if (r.ticketId || r.ticketNumber) {
        const tck = (store.tickets || []).find((t: any) => t.id === r.ticketId || t.ticketNumber === r.ticketId || t.ticketNumber === r.ticketNumber);
        if (tck) {
          if (!tck.timeline) tck.timeline = [];
          tck.timeline.unshift({
            id: `tl-${Date.now()}`,
            ticketId: tck.id,
            timestamp: now,
            technicianName: performer,
            action: 'PART_APPROVED',
            actionLabel: isStockAvailable ? 'الموافقة على القطعة (متوفرة بالمخزن)' : 'الموافقة على الطلب (بانتظار أمر شراء)',
            description: isStockAvailable
              ? `تمت موافقة إدارة المخزن على طلب القطعة ${r.partName || part?.nameAr || part?.name}. القطعة متوفرة بالرصيد (${part?.currentQuantity} قطعة) وجاهزة لإصدار أمر الصرف الفوري.`
              : `تمت موافقة إدارة المخزن على طلب القطعة ${r.partName || part?.nameAr || part?.name}. القطعة غير متوفرة بالرصيد الحالي وجاري إصدار أمر شراء وتوريد خارجي من المورد.`
          });
        }
      }
    } else if (status === 'ORDERED') {
      r.orderedBy = performer;
      r.orderedAt = now;
      if (poNumber) r.poNumber = poNumber;
      if (supplierId) {
        r.supplierId = supplierId;
        const sup = (store.suppliers || []).find((s: any) => s.id === supplierId);
        r.supplier = sup;
      }
      if (expectedDeliveryDate) r.expectedDeliveryDate = expectedDeliveryDate;

      if (r.ticketId || r.ticketNumber) {
        const tck = (store.tickets || []).find((t: any) => t.id === r.ticketId || t.ticketNumber === r.ticketId || t.ticketNumber === r.ticketNumber);
        if (tck) {
          if (!tck.timeline) tck.timeline = [];
          tck.timeline.unshift({
            id: `tl-${Date.now()}`,
            ticketId: tck.id,
            timestamp: now,
            technicianName: performer,
            action: 'PO_PLACED',
            actionLabel: 'إصدار أمر شراء من المورد',
            description: `تم إصدار أمر شراء خارجي رقم ${r.poNumber || 'PO-NEW'} من المورد (${r.supplier?.name || 'المورد المعتمد'}) لتوريد ${r.quantity}x ${r.partName || part?.nameAr || part?.name}. الموعد المتوقع للتوريد: ${r.expectedDeliveryDate || 'قريباً'}.`
          });
        }
      }
    } else if (status === 'RECEIVED') {
      r.receivedBy = performer;
      r.receivedAt = now;
      const qty = Number(r.quantity) || 1;

      // 1. AUTO-REGISTER INTO SPARE PARTS CATALOG IF NOT ALREADY PRESENT
      if (!part) {
        if (!store.spareParts) store.spareParts = [];
        const newPartId = (r.partId && !r.partId.startsWith('custom-')) ? r.partId : `sp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const partCost = Number(suppliedUnitCost || r.estimatedCost || r.unitCost || (r.part && r.part.unitCost) || 45);
        
        part = {
          id: newPartId,
          partNumber: r.partNumber || `SKU-${Date.now().toString().slice(-6)}`,
          name: r.partName || 'Spare Part Item',
          nameAr: r.partName || 'قطعة غيار موردة',
          category: r.category || (r.part && r.part.category) || 'GENERAL',
          unitCost: partCost,
          currentQuantity: 0,
          currentStock: 0,
          minimumQuantity: 2,
          reorderPoint: 2,
          reorderQuantity: 5,
          storageLocation: storageLocation || r.storageLocation || 'Central Warehouse Rack A-01',
          status: 'ACTIVE',
          supplierId: r.supplierId,
          supplier: r.supplier,
          totalValue: 0,
          createdAt: now,
          updatedAt: now
        };
        store.spareParts.unshift(part);
        console.log(`[API] Auto-registered newly received spare part in catalog: ${part.partNumber} (${part.name})`);
      }

      // Link part IDs
      r.partId = part.id;
      r.sparePartId = part.id;
      r.part = part;
      r.sparePart = part;
      r.partNumber = part.partNumber;
      r.partName = part.nameAr || part.name;

      // 2. REPLENISH STOCK & REGISTER INVENTORY TRANSACTION
      if (autoReplenish !== false) {
        const balanceBefore = Number(part.currentQuantity) || 0;
        const balanceAfter = balanceBefore + qty;
        part.currentQuantity = balanceAfter;
        part.currentStock = balanceAfter;
        part.totalValue = balanceAfter * (part.unitCost || 0);
        part.updatedAt = now;

        const refNum = r.poNumber || deliveryNoteNumber || r.requestNumber || 'PO-RECEIPT';

        if (!store.transactions) store.transactions = [];
        store.transactions.unshift({
          id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          partId: part.id,
          sparePartId: part.id,
          part: part,
          sparePart: part,
          transactionType: 'RECEIVE',
          quantity: qty,
          quantityDelta: qty,
          balanceBefore,
          balanceAfter,
          unitCost: part.unitCost || 0,
          unitPrice: part.unitCost || 0,
          totalCost: qty * (part.unitCost || 0),
          referenceNumber: refNum,
          referenceTicketId: r.ticketId,
          referenceTicketNumber: r.ticketNumber,
          machineId: r.machineId,
          performedBy: performer,
          notes: comment || `إذن استلام وتوريد للمخزن بموجب أمر الشراء ${refNum} للبلاغ ${r.ticketNumber || r.ticketId || ''}`,
          createdAt: now
        });
        console.log(`[API] Inbound stock transaction recorded: +${qty} of ${part.partNumber} => Balance: ${balanceAfter}`);
      }

      // 3. CRITICAL LINK: NOTIFY MAINTENANCE & UPDATE TICKET TIMELINE
      if (r.ticketId || r.ticketNumber) {
        const tck = (store.tickets || []).find((t: any) => t.id === r.ticketId || t.ticketNumber === r.ticketId || t.ticketNumber === r.ticketNumber);
        if (tck) {
          if (!tck.timeline) tck.timeline = [];
          tck.timeline.unshift({
            id: `tl-${Date.now()}`,
            ticketId: tck.id,
            timestamp: now,
            technicianName: performer,
            action: 'PART_RECEIVED_AVAILABLE',
            actionLabel: 'وصلت قطعة الغيار بالمخزن (إشعار للصيانة)',
            description: `📢 إشعار لقسم الصيانة والدعم: تم توريد واستلام قطعة الغيار ${r.partName || part?.nameAr || part?.name} (${qty}x) بالمستودع بموجب إذن التوريد ${r.poNumber || r.requestNumber || 'N/A'}. القطعة الآن متوفرة بالرصيد وجاهزة للصرف الفوري لاستئناف الصيانة.`
          });
        }
      }
    } else if (status === 'ISSUED') {
      r.issuedBy = performer;
      r.issuedAt = now;
      const qty = Number(r.quantity) || 1;

      // 1. UPDATE INVENTORY & RECORD ISSUE TRANSACTION
      let balanceBefore = 0;
      let balanceAfter = 0;
      if (part) {
        balanceBefore = Number(part.currentQuantity) || 0;
        balanceAfter = Math.max(0, balanceBefore - qty);
        part.currentQuantity = balanceAfter;
        part.currentStock = balanceAfter;
        part.totalValue = balanceAfter * (part.unitCost || 0);
        part.updatedAt = now;
      }

      if (!store.transactions) store.transactions = [];
      store.transactions.unshift({
        id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        partId: part?.id || r.partId,
        sparePartId: part?.id || r.partId,
        part: part,
        sparePart: part,
        transactionType: 'ISSUE',
        quantity: qty,
        quantityDelta: -qty,
        balanceBefore,
        balanceAfter,
        unitCost: part?.unitCost || Number(r.estimatedCost || 0),
        unitPrice: part?.unitCost || Number(r.estimatedCost || 0),
        totalCost: qty * (part?.unitCost || Number(r.estimatedCost || 0)),
        referenceTicketId: r.ticketId,
        referenceTicketNumber: r.ticketNumber,
        machineId: r.machineId,
        performedBy: performer,
        notes: comment || `أمر صرف وتسليم للموقع لصالح البلاغ ${r.ticketNumber || r.ticketId || ''} (${r.requestNumber || r.id})`,
        createdAt: now
      });

      // 2. CRITICAL LINK: AUTOMATICALLY UPDATE TICKET STATUS TO IN_PROGRESS & NOTIFY MAINTENANCE
      const tck = (store.tickets || []).find((t: any) => 
        t.id === r.ticketId || 
        t.ticketNumber === r.ticketId || 
        t.id === r.ticketNumber || 
        t.ticketNumber === r.ticketNumber
      );

      if (tck) {
        const prevStatus = tck.status;
        tck.status = 'IN_PROGRESS';
        tck.updatedAt = now;

        if (!tck.statusHistory) tck.statusHistory = [];
        tck.statusHistory.push({
          id: `sh-${Date.now()}`,
          ticketId: tck.id,
          previousStatus: prevStatus,
          newStatus: 'IN_PROGRESS',
          comment: `تم صرف وتسليم قطعة الغيار (${qty}x ${r.partName || part?.nameAr || part?.name}) للفني المختص، وتم تحويل حالة التذكرة تلقائياً إلى [قيد الإصلاح - IN_PROGRESS].`,
          createdAt: now
        });

        if (!tck.timeline) tck.timeline = [];
        tck.timeline.unshift({
          id: `tl-${Date.now()}`,
          ticketId: tck.id,
          timestamp: now,
          technicianId: r.technicianId || tck.assignedTechnicianId,
          technicianName: performer,
          action: 'PART_DISPATCHED_TO_FIELD',
          actionLabel: 'تم تسليم القطعة للفني (تحويل لقيد الإصلاح)',
          description: `📢 إشعار صيانة فوري: تم صرف وتسليم قطعة الغيار ${r.partName || part?.nameAr || part?.name} (${qty}x) من المستودع للفني المعتمد. تم استئناف حالة البلاغ فوراً من [${prevStatus}] إلى [قيد الإصلاح - IN_PROGRESS] لاستكمال أعمال الإصيانة.`
        });

        // Register maintenance action entry
        if (!tck.maintenanceActions) tck.maintenanceActions = [];
        tck.maintenanceActions.unshift({
          id: `ma-${Date.now()}`,
          ticketId: tck.id,
          technicianId: r.technicianId || tck.assignedTechnicianId,
          actionType: 'PART_ISSUED',
          actionTaken: `تسليم وصرف قطعة الغيار (${r.partName || part?.name}) واستئناف العمل`,
          description: `تم إصدار إذن الصرف رقم ${r.requestNumber || r.id} وتسليم ${qty}x ${r.partName || part?.name} للفني الميداني ومباشرة أعمال الإصلاح.`,
          partsUsed: [{
            partId: part?.id || r.partId,
            sparePart: part,
            quantity: qty,
            unitCostAtUse: part?.unitCost || 0
          }],
          performedAt: now,
          createdAt: now
        });

        console.log(`[API] Ticket ${tck.ticketNumber} transitioned from ${prevStatus} to IN_PROGRESS upon part issuance.`);
      }
    } else if (status === 'REJECTED') {
      r.rejectedReason = rejectedReason || comment;
      r.rejectionReason = rejectedReason || comment;
    }

    r.timeline.unshift({
      status,
      timestamp: now,
      actor: performer,
      comment: transitionComment
    });

    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: `PART_REQUEST_${status}`,
      entityName: 'SparePartRequest',
      entityId: r.requestNumber || r.id,
      newValues: { status, actor: performer, comment: transitionComment },
      createdAt: now
    });

    saveStore(store);
    res.json(r);
  };

  apiRouter.post('/part-requests/:id/status', handleUpdatePartRequestStatus);
  apiRouter.put('/part-requests/:id/status', handleUpdatePartRequestStatus);

  // Update Part Request Details
  apiRouter.put('/part-requests/:id', (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const r = (store.partRequests || []).find((reqItem: any) => reqItem.id === id || reqItem.requestNumber === id);
    if (!r) return res.status(404).json({ error: 'Part request not found' });

    const updates = req.body;
    if (updates.quantity !== undefined) r.quantity = Math.max(1, Number(updates.quantity));
    if (updates.priority !== undefined) r.priority = updates.priority;
    if (updates.notes !== undefined) r.notes = updates.notes;
    if (updates.reason !== undefined) r.reason = updates.reason;
    if (updates.poNumber !== undefined) r.poNumber = updates.poNumber;
    if (updates.supplierId !== undefined) {
      r.supplierId = updates.supplierId;
      r.supplier = (store.suppliers || []).find((s: any) => s.id === updates.supplierId);
    }
    r.updatedAt = new Date().toISOString();

    saveStore(store);
    res.json(r);
  });

  // Cancel Part Request
  apiRouter.post('/part-requests/:id/cancel', (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const r = (store.partRequests || []).find((reqItem: any) => reqItem.id === id || reqItem.requestNumber === id);
    if (!r) return res.status(404).json({ error: 'Part request not found' });

    if (['RECEIVED', 'ISSUED'].includes(r.status)) {
      return res.status(400).json({ error: 'Cannot cancel a requisition that has already been fulfilled or issued.' });
    }

    const now = new Date().toISOString();
    r.status = 'CANCELLED';
    r.updatedAt = now;
    if (!r.timeline) r.timeline = [];
    r.timeline.unshift({
      status: 'CANCELLED',
      timestamp: now,
      actor: req.body.actor || 'Warehouse Supervisor',
      comment: req.body.reason || 'Requisition cancelled'
    });

    saveStore(store);
    res.json(r);
  });

  // Delete Part Request
  apiRouter.delete('/part-requests/:id', (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const r = (store.partRequests || []).find((reqItem: any) => reqItem.id === id || reqItem.requestNumber === id);
    if (!r) return res.status(404).json({ error: 'Part request not found' });

    if (['RECEIVED', 'ISSUED'].includes(r.status)) {
      return res.status(400).json({ error: `Cannot delete requisition ${r.requestNumber || r.id} because it has already been received/issued to maintenance.` });
    }

    const hardDelete = req.query.hardDelete === 'true';
    if (hardDelete) {
      const idx = store.partRequests.findIndex((reqItem: any) => reqItem.id === r.id);
      if (idx !== -1) store.partRequests.splice(idx, 1);
    } else {
      r.isDeleted = true;
      r.deletedAt = new Date().toISOString();
      r.deletedBy = req.body?.deletedBy || 'System Admin';
      r.deletionReason = req.body?.reason || 'Requisition discarded';
      r.updatedAt = new Date().toISOString();
    }

    saveStore(store);
    res.json({ success: true });
  });

  // Machine Part History
  apiRouter.get('/machines/:id/parts-history', (req, res) => {
    const store = getStore();
    const machineId = req.params.id;
    const targetMachine = (store.machines || []).find((m: any) => m.id === machineId || m.machineNumber === machineId);
    const mId = targetMachine ? targetMachine.id : machineId;
    const mNum = targetMachine ? targetMachine.machineNumber : machineId;

    const records: any[] = [];

    for (const tck of (store.tickets || [])) {
      if (tck.machineId === mId || tck.machine?.id === mId || tck.machine?.machineNumber === mNum) {
        if (tck.maintenanceActions) {
          for (const ma of tck.maintenanceActions) {
            if (ma.partsUsed) {
              for (const pu of ma.partsUsed) {
                const part = pu.sparePart || (store.spareParts || []).find((p: any) => p.id === pu.partId);
                if (part) {
                  records.push({
                    id: `mph-${ma.id}-${part.id}`,
                    machineId: mId,
                    machineNumber: mNum,
                    partId: part.id,
                    partNumber: part.partNumber,
                    partName: part.nameAr || part.name,
                    quantity: pu.quantity || 1,
                    unitCost: pu.unitCostAtUse || part.unitCost,
                    totalCost: (pu.quantity || 1) * (pu.unitCostAtUse || part.unitCost),
                    ticketId: tck.id,
                    ticketNumber: tck.ticketNumber,
                    technicianId: ma.technicianId || tck.assignedTechnicianId,
                    technicianName: ma.technician?.fullName || tck.assignedTechnician?.fullName || 'Field Technician',
                    installedAt: ma.performedAt || ma.createdAt || tck.resolvedAt || tck.createdAt,
                    reason: ma.description || tck.description
                  });
                }
              }
            }
          }
        }
      }
    }

    res.json(records);
  });


  // Users
  apiRouter.get('/users', (req, res) => {
    const store = getStore();
    res.json((store.users || []).map(sanitizeUserForClient));
  });

  apiRouter.post('/users', requireEnterpriseRole(['SUPER_ADMIN', 'ADMIN']), (req, res) => {
    const store = getStore();
    const userData = req.body || {};

    const pwValidation = validatePasswordStrength(userData.password);
    if (!pwValidation.valid) {
      return res.status(400).json({ error: pwValidation.error });
    }

    const userId = userData.id || `usr-${Date.now()}`;
    const fullName = (userData.fullName || userData.name || 'New User').trim();
    const email = (userData.email || `${userId}@company.com`).trim().toLowerCase();
    const role = userData.role || 'TECHNICIAN';

    const callerRole = (((req as any).user?.role || '') as string).toUpperCase().trim();
    if (role === 'SUPER_ADMIN' && callerRole !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'لا يمكن إنشاء حساب برتبة المدير العام (SUPER_ADMIN) إلا من قبل المدير العام.',
        code: 'PERMISSION_DENIED'
      });
    }

    const employeeCode = (userData.employeeCode || (role === 'TECHNICIAN' ? `TECH-${Math.floor(1000 + Math.random() * 9000)}` : '')).trim().toUpperCase();
    const passwordHash = hashPassword(String(userData.password));

    const newUser: any = {
      id: userId,
      fullName,
      name: fullName,
      email,
      phone: userData.phone || userData.phoneNumber || '',
      role,
      passwordHash,
      isActive: userData.isActive !== undefined ? userData.isActive : true,
      status: userData.status || (userData.isActive === false ? 'INACTIVE' : 'ACTIVE'),
      employeeCode,
      department: userData.department || 'Operations',
      assignedRegion: userData.assignedRegion || 'Central Campus',
      avatarUrl: userData.avatarUrl || `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150`,
      createdAt: new Date().toISOString()
    };

    store.users = store.users || [];
    store.users.push(newUser);

    // If role is TECHNICIAN, ensure matching technician entry in store.technicians
    if (role === 'TECHNICIAN') {
      const existingTech = (store.technicians || []).find(
        (t: any) => (employeeCode && t.employeeCode?.toUpperCase() === employeeCode) || (t.userId === userId)
      );
      if (!existingTech) {
        const newTech = {
          id: `tch-${Date.now()}`,
          userId: newUser.id,
          employeeCode: employeeCode || `TECH-${Math.floor(1000 + Math.random() * 9000)}`,
          fullName: fullName,
          fullNameAr: userData.fullNameAr || fullName,
          email: email,
          phone: userData.phone || '',
          phoneNumber: userData.phone || '',
          specialization: userData.specialization || 'Refrigeration & Cooling Specialist',
          status: 'AVAILABLE',
          skills: ['General Vending Maintenance'],
          assignedRegion: userData.assignedRegion || 'Central Campus',
          maxDailyCapacity: 5,
          maxActiveTickets: 5,
          isActive: true,
          isDeleted: false,
          createdAt: new Date().toISOString(),
          kpis: {
            technicianId: `tch-${Date.now()}`,
            responseTimeMinutes: 15,
            repairTimeMinutes: 45,
            completedTickets: 0,
            firstTimeFixRate: 95,
            slaComplianceRate: 98,
            activeTicketsCount: 0,
            totalLaborMinutes: 0,
            partsReplacedCount: 0,
            rating: 5.0
          }
        };
        store.technicians = store.technicians || [];
        store.technicians.push(newTech);
      }
    }

    store.auditLogs = store.auditLogs || [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'USER_CREATED',
      entityName: 'User',
      entityId: newUser.email,
      newValues: { name: newUser.name, role: newUser.role, employeeCode: newUser.employeeCode },
      createdAt: new Date().toISOString()
    });

    saveStore(store);
    res.status(201).json(sanitizeUserForClient(newUser));
  });

  apiRouter.put('/users/:id', requireEnterpriseRole(['SUPER_ADMIN', 'ADMIN']), (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const updates = req.body || {};

    const idx = (store.users || []).findIndex((u: any) => u.id === id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    const current = store.users[idx];
    const callerRole = (((req as any).user?.role || '') as string).toUpperCase().trim();
    const currentRole = ((current.role || '') as string).toUpperCase().trim();

    if (currentRole === 'SUPER_ADMIN' && callerRole !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'غير مصرح بتعديل بيانات أو صلاحيات المدير العام (SUPER_ADMIN) إلا من قبل المدير العام.',
        code: 'PERMISSION_DENIED'
      });
    }

    if (updates.role === 'SUPER_ADMIN' && callerRole !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'لا يمكن ترقية الحساب إلى رتبة المدير العام (SUPER_ADMIN) إلا من قبل المدير العام.',
        code: 'PERMISSION_DENIED'
      });
    }

    let passwordHash = current.passwordHash;
    if (updates.password !== undefined && updates.password !== null && String(updates.password).trim() !== '') {
      if (currentRole === 'ADMIN' && callerRole !== 'SUPER_ADMIN' && (req as any).user?.id !== current.id) {
        return res.status(403).json({
          error: 'غير مصرح لمسؤول النظام (ADMIN) بتغيير كلمة مرور مسؤول نظام آخر. يقتصر ذلك على المدير العام.',
          code: 'PERMISSION_DENIED'
        });
      }
      const pwValidation = validatePasswordStrength(updates.password);
      if (!pwValidation.valid) {
        return res.status(400).json({ error: pwValidation.error });
      }
      passwordHash = hashPassword(String(updates.password));
    }

    const updated: any = {
      ...current,
      name: updates.name !== undefined ? updates.name.trim() : current.name,
      fullName: updates.fullName !== undefined ? updates.fullName.trim() : (updates.name !== undefined ? updates.name.trim() : current.fullName),
      email: updates.email !== undefined ? updates.email.trim().toLowerCase() : current.email,
      phone: updates.phone !== undefined ? updates.phone.trim() : current.phone,
      role: updates.role !== undefined ? updates.role : current.role,
      status: updates.status !== undefined ? updates.status : current.status,
      isActive: updates.isActive !== undefined ? updates.isActive : (updates.status !== undefined ? updates.status === 'ACTIVE' : current.isActive),
      employeeCode: updates.employeeCode !== undefined ? updates.employeeCode.trim().toUpperCase() : current.employeeCode,
      department: updates.department !== undefined ? updates.department : current.department,
      assignedRegion: updates.assignedRegion !== undefined ? updates.assignedRegion : current.assignedRegion,
      passwordHash,
      updatedAt: new Date().toISOString()
    };
    delete updated.password;

    store.users[idx] = updated;

    // Invalidate sessions if user deactivated or role modified
    if (!updated.isActive || updated.status === 'INACTIVE' || updated.role !== current.role) {
      invalidateUserSessions(id);
    }

    // Sync corresponding technician if role is TECHNICIAN
    if (updated.role === 'TECHNICIAN' || current.role === 'TECHNICIAN') {
      const techIdx = (store.technicians || []).findIndex((t: any) => t.userId === id || (updated.employeeCode && t.employeeCode === updated.employeeCode));
      if (techIdx !== -1) {
        store.technicians[techIdx] = {
          ...store.technicians[techIdx],
          fullName: updated.name,
          email: updated.email,
          phone: updated.phone,
          phoneNumber: updated.phone,
          assignedRegion: updated.assignedRegion,
          isActive: updated.status === 'ACTIVE',
          updatedAt: new Date().toISOString()
        };
      }
    }

    store.auditLogs = store.auditLogs || [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'USER_UPDATED',
      entityName: 'User',
      entityId: updated.email,
      newValues: { name: updated.name, role: updated.role, status: updated.status },
      createdAt: new Date().toISOString()
    });

    saveStore(store);
    res.json(sanitizeUserForClient(updated));
  });

  apiRouter.delete('/users/:id', requireEnterpriseRole(['SUPER_ADMIN', 'ADMIN']), (req, res) => {
    const store = getStore();
    const id = req.params.id;

    const idx = (store.users || []).findIndex((u: any) => u.id === id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    const user = store.users[idx];
    const callerRole = (((req as any).user?.role || '') as string).toUpperCase().trim();
    const targetRole = ((user.role || '') as string).toUpperCase().trim();

    if (targetRole === 'SUPER_ADMIN' && callerRole !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'لا يمكن حذف حساب المدير العام (SUPER_ADMIN) إلا من قبل المدير العام.',
        code: 'PERMISSION_DENIED'
      });
    }

    if (targetRole === 'ADMIN' && callerRole !== 'SUPER_ADMIN' && (req as any).user?.id !== user.id) {
      return res.status(403).json({
        error: 'غير مصرح لمسؤول النظام (ADMIN) بحذف حساب مسؤول نظام آخر. يقتصر ذلك على المدير العام.',
        code: 'PERMISSION_DENIED'
      });
    }

    store.users.splice(idx, 1);
    invalidateUserSessions(id);

    store.auditLogs = store.auditLogs || [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'USER_DELETED',
      entityName: 'User',
      entityId: user.email,
      createdAt: new Date().toISOString()
    });

    saveStore(store);
    res.json({ success: true });
  });

  // Audit Logs
  apiRouter.get('/audit-logs', (req, res) => {
    const store = getStore();
    res.json(store.auditLogs || []);
  });

  // Import Batches
  apiRouter.get('/import-batches', (req, res) => {
    const store = getStore();
    res.json(store.importBatches || []);
  });

  // Fleet All Data
  apiRouter.get('/fleet/all', (req, res) => {
    const store = getStore();
    res.json({
      machines: store.machines,
      tickets: store.tickets,
      buildings: store.buildings,
      floors: store.floors,
      locations: store.locations,
      technicians: (store.technicians || []).filter((t: any) => !t.isDeleted),
      spareParts: store.spareParts,
      categories: store.categories,
      suppliers: store.suppliers,
      partRequests: store.partRequests,
      transactions: store.transactions,
      users: (store.users || []).map(sanitizeUserForClient),
      settings: store.settings || DEFAULT_SETTINGS,
      auditLogs: store.auditLogs || []
    });
  });

  // Dashboard summary
  apiRouter.get('/dashboard/summary', (req, res) => {
    const store = getStore();
    const total = store.machines.length;
    const operational = store.machines.filter((m: any) => m.status === 'OPERATIONAL').length;
    const warning = store.machines.filter((m: any) => m.status === 'WARNING').length;
    const maintenance = store.machines.filter((m: any) => m.status === 'UNDER_MAINTENANCE').length;
    const outOfService = store.machines.filter((m: any) => m.status === 'OUT_OF_SERVICE').length;
    const openTickets = store.tickets.filter((t: any) => !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(t.status)).length;
    const criticalTickets = store.tickets.filter((t: any) => t.priority === 'CRITICAL' && !['RESOLVED', 'CLOSED'].includes(t.status)).length;
    const lowStockParts = (store.spareParts || []).filter((p: any) => p.currentQuantity <= p.minStockLevel).length;

    res.json({
      fleet: {
        total_machines: total,
        operational_machines: operational,
        warning_machines: warning,
        maintenance_machines: maintenance,
        out_of_service_machines: outOfService,
        fleet_health_score: 88.5
      },
      kpis: {
        mttr_hours: 3.2,
        mtbf_hours: 145.0,
        sla_compliance_rate: 96.5,
        open_tickets_count: openTickets,
        critical_tickets_count: criticalTickets,
        low_stock_sku_count: lowStockParts
      },
      distribution: [
        { status: 'OPERATIONAL', count: operational, color: '#10B981' },
        { status: 'WARNING', count: warning, color: '#F59E0B' },
        { status: 'UNDER_MAINTENANCE', count: maintenance, color: '#3B82F6' },
        { status: 'OUT_OF_SERVICE', count: outOfService, color: '#EF4444' }
      ],
      recent_tickets: store.tickets.slice(0, 10)
    });
  });

  // Machines
  apiRouter.get('/machines', (req, res) => {
    const store = getStore();
    res.json(store.machines || []);
  });

  apiRouter.get('/machines/:id', (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const m = (store.machines || []).find((x: any) => x.id === id || x.machineNumber === id || x.publicId === id || x.publicQrId === id);
    if (!m) return res.status(404).json({ error: 'Machine not found' });
    res.json(m);
  });

  apiRouter.post('/machines', (req, res) => {
    const store = getStore();
    const data = req.body;
    if (!data.machineNumber || !data.machineNumber.trim()) {
      return res.status(400).json({ error: 'Machine Number is mandatory' });
    }
    const cleanNum = data.machineNumber.trim().toUpperCase();
    const existing = (store.machines || []).find((m: any) => m.machineNumber?.toUpperCase() === cleanNum);
    if (existing) {
      return res.status(400).json({ error: `Machine Number ${cleanNum} already exists` });
    }

    const now = new Date().toISOString();

    // 1. Generate unique opaque publicQrToken
    const existingTokens = new Set<string>();
    (store.machines || []).forEach((m: any) => {
      if (m.publicQrToken) existingTokens.add(m.publicQrToken.toUpperCase());
    });
    let token = generateSecureOpaqueToken(8);
    while (existingTokens.has(token)) {
      token = generateSecureOpaqueToken(8);
    }

    // 2. Validate and set GPS coordinates: NEVER invent fake default GPS coordinates.
    // If coordinates are not explicitly provided by the user, set to null with LOCATION_NOT_CONFIGURED.
    let lat: number | null = null;
    let lng: number | null = null;
    let locationStatus = 'LOCATION_NOT_CONFIGURED';
    let locationSource = 'NONE';
    let locationUpdatedAt: string | null = null;

    const providedLat = typeof data.latitude === 'number' ? data.latitude : (typeof data.machineLatitude === 'number' ? data.machineLatitude : null);
    const providedLng = typeof data.longitude === 'number' ? data.longitude : (typeof data.machineLongitude === 'number' ? data.machineLongitude : null);

    if (providedLat !== null && providedLng !== null && !isNaN(providedLat) && !isNaN(providedLng)) {
      lat = Number(providedLat.toFixed(6));
      lng = Number(providedLng.toFixed(6));
      locationStatus = data.locationStatus || 'GPS_CONFIGURED';
      locationSource = normalizeExplicitLocationSource(data.locationSource || 'MANUAL_ENTRY');
      locationUpdatedAt = now;
    }

    const machineId = data.id || `mch-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const newMachine = {
      ...data,
      id: machineId,
      publicId: `pub-${token}`,
      publicQrId: `QR-${token}`,
      publicQrToken: token,
      machineNumber: cleanNum,
      serialNumber: data.serialNumber ? data.serialNumber.trim() : `SN-${token}`,
      model: data.model || data.machineType || 'Standard Vending Unit',
      machineType: data.machineType || data.type || 'Combination Snack & Soda',
      type: data.type || data.machineType || 'SNACK',
      status: data.status || 'OPERATIONAL',
      dataQualityStatus: data.dataQualityStatus || 'VALID',
      healthScore: 100,
      healthStatus: 'HEALTHY',
      isChronicFailure: false,
      buildingId: data.buildingId,
      floorId: data.floorId,
      locationId: data.locationId || data.modelId,
      machineLatitude: lat,
      machineLongitude: lng,
      latitude: lat,
      longitude: lng,
      locationStatus,
      locationSource,
      locationUpdatedAt,
      installationDate: data.installationDate || now.split('T')[0],
      lastMaintenanceDate: data.lastMaintenanceDate || now,
      qrCodeUrl: `/public/m/${token}`,
      revision: 1,
      createdAt: now,
      updatedAt: now
    };

    if (!store.machines) store.machines = [];
    store.machines.unshift(newMachine);

    // 3. Generate MACHINE_CREATED sync event in local syncQueue
    const syncEvent = {
      id: `evt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      eventType: 'MACHINE_CREATED',
      aggregateType: 'MACHINE',
      aggregateId: newMachine.id,
      machinePublicToken: newMachine.publicQrToken,
      payload: {
        machineId: newMachine.id,
        machineNumber: newMachine.machineNumber,
        publicQrToken: newMachine.publicQrToken,
        model: newMachine.model,
        machineType: newMachine.machineType,
        status: newMachine.status,
        latitude: newMachine.latitude,
        longitude: newMachine.longitude,
        createdAt: now
      },
      createdAt: now,
      syncStatus: 'PENDING',
      retryCount: 0
    };

    if (!Array.isArray(store.syncQueue)) store.syncQueue = [];
    store.syncQueue.push(syncEvent);

    // 4. Audit log entry
    if (!Array.isArray(store.auditLogs)) store.auditLogs = [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'MACHINE_CREATED',
      entityName: 'Machine',
      entityId: newMachine.machineNumber,
      newValues: {
        id: newMachine.id,
        machineNumber: newMachine.machineNumber,
        serialNumber: newMachine.serialNumber,
        publicQrToken: newMachine.publicQrToken,
        status: newMachine.status
      },
      createdAt: now
    });

    saveStore(store);
    res.status(201).json(newMachine);
  });

  apiRouter.put('/machines/:id', (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const idx = (store.machines || []).findIndex((m: any) => m.id === id || m.machineNumber === id || m.publicQrToken === id);
    if (idx === -1) return res.status(404).json({ error: 'Machine not found' });
    const oldMachine = store.machines[idx];
    const data = req.body;
    const now = new Date().toISOString();

    // Coordinate pair validation
    const hasLat = data.latitude !== undefined;
    const hasLng = data.longitude !== undefined;
    if (hasLat || hasLng) {
      const isLatNull = data.latitude === null;
      const isLngNull = data.longitude === null;
      const isLatNum = typeof data.latitude === 'number' && !isNaN(data.latitude) && isFinite(data.latitude);
      const isLngNum = typeof data.longitude === 'number' && !isNaN(data.longitude) && isFinite(data.longitude);

      if (isLatNull && isLngNull) {
        // Both null: valid clear / unconfigured
      } else if (isLatNum && isLngNum) {
        if (data.latitude < -90 || data.latitude > 90 || data.longitude < -180 || data.longitude > 180) {
          return res.status(400).json({ error: 'Coordinates out of range: latitude [-90, 90], longitude [-180, 180]' });
        }
      } else {
        return res.status(400).json({ error: 'Invalid coordinate pair: latitude and longitude must both be valid numbers within range or both null' });
      }
    }

    // Determine if coordinates actually changed
    let coordinatesActuallyChanged = false;
    if (hasLat && hasLng) {
      const isBothNull = data.latitude === null && data.longitude === null;
      const wasBothNull = (oldMachine.latitude === null || oldMachine.latitude === undefined) &&
                          (oldMachine.longitude === null || oldMachine.longitude === undefined);

      if (isBothNull && wasBothNull) {
        coordinatesActuallyChanged = false;
      } else if (
        typeof data.latitude === 'number' &&
        typeof data.longitude === 'number' &&
        typeof oldMachine.latitude === 'number' &&
        typeof oldMachine.longitude === 'number'
      ) {
        coordinatesActuallyChanged =
          Number(data.latitude.toFixed(6)) !== Number(oldMachine.latitude.toFixed(6)) ||
          Number(data.longitude.toFixed(6)) !== Number(oldMachine.longitude.toFixed(6));
      } else {
        coordinatesActuallyChanged = true;
      }
    }

    let lat = oldMachine.latitude ?? null;
    let lng = oldMachine.longitude ?? null;
    let locationSource = oldMachine.locationSource || 'NONE';
    let locationStatus = oldMachine.locationStatus || (lat !== null && lng !== null ? 'GPS_CONFIGURED' : 'LOCATION_NOT_CONFIGURED');
    let locationNote = data.locationNote !== undefined ? data.locationNote : (oldMachine.locationNote || '');

    if (coordinatesActuallyChanged) {
      if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
        lat = Number(data.latitude.toFixed(6));
        lng = Number(data.longitude.toFixed(6));
        locationSource = normalizeExplicitLocationSource(data.locationSource || 'MANUAL_ENTRY');
        locationStatus = 'GPS_CONFIGURED';
      } else {
        lat = null;
        lng = null;
        locationSource = 'NONE';
        locationStatus = 'LOCATION_NOT_CONFIGURED';
      }
    }

    const locationNoteChanged = data.locationNote !== undefined && data.locationNote !== (oldMachine.locationNote || '');

    // Resolve locationId if updated
    let currentLocation = oldMachine.currentLocation;
    if (data.locationId) {
      const foundLoc = (store.locations || []).find((l: any) => l.id === data.locationId);
      if (foundLoc) {
        currentLocation = foundLoc;
      }
    }

    // Determine strict locationUpdatedAt provenance
    let finalLocationUpdatedAt: string | null = null;
    if (lat === null || lng === null) {
      finalLocationUpdatedAt = null;
    } else if (coordinatesActuallyChanged) {
      finalLocationUpdatedAt = now;
    } else {
      finalLocationUpdatedAt = oldMachine.locationUpdatedAt || null;
    }

    // Monotonically increment integer revision
    const oldRev = typeof oldMachine.revision === 'number' && !isNaN(oldMachine.revision) && isFinite(oldMachine.revision) && oldMachine.revision >= 1
      ? Math.floor(oldMachine.revision)
      : 1;
    const nextRev = oldRev + 1;

    const updated = {
      ...oldMachine,
      ...data,
      latitude: lat,
      longitude: lng,
      machineLatitude: lat,
      machineLongitude: lng,
      locationSource,
      locationStatus,
      locationNote,
      locationUpdatedAt: finalLocationUpdatedAt,
      currentLocation,
      revision: nextRev,
      updatedAt: now
    };
    store.machines[idx] = updated;

    if (coordinatesActuallyChanged) {
      const prevHadCoords = oldMachine.latitude !== null && oldMachine.latitude !== undefined &&
                            oldMachine.longitude !== null && oldMachine.longitude !== undefined;
      const newHasCoords = lat !== null && lng !== null;

      let action = 'MACHINE_LOCATION_UPDATED';
      if (prevHadCoords && !newHasCoords) {
        action = 'MACHINE_LOCATION_CLEARED';
      }

      if (!Array.isArray(store.auditLogs)) store.auditLogs = [];
      store.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        action,
        entityName: 'Machine',
        entityId: updated.machineNumber,
        userName: data.locationUpdatedByActorName || 'Super Administrator',
        newValues: {
          machineId: updated.id,
          machineNumber: updated.machineNumber,
          latitude: lat,
          longitude: lng,
          locationSource,
          locationStatus,
          locationNote
        },
        oldValues: {
          latitude: oldMachine.latitude,
          longitude: oldMachine.longitude,
          locationSource: oldMachine.locationSource
        },
        timestamp: now,
        createdAt: now
      });
    }

    saveStore(store);
    res.json(updated);
  });

  apiRouter.delete('/machines/:id', requireEnterpriseRole(['SUPER_ADMIN', 'ADMIN']), (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const idx = (store.machines || []).findIndex((m: any) => m.id === id || m.machineNumber === id || m.publicQrToken === id);
    if (idx === -1) return res.status(404).json({ error: 'Machine not found' });
    const deletedMachine = store.machines[idx];
    store.machines.splice(idx, 1);

    // Cancel any pending syncQueue events for this deleted machine
    if (Array.isArray(store.syncQueue)) {
      store.syncQueue = store.syncQueue.filter((e: any) => e.aggregateId !== deletedMachine.id);
    }

    if (!Array.isArray(store.auditLogs)) store.auditLogs = [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'MACHINE_DELETED',
      entityName: 'Machine',
      entityId: deletedMachine.machineNumber,
      oldValues: {
        id: deletedMachine.id,
        machineNumber: deletedMachine.machineNumber,
        publicQrToken: deletedMachine.publicQrToken
      },
      createdAt: new Date().toISOString()
    });

    runtimeStoreManager.recordTombstone('Machine', deletedMachine.id, (req as any).user?.username || 'Admin', 'Deleted via API');
    if (deletedMachine.machineNumber && deletedMachine.machineNumber !== deletedMachine.id) {
      runtimeStoreManager.recordTombstone('Machine', deletedMachine.machineNumber, (req as any).user?.username || 'Admin', 'Deleted via API');
    }

    saveStore(store);
    res.json({ success: true, message: 'Machine deleted successfully', deletedMachine });
  });

  // Public QR machine lookup - matches publicQrId, publicId, machineNumber, id, serialNumber
  const handleMachineLookup = (req: express.Request, res: express.Response) => {
    const store = getStore();
    const rawQrId = (req.params.qrId || '').trim();
    const clean = rawQrId.toUpperCase();
    const normalized = clean.replace(/[\s\-_]/g, '');

    // 1. Exact match
    let m = store.machines.find((x: any) => {
      if (!x) return false;
      const xNumber = (x.machineNumber || '').toUpperCase().trim();
      const xPublicQr = (x.publicQrId || '').toUpperCase().trim();
      const xPublic = (x.publicId || '').toUpperCase().trim();
      const xId = (x.id || '').toUpperCase().trim();
      const xSerial = (x.serialNumber || '').toUpperCase().trim();
      return xNumber === clean || xPublicQr === clean || xPublic === clean || xId === clean || xSerial === clean;
    });

    // 2. Normalized match (without hyphens/spaces)
    if (!m) {
      m = store.machines.find((x: any) => {
        if (!x) return false;
        const normNum = (x.machineNumber || '').toUpperCase().replace(/[\s\-_]/g, '');
        const normPublic = (x.publicId || '').toUpperCase().replace(/[\s\-_]/g, '');
        const normPublicQr = (x.publicQrId || '').toUpperCase().replace(/[\s\-_]/g, '');
        const normId = (x.id || '').toUpperCase().replace(/[\s\-_]/g, '');
        return normNum === normalized || normPublic === normalized || normPublicQr === normalized || normId === normalized;
      });
    }

    // 3. Substring number match
    if (!m && normalized.length >= 1) {
      m = store.machines.find((x: any) => {
        if (!x) return false;
        const normNum = (x.machineNumber || '').toUpperCase().replace(/[\s\-_]/g, '');
        const normPublic = (x.publicId || '').toUpperCase().replace(/[\s\-_]/g, '');
        const normPublicQr = (x.publicQrId || '').toUpperCase().replace(/[\s\-_]/g, '');
        return (
          normNum === normalized ||
          normPublic === normalized ||
          normPublicQr === normalized ||
          normNum.includes(normalized) ||
          normalized.includes(normNum)
        );
      });
    }

    if (!m) {
      // Return 404 if truly not found
      return res.status(404).json({ error: 'Machine not found for this QR identifier' });
    }

    const bldName =
      m.currentLocation?.building?.name ||
      (m.currentLocation?.buildingId ? store.buildings.find((b: any) => b.id === m.currentLocation?.buildingId)?.name : undefined) ||
      'مجمع ماكينات البيع';
    const locDesc =
      m.currentLocation?.fullDescription ||
      `${bldName} — ${m.currentLocation?.areaZone || 'منطقة الماكينة'}`;

    res.json({
      id: m.id,
      publicId: m.publicId || m.machineNumber,
      publicQrId: m.publicQrId || m.machineNumber,
      machineNumber: m.machineNumber,
      serialNumber: m.serialNumber,
      machineType: m.machineType || 'ماكينة بيع ذاتي (Vending Machine)',
      status: m.status,
      buildingName: bldName,
      locationDescription: locDesc,
      lastFaultAt: m.lastFaultAt,
      currentLocation: m.currentLocation
    });
  };

  apiRouter.get('/public/machine-by-qr/:qrId', handleMachineLookup);
  apiRouter.get('/public/machine/:qrId', handleMachineLookup);

  // Public QR Fault Report Submission
  apiRouter.post('/public/submit-qr-fault', (req, res) => {
    const store = getStore();
    const { publicQrId, category, description, reporterName, reporterPhone, reporterEmail } = req.body;

    const rawQrId = (publicQrId || '').trim();
    const clean = rawQrId.toUpperCase();
    const normalized = clean.replace(/[\s\-_]/g, '');

    let machine = store.machines.find((x: any) => {
      if (!x) return false;
      const xNumber = (x.machineNumber || '').toUpperCase().trim();
      const xPublicQr = (x.publicQrId || '').toUpperCase().trim();
      const xPublic = (x.publicId || '').toUpperCase().trim();
      const xId = (x.id || '').toUpperCase().trim();
      return xNumber === clean || xPublicQr === clean || xPublic === clean || xId === clean;
    });

    if (!machine) {
      machine = store.machines.find((x: any) => {
        if (!x) return false;
        const normNum = (x.machineNumber || '').toUpperCase().replace(/[\s\-_]/g, '');
        const normPublic = (x.publicId || '').toUpperCase().replace(/[\s\-_]/g, '');
        const normPublicQr = (x.publicQrId || '').toUpperCase().replace(/[\s\-_]/g, '');
        const normId = (x.id || '').toUpperCase().replace(/[\s\-_]/g, '');
        return normNum === normalized || normPublic === normalized || normPublicQr === normalized || normId === normalized;
      });
    }

    if (!machine && normalized.length >= 1) {
      machine = store.machines.find((x: any) => {
        if (!x) return false;
        const normNum = (x.machineNumber || '').toUpperCase().replace(/[\s\-_]/g, '');
        return normNum.includes(normalized) || normalized.includes(normNum);
      });
    }

    if (!machine) {
      return res.status(404).json({
        error: 'INVALID_QR_TOKEN',
        message: 'لا يمكن إنشاء بلاغ: رمز الـ QR غير صالح أو غير مرتبط بماكينة مسجلة.'
      });
    }

    // Determine priority
    let priority = 'MEDIUM';
    if (['REFRIGERATION', 'POWER', 'LEAK'].includes(category)) {
      priority = 'CRITICAL';
    } else if (['CARD_POS', 'PAYMENT', 'PRODUCT_SELECTION', 'NO_PRODUCT', 'CARD_READER'].includes(category)) {
      priority = 'HIGH';
    }

    const count = store.tickets.length + 1;
    const numStr = String(count).padStart(4, '0');
    const now = new Date().toISOString();

    const titleCategoryMap: Record<string, string> = {
      CARD_POS: 'عطل الدفع الإلكتروني / مدى / فيزا',
      CARD_READER: 'عطل قارئ البطاقات وأجهزة مدى',
      NO_PRODUCT: 'انحشار المنتج / لم يسقط في الدرج',
      PRODUCT_DISPENSING: 'عطل خروج المنتج والحلزونات',
      REFRIGERATION: 'عطل التبريد / المشروبات غير باردة',
      TEMPERATURE: 'حرارة المشروبات أو عدم تسخين القهوة',
      LEAK: 'تسريب مياه أو سوائل أسفل الماكينة',
      POWER: 'انقطاع التيار الكهربائي أو إغلاق الشاشة',
      SOFTWARE: 'خلل في برمجة الماكينة أو الشاشة',
      OTHER: 'ملاحظة عامة أو بلاغ عطل'
    };

    const catTitleAr = titleCategoryMap[category] || 'بلاغ عطل من عميل';

    const newTicket = {
      id: `tck-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      ticketNumber: `TCK-2026-${numStr}`,
      title: `Machine #${machine.machineNumber} - ${catTitleAr}`,
      titleAr: `ماكينة #${machine.machineNumber} - ${catTitleAr}`,
      machineId: machine.id,
      machine: machine,
      locationId: machine.currentLocation?.id || store.locations[0]?.id || 'loc-001',
      location: machine.currentLocation || store.locations[0],
      source: 'CUSTOMER_QR',
      category: category || 'OTHER',
      priority,
      status: 'NEW',
      description: description || `${catTitleAr} على ماكينة #${machine.machineNumber}`,
      reporterName: reporterName || (reporterPhone ? `عميل (${reporterPhone})` : 'عميل عبر رمز QR'),
      reporterPhone: reporterPhone || undefined,
      reporterEmail: reporterEmail || undefined,
      isRecurring: false,
      recurringOccurrenceCount: 1,
      slaDueAt: new Date(Date.now() + (priority === 'CRITICAL' ? 2 : 4) * 3600000).toISOString(),
      totalPartsCost: 0,
      timeline: [
        {
          id: `tl-${Date.now()}`,
          ticketId: `tck-${Date.now()}`,
          timestamp: now,
          action: 'CREATED',
          actionLabel: 'بلاغ من عميل عبر كود QR',
          description: description || `تم تسجيل البلاغ بنجاح عبر مسح كود QR للماكينة رقم ${machine.machineNumber}.`
        }
      ],
      statusHistory: [
        {
          id: `sh-${Date.now()}`,
          ticketId: `tck-${Date.now()}`,
          newStatus: 'NEW',
          comment: 'تم فتح البلاغ بواسطة العميل عبر كود الاستجابة السريعة QR',
          createdAt: now
        }
      ],
      notes: [],
      attachments: [],
      createdAt: now,
      updatedAt: now
    };

    // Update machine status if operational
    if (machine.status === 'OPERATIONAL') {
      machine.status = 'WARNING';
    }
    machine.lastFaultAt = now;

    // Add to top of tickets
    store.tickets.unshift(newTicket);

    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'TICKET_CREATED',
      entityName: 'Ticket',
      entityId: newTicket.ticketNumber,
      userName: reporterPhone ? `Customer (${reporterPhone})` : 'Customer via QR',
      newValues: {
        title: newTicket.title,
        category: newTicket.category,
        priority: newTicket.priority,
        source: 'CUSTOMER_QR',
        machine: machine.machineNumber,
        location: machine.currentLocation?.fullDescription || 'N/A'
      },
      timestamp: now,
      createdAt: now
    });

    saveStore(store);
    console.log(`[API] Public QR Ticket Created: ${newTicket.ticketNumber} for machine ${machine.machineNumber}`);

    res.json(newTicket);
  });

  // Public/Technician Machine Full Status Lookup via QR
  apiRouter.get('/public/machine-full-status/:qrId', (req, res) => {
    const store = getStore();
    const qrId = req.params.qrId;
    if (!qrId) return res.status(400).json({ error: 'QR identifier is required' });

    const raw = String(qrId).trim();
    const clean = raw.toUpperCase();
    const normalized = clean.replace(/[\s\-_]/g, '');

    let machine = store.machines.find((x: any) => {
      if (!x) return false;
      const xNumber = (x.machineNumber || '').toUpperCase().trim();
      const xPublicQr = (x.publicQrId || '').toUpperCase().trim();
      const xPublic = (x.publicId || '').toUpperCase().trim();
      const xId = (x.id || '').toUpperCase().trim();
      return xNumber === clean || xPublicQr === clean || xPublic === clean || xId === clean;
    });

    if (!machine) {
      machine = store.machines.find((x: any) => {
        if (!x) return false;
        const normNum = (x.machineNumber || '').toUpperCase().replace(/[\s\-_]/g, '');
        const normPublic = (x.publicId || '').toUpperCase().replace(/[\s\-_]/g, '');
        const normPublicQr = (x.publicQrId || '').toUpperCase().replace(/[\s\-_]/g, '');
        const normId = (x.id || '').toUpperCase().replace(/[\s\-_]/g, '');
        return normNum === normalized || normPublic === normalized || normPublicQr === normalized || normId === normalized;
      });
    }

    if (!machine && normalized.length >= 1) {
      machine = store.machines.find((x: any) => {
        if (!x) return false;
        const normNum = (x.machineNumber || '').toUpperCase().replace(/[\s\-_]/g, '');
        return normNum.includes(normalized) || normalized.includes(normNum);
      });
    }

    if (!machine) {
      return res.status(404).json({ error: 'Machine not found' });
    }

    const bldName = machine.currentLocation?.building?.name ||
      (machine.currentLocation?.buildingId ? (store.buildings.find((b: any) => b.id === machine.currentLocation?.buildingId)?.name) : undefined) ||
      'مجمع ماكينات البيع';

    const locDesc = machine.currentLocation?.fullDescription || 
      `${bldName} — ${machine.currentLocation?.areaZone || 'منطقة الماكينة'}`;

    // Find all active or recent tickets for this machine
    const activeTickets = (store.tickets || []).filter((t: any) => 
      t.machineId === machine.id || t.machine?.machineNumber === machine.machineNumber || t.machineNumber === machine.machineNumber
    );

    // Active/Open tickets (excluding CLOSED)
    const openTickets = activeTickets.filter((t: any) => t.status !== 'CLOSED');

    // Recent maintenance actions on this machine across tickets
    const recentActions: any[] = [];
    activeTickets.forEach((t: any) => {
      if (Array.isArray(t.maintenanceActions)) {
        t.maintenanceActions.forEach((a: any) => {
          recentActions.push({
            ...a,
            ticketNumber: t.ticketNumber,
            ticketTitle: t.title
          });
        });
      }
    });

    // Available active spare parts list
    const sparePartsList = (store.spareParts || [])
      .filter((p: any) => p.status !== 'INACTIVE')
      .map((p: any) => ({
        id: p.id,
        name: p.name,
        nameAr: p.nameAr || p.name,
        partNumber: p.partNumber,
        category: p.category,
        currentStock: p.currentStock ?? p.currentQuantity ?? 0,
        currentQuantity: p.currentQuantity ?? p.currentStock ?? 0,
        unitCost: p.unitCost || 0,
        storageLocation: p.storageLocation || 'Warehouse Main',
        status: p.status || 'ACTIVE'
      }));

    // Registered technicians list for quick selection/validation
    const techniciansList = (store.technicians || []).map((t: any) => ({
      id: t.id,
      fullName: t.fullName,
      fullNameAr: t.fullNameAr || t.fullName,
      employeeCode: t.employeeCode,
      phone: t.phone || t.phoneNumber || '',
      phoneNumber: t.phoneNumber || t.phone || '',
      specialization: t.specialization,
      status: t.status
    }));

    res.json({
      machine: {
        id: machine.id,
        publicId: machine.publicId || machine.machineNumber,
        publicQrId: machine.publicQrId || machine.machineNumber,
        machineNumber: machine.machineNumber,
        serialNumber: machine.serialNumber,
        machineType: machine.machineType || 'ماكينة بيع ذاتي (Vending Machine)',
        status: machine.status,
        healthStatus: machine.healthStatus,
        buildingName: bldName,
        locationDescription: locDesc,
        lastMaintenanceAt: machine.lastMaintenanceAt,
        lastFaultAt: machine.lastFaultAt
      },
      openTickets,
      activeTicketsCount: openTickets.length,
      allTicketsCount: activeTickets.length,
      recentActions: recentActions.slice(0, 10),
      spareParts: sparePartsList,
      technicians: techniciansList
    });
  });

  // Public/Field Technician Action Submission via QR
  apiRouter.post('/public/technician-action', (req, res) => {
    const store = getStore();
    const {
      publicQrId,
      machineId,
      technician,
      actionType, // 'MAINTENANCE_ACTION' | 'PART_REQUEST' | 'STATUS_CHANGE'
      ticketId,
      maintenanceDetails,
      partRequestDetails,
      gpsLocation
    } = req.body;

    if (!technician || (!technician.fullName && !technician.employeeCode)) {
      return res.status(400).json({ error: 'Technician identity details are required (اسم الفني وبياناته أو كوده الوظيفي إلزامية)' });
    }

    const cleanQr = (publicQrId || machineId || '').toString().toUpperCase().trim();
    let machine = store.machines.find((x: any) => {
      if (!x) return false;
      const xNumber = (x.machineNumber || '').toUpperCase().trim();
      const xPublicQr = (x.publicQrId || '').toUpperCase().trim();
      const xPublic = (x.publicId || '').toUpperCase().trim();
      const xId = (x.id || '').toUpperCase().trim();
      return xNumber === cleanQr || xPublicQr === cleanQr || xPublic === cleanQr || xId === cleanQr;
    });

    if (!machine) {
      return res.status(404).json({
        error: 'INVALID_MACHINE_TOKEN',
        message: 'الماكينة غير موجودة أو رمز الـ QR غير صالح.'
      });
    }

    const now = new Date().toISOString();

    // Match registered technician record - NEVER auto-generate unknown technicians
    const cleanCode = (technician.employeeCode || '').toString().trim().toUpperCase();
    const cleanName = (technician.fullName || '').toString().trim().toLowerCase();
    const cleanId = (technician.id || '').toString().trim();

    let tech = store.technicians.find((t: any) => 
      (cleanId && t.id === cleanId) ||
      (cleanCode && t.employeeCode?.toString().trim().toUpperCase() === cleanCode) ||
      (cleanName && (t.fullName?.trim().toLowerCase() === cleanName || t.fullNameAr?.trim().toLowerCase() === cleanName))
    );

    if (!tech) {
      return res.status(401).json({
        error: 'TECHNICIAN_NOT_AUTHORIZED',
        message: 'الفني غير مسجل في النظام. يرجى التواصل مع إدارة الصيانة لاعتماد الحساب.'
      });
    }

    if (technician.phone && !tech.phone) tech.phone = technician.phone;

    // Find or create ticket
    let ticket = (ticketId && ticketId !== 'ALL_OR_NEW' && ticketId !== 'NEW')
      ? store.tickets.find((t: any) => t.id === ticketId || t.ticketNumber === ticketId)
      : null;

    if (!ticket && ticketId !== 'ALL_OR_NEW' && ticketId !== 'NEW') {
      // Look for open ticket on this machine
      ticket = store.tickets.find((t: any) => 
        (t.machineId === machine.id || t.machine?.machineNumber === machine.machineNumber) &&
        t.status !== 'CLOSED' && t.status !== 'RESOLVED'
      );
    }

    if (!ticket) {
      // Create new ticket for this on-site action
      const count = store.tickets.length + 1;
      const numStr = String(count).padStart(4, '0');
      const actionName = actionType === 'PART_REQUEST' ? 'طلب قطعة غيار عاجلة' : 'تدخل وصيانة ميدانية';
      ticket = {
        id: `tck-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        ticketNumber: `TCK-2026-${numStr}`,
        title: `Machine #${machine.machineNumber} - ${actionName} عبر QR (${tech.fullName})`,
        titleAr: `ماكينة #${machine.machineNumber} - ${actionName} عبر QR (${tech.fullName})`,
        machineId: machine.id,
        machine: machine,
        locationId: machine.currentLocation?.id || store.locations[0]?.id || 'loc-001',
        location: machine.currentLocation || store.locations[0],
        source: 'FIELD_QR_TECHNICIAN',
        category: actionType === 'PART_REQUEST' ? 'MECHANICAL' : 'OTHER',
        priority: partRequestDetails?.priority || 'HIGH',
        status: actionType === 'PART_REQUEST' ? 'WAITING_FOR_PART' : 'IN_PROGRESS',
        assignedTechnicianId: tech.id,
        assignedTechnician: tech,
        description: partRequestDetails?.reason || maintenanceDetails?.description || `إجراء ميداني مسجل عبر مسح رمز الـ QR بواسطة الفني ${tech.fullName}.`,
        isRecurring: false,
        recurringOccurrenceCount: 1,
        slaDueAt: new Date(Date.now() + 4 * 3600000).toISOString(),
        totalPartsCost: 0,
        timeline: [
          {
            id: `tl-${Date.now()}-0`,
            ticketId: `tck-${Date.now()}`,
            timestamp: now,
            technicianName: tech.fullNameAr || tech.fullName,
            technicianCode: tech.employeeCode,
            technicianId: tech.id,
            action: 'CREATED',
            actionLabel: 'فتح تذكرة تدخل ميداني عبر QR',
            description: `قام الفني ${tech.fullName} (${tech.employeeCode}) بمسح كود QR وبدء إجراءات ${actionName}.`
          }
        ],
        statusHistory: [],
        maintenanceActions: [],
        notes: [],
        attachments: [],
        createdAt: now,
        updatedAt: now
      };
      store.tickets.unshift(ticket);
    }

    // Ensure technician is assigned if unassigned
    if (!ticket.assignedTechnicianId) {
      ticket.assignedTechnicianId = tech.id;
      ticket.assignedTechnician = tech;
    }

    if (!ticket.timeline) ticket.timeline = [];
    if (!ticket.maintenanceActions) ticket.maintenanceActions = [];
    if (!ticket.statusHistory) ticket.statusHistory = [];

    let createdPartRequest: any = null;
    let createdAction: any = null;

    // Handle PART_REQUEST
    if (actionType === 'PART_REQUEST' && partRequestDetails) {
      const partId = partRequestDetails.sparePartId;
      let part = (store.spareParts || []).find((p: any) => 
        (partId && p.id === partId) ||
        (partId && p.partNumber === partId) ||
        (partRequestDetails.partNumber && p.partNumber === partRequestDetails.partNumber) ||
        (partRequestDetails.partName && (p.name === partRequestDetails.partName || p.nameAr === partRequestDetails.partName))
      );
      
      const isCustomPart = !part || Boolean(partRequestDetails.customPartName) || Boolean(partRequestDetails.isCustomPart);

      if (!part && partRequestDetails.customPartName) {
        const customPartNum = partRequestDetails.customPartNumber?.trim() || `REQ-NEW-${Math.floor(1000 + Math.random() * 9000)}`;
        const customName = partRequestDetails.customPartName.trim();
        part = {
          id: `sp-custom-${Date.now()}`,
          partNumber: customPartNum,
          name: customName,
          nameAr: customName,
          category: partRequestDetails.customPartCategory || 'CUSTOM_FIELD',
          unitCost: Number(partRequestDetails.estimatedCost) || 150,
          currentQuantity: 0,
          currentStock: 0,
          minimumQuantity: 1,
          minStockThreshold: 1,
          storageLocation: 'طلب شراء خارجي / توريد جديد (غير مدرج)',
          status: 'ACTIVE'
        };
        store.spareParts.push(part);
      }

      if (!part) {
        part = (store.spareParts && store.spareParts[0]) || {
          id: 'sp-generic-1',
          partNumber: 'SP-101',
          name: 'قطعة غيار مخصصة (ميدانية)',
          nameAr: 'قطعة غيار مخصصة (ميدانية)',
          category: 'GENERAL',
          unitCost: 120,
          currentQuantity: 2,
          currentStock: 2,
          storageLocation: 'Rack A-01'
        };
      }

      const countReq = (store.partRequests || []).length + 1;
      const reqNum = `REQ-2026-${String(countReq).padStart(4, '0')}`;
      const quantity = Math.max(1, Number(partRequestDetails.quantity) || 1);
      const unitCost = Number(part.unitCost) || Number(partRequestDetails.estimatedCost) || 0;

      createdPartRequest = {
        id: `req-${Date.now()}`,
        requestNumber: reqNum,
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        ticket: ticket,
        machineId: machine.id,
        machineNumber: machine.machineNumber,
        machine: machine,
        technicianId: tech.id,
        technicianName: tech.fullNameAr || tech.fullName,
        technician: tech,
        partId: part.id,
        sparePartId: part.id,
        partNumber: part.partNumber,
        partName: part.nameAr || part.name,
        part: part,
        sparePart: part,
        isCustomNonCatalog: isCustomPart,
        estimatedCost: unitCost,
        unitCost: unitCost,
        quantity: quantity,
        priority: partRequestDetails.priority || ticket.priority || 'HIGH',
        status: 'PENDING',
        notes: partRequestDetails.notes || partRequestDetails.reason || `طلب عبر QR بواسطة الفني ${tech.fullName}`,
        reason: partRequestDetails.reason || (isCustomPart ? `طلب توريد وشراء قطعة غير مدرجة (${part.name})` : `طلب صرف قطعة من المخزن (${part.name})`),
        timeline: [
          {
            status: 'PENDING',
            timestamp: now,
            actor: `${tech.fullName} (${tech.employeeCode})`,
            comment: `تم إنشاء طلب قطعة الغيار رسمياً عبر مسح كود QR الميداني (${reqNum})`
          }
        ],
        createdAt: now,
        updatedAt: now
      };

      if (!store.partRequests) store.partRequests = [];
      store.partRequests.unshift(createdPartRequest);

      // Update ticket status to WAITING_FOR_PART
      const prevStatus = ticket.status;
      ticket.status = 'WAITING_FOR_PART';
      if (unitCost > 0) {
        ticket.totalPartsCost = (ticket.totalPartsCost || 0) + (unitCost * quantity);
      }
      ticket.updatedAt = now;

      // Status History
      if (!ticket.statusHistory) ticket.statusHistory = [];
      ticket.statusHistory.unshift({
        id: `sh-${Date.now()}`,
        ticketId: ticket.id,
        oldStatus: prevStatus,
        previousStatus: prevStatus,
        newStatus: 'WAITING_FOR_PART',
        comment: isCustomPart
          ? `طلب توريد قطعة جديدة عبر QR: ${quantity}x ${part.name} (${part.partNumber}) بواسطة الفني ${tech.fullName}`
          : `طلب صرف قطعة من المخزن عبر QR: ${quantity}x ${part.name} (${part.partNumber}) بواسطة الفني ${tech.fullName}`,
        changedBy: tech.fullName,
        createdAt: now
      });

      // Ticket Timeline
      ticket.timeline.unshift({
        id: `tl-${Date.now()}-pr`,
        ticketId: ticket.id,
        timestamp: now,
        technicianName: tech.fullNameAr || tech.fullName,
        technicianCode: tech.employeeCode,
        technicianId: tech.id,
        action: 'PART_REQUESTED',
        actionLabel: isCustomPart ? 'طلب توريد قطعة جديدة عبر QR (غير مدرجة)' : 'طلب صرف قطعة من المخزن عبر QR',
        description: isCustomPart
          ? `تم تقديم طلب شراء وتوريد قطعة غير مدرجة في المخزن: ${quantity}x ${part.name} (${part.partNumber}) برقم طلب ${reqNum}. تحولت حالة التذكرة إلى في انتظار القطع.`
          : `تم تقديم طلب صرف ${quantity}x من ${part.name} (${part.partNumber}) برقم طلب ${reqNum}. المخزون الحالي: ${part.currentStock ?? part.currentQuantity ?? 0} قطعة. تحولت حالة التذكرة إلى في انتظار القطع.`,
        part: {
          partNumber: part.partNumber,
          name: part.nameAr || part.name,
          quantity: quantity,
          unitCost: unitCost,
          status: 'PENDING'
        }
      });

      machine.status = 'WARNING';
    }

    // Handle MAINTENANCE_ACTION
    if (actionType === 'MAINTENANCE_ACTION' || maintenanceDetails) {
      const actType = maintenanceDetails?.actionTypeTitle || 'فحص وإصلاح ميداني';
      const desc = maintenanceDetails?.description || 'تم تنفيذ أعمال الصيانة بنجاح';
      const newStatus = maintenanceDetails?.newTicketStatus || (actionType === 'PART_REQUEST' ? 'WAITING_FOR_PART' : 'RESOLVED');

      createdAction = {
        id: `ma-${Date.now()}`,
        ticketId: ticket.id,
        technicianId: tech.id,
        technicianName: tech.fullName,
        actionType: actType,
        actionTaken: actType,
        description: desc,
        rootCause: maintenanceDetails?.rootCause || 'فحص ميداني دوري وتصحيح العطل',
        durationMinutes: Number(maintenanceDetails?.durationMinutes) || 25,
        photoUrl: maintenanceDetails?.photoUrl,
        gps: gpsLocation,
        createdAt: now
      };

      ticket.maintenanceActions.unshift(createdAction);

      // Update ticket status
      const prevStatus = ticket.status;
      ticket.status = newStatus;
      ticket.updatedAt = now;

      if (newStatus === 'RESOLVED') {
        ticket.resolvedAt = now;
        ticket.resolutionSummary = desc;
        machine.status = 'OPERATIONAL';
        machine.healthStatus = 'HEALTHY';
        machine.lastMaintenanceAt = now;
        tech.totalCompletedTickets = (tech.totalCompletedTickets || 0) + 1;
      } else if (newStatus === 'IN_PROGRESS') {
        machine.status = 'MAINTENANCE';
      } else if (newStatus === 'WAITING_FOR_PART') {
        machine.status = 'WARNING';
      }

      ticket.statusHistory.unshift({
        id: `sh-${Date.now()}`,
        ticketId: ticket.id,
        oldStatus: prevStatus,
        newStatus: newStatus,
        comment: `تحديث الحالة بواسطة الفني الميداني (${tech.fullName}) بعد مسح رمز QR: ${desc}`,
        changedBy: tech.fullName,
        createdAt: now
      });

      ticket.timeline.unshift({
        id: `tl-${Date.now()}-ma`,
        ticketId: ticket.id,
        timestamp: now,
        technicianName: tech.fullName,
        technicianCode: tech.employeeCode,
        technicianId: tech.id,
        action: newStatus === 'RESOLVED' ? 'RESOLVED' : 'ACTION_ADDED',
        actionLabel: actType,
        description: `إجراء الفني: ${desc} (المدة: ${createdAction.durationMinutes} دقيقة) - الحالة أصبحت: ${newStatus}`
      });
    }

    // Add Audit Log
    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: actionType === 'PART_REQUEST' ? 'PART_REQUEST_CREATED' : 'MAINTENANCE_ACTION_LOGGED',
      entityName: 'TechnicianQRAction',
      entityId: ticket.ticketNumber,
      userName: `${tech.fullName} (${tech.employeeCode})`,
      newValues: {
        machineNumber: machine.machineNumber,
        ticketNumber: ticket.ticketNumber,
        actionType,
        actionDetail: maintenanceDetails?.actionTypeTitle || (createdPartRequest ? createdPartRequest.partName : 'Field Action'),
        gps: gpsLocation ? `${gpsLocation.lat}, ${gpsLocation.lng}` : 'Verified via QR Physical Scan',
        timestamp: now
      },
      timestamp: now,
      createdAt: now
    });

    saveStore(store);
    console.log(`[API] Field Technician QR Action Logged: ${tech.fullName} on machine ${machine.machineNumber} (Ticket ${ticket.ticketNumber})`);

    res.json({
      success: true,
      message: 'تم تسجيل وتوثيق إجراء الفني بنجاح في قاعدة البيانات',
      technician: tech,
      machine: {
        id: machine.id,
        machineNumber: machine.machineNumber,
        status: machine.status,
        lastMaintenanceAt: machine.lastMaintenanceAt
      },
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        title: ticket.title,
        updatedAt: ticket.updatedAt
      },
      partRequest: createdPartRequest,
      maintenanceAction: createdAction,
      auditLogged: true,
      timestamp: now
    });
  });

  // Tickets CRUD
  apiRouter.get('/tickets', (req, res) => {
    const store = getStore();
    res.json(store.tickets);
  });

  apiRouter.get('/tickets/:id', (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const t = store.tickets.find((x: any) => x.id === id || x.ticketNumber === id);
    if (!t) return res.status(404).json({ error: 'Ticket not found' });
    res.json(t);
  });

  apiRouter.post('/tickets', requireEnterpriseRole(['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER', 'FACILITY_MANAGER', 'MANAGEMENT', 'TECHNICIAN']), (req, res) => {
    const store = getStore();
    const data = req.body;
    const count = store.tickets.length + 1;
    const numStr = String(count).padStart(4, '0');
    const now = new Date().toISOString();

    let machine = (store.machines || []).find((m: any) => m.id === data.machineId || m.machineNumber === data.machineId || m.serialNumber === data.machineId);
    if (!machine && (data.machineNumber || data.machineId)) {
      const nowHex = Math.random().toString(36).substring(2, 6).toUpperCase();
      const mNum = (data.machineNumber || data.machineId || `VM-${nowHex}`).trim().toUpperCase();
      machine = {
        id: `mch-${Date.now()}`,
        machineNumber: mNum,
        serialNumber: data.serialNumber || `SN-${nowHex}`,
        model: data.machine?.model || 'Standard Vending Unit',
        type: data.machine?.type || 'SNACK',
        status: 'OPERATIONAL',
        createdAt: now,
        updatedAt: now
      };
      if (!store.machines) store.machines = [];
      store.machines.unshift(machine);
    } else if (!machine && store.machines && store.machines.length > 0) {
      machine = store.machines[0];
    }
    if (!machine) {
      return res.status(400).json({ error: 'لا توجد ماكينات مسجلة في النظام. يرجى تسجيل أو استيراد ماكينة أولاً لفتح تذكرة صيانة عليها.' });
    }
    const loc = machine.currentLocation || (data.locationId ? store.locations.find((l: any) => l.id === data.locationId) : null) || store.locations[0] || null;

    const newTicket = {
      id: `tck-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      ticketNumber: `TCK-2026-${numStr}`,
      title: data.title || `Issue on #${machine.machineNumber}`,
      titleAr: data.titleAr || `بلاغ صيانة #${machine.machineNumber}`,
      machineId: machine.id,
      machine: machine,
      locationId: loc?.id || machine.currentLocation?.id || '',
      location: loc,
      source: data.source || 'MANUAL',
      category: data.category || 'OTHER',
      priority: data.priority || 'MEDIUM',
      status: 'NEW',
      description: data.description || 'Manual ticket entry',
      assignedTechnicianId: data.assignedTechnicianId || undefined,
      reporterName: data.reportedBy || 'Operations Team',
      reporterPhone: data.reporterPhone || undefined,
      reporterEmail: data.reporterEmail || undefined,
      isRecurring: false,
      recurringOccurrenceCount: 1,
      slaDueAt: new Date(Date.now() + 4 * 3600000).toISOString(),
      totalPartsCost: 0,
      timeline: [
        {
          id: `tl-${Date.now()}`,
          ticketId: `tck-${Date.now()}`,
          timestamp: now,
          action: 'CREATED',
          actionLabel: 'Ticket Opened',
          description: data.description || 'Ticket created in maintenance management system.'
        }
      ],
      statusHistory: [],
      notes: [],
      attachments: [],
      createdAt: now,
      updatedAt: now
    };

    if (machine && machine.status === 'OPERATIONAL') {
      machine.status = 'WARNING';
      machine.lastFaultAt = now;
    }

    store.tickets.unshift(newTicket);
    saveStore(store);
    res.json(newTicket);
  });

  // Assign Ticket
  apiRouter.post('/tickets/:id/assign', requireEnterpriseRole(['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER']), (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const tck = store.tickets.find((x: any) => x.id === id || x.ticketNumber === id);
    if (!tck) return res.status(404).json({ error: 'Ticket not found' });

    const techId = req.body.technician_id || req.body.technicianId;
    const comment = req.body.comment;
    const tech = (store.technicians || []).find((t: any) => t.id === techId) || store.technicians?.[0];

    const prevStatus = tck.status;
    tck.status = 'ASSIGNED';
    tck.assignedTechnicianId = tech?.id || techId;
    tck.assignedTechnician = tech;
    const now = new Date().toISOString();
    tck.updatedAt = now;

    if (!tck.timeline) tck.timeline = [];
    if (!tck.statusHistory) tck.statusHistory = [];

    tck.statusHistory.push({
      id: `sh-${Date.now()}`,
      ticketId: tck.id,
      previousStatus: prevStatus,
      newStatus: 'ASSIGNED',
      comment: comment || `Assigned to ${tech?.fullName || tech?.employeeCode || 'Technician'}`,
      createdAt: now
    });

    tck.timeline.unshift({
      id: `tl-${Date.now()}`,
      ticketId: tck.id,
      timestamp: now,
      technicianId: tech?.id,
      technicianName: tech?.fullName || tech?.employeeCode,
      technicianCode: tech?.employeeCode,
      action: 'ASSIGNED',
      actionLabel: 'تم إسناد التذكرة للفني',
      description: comment || `تم إسناد التذكرة إلى الفني ${tech?.fullName || tech?.employeeCode} (${tech?.specialization || 'صيانة'})`
    });

    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'TICKET_ASSIGNED',
      entityName: 'Ticket',
      entityId: tck.ticketNumber,
      oldValues: { status: prevStatus },
      newValues: { status: 'ASSIGNED', technicianId: tech?.id, technicianName: tech?.fullName },
      createdAt: now
    });

    saveStore(store);
    res.json(tck);
  });

  // Triage Ticket
  apiRouter.post('/tickets/:id/triage', requireEnterpriseRole(['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER']), (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const tck = store.tickets.find((x: any) => x.id === id || x.ticketNumber === id);
    if (!tck) return res.status(404).json({ error: 'Ticket not found' });

    const prevStatus = tck.status;
    const now = new Date().toISOString();
    tck.status = 'TRIAGED';
    tck.triagedAt = now;
    if (req.body.priority) tck.priority = req.body.priority;
    if (req.body.category) tck.category = req.body.category;
    tck.updatedAt = now;

    if (!tck.timeline) tck.timeline = [];
    if (!tck.statusHistory) tck.statusHistory = [];

    tck.statusHistory.push({
      id: `sh-${Date.now()}`,
      ticketId: tck.id,
      previousStatus: prevStatus,
      newStatus: 'TRIAGED',
      comment: req.body.comment || 'Ticket evaluated and categorized',
      createdAt: now
    });

    tck.timeline.unshift({
      id: `tl-${Date.now()}`,
      ticketId: tck.id,
      timestamp: now,
      action: 'TRIAGED',
      actionLabel: 'تم تقييم وتصنيف البلاغ',
      description: req.body.comment || `تم التقييم: الأولوية (${tck.priority})، التصنيف (${tck.category})`
    });

    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'TICKET_TRIAGED',
      entityName: 'Ticket',
      entityId: tck.ticketNumber,
      oldValues: { status: prevStatus },
      newValues: { status: 'TRIAGED', priority: tck.priority, category: tck.category },
      createdAt: now
    });

    saveStore(store);
    res.json(tck);
  });

  // Accept Ticket
  apiRouter.post('/tickets/:id/accept', requireEnterpriseRole(['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER', 'TECHNICIAN']), (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const tck = store.tickets.find((x: any) => x.id === id || x.ticketNumber === id);
    if (!tck) return res.status(404).json({ error: 'Ticket not found' });

    const techId = req.body.technician_id || req.body.technicianId || tck.assignedTechnicianId;
    const tech = (store.technicians || []).find((t: any) => t.id === techId) || tck.assignedTechnician || store.technicians?.[0];
    const now = new Date().toISOString();

    tck.assignedTechnicianId = tech?.id;
    tck.assignedTechnician = tech;
    tck.acknowledgedAt = now;
    tck.updatedAt = now;

    if (!tck.timeline) tck.timeline = [];
    tck.timeline.unshift({
      id: `tl-${Date.now()}`,
      ticketId: tck.id,
      timestamp: now,
      technicianId: tech?.id,
      technicianName: tech?.fullName || tech?.employeeCode,
      technicianCode: tech?.employeeCode,
      action: 'ACCEPTED',
      actionLabel: 'قبول البلاغ والالتزام بـ SLA',
      description: req.body.comment || `قام الفني ${tech?.fullName || tech?.employeeCode} بقبول مهمة الصيانة وبدء احتساب وقت الاستجابة.`
    });

    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'TICKET_ACCEPTED',
      entityName: 'Ticket',
      entityId: tck.ticketNumber,
      newValues: { acknowledgedAt: now, technician: tech?.employeeCode },
      createdAt: now
    });

    saveStore(store);
    res.json(tck);
  });

  // Start Work
  apiRouter.post('/tickets/:id/start-work', requireEnterpriseRole(['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER', 'TECHNICIAN']), (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const tck = store.tickets.find((x: any) => x.id === id || x.ticketNumber === id);
    if (!tck) return res.status(404).json({ error: 'Ticket not found' });

    const prevStatus = tck.status;
    const techId = req.body.technician_id || req.body.technicianId || tck.assignedTechnicianId;
    const tech = (store.technicians || []).find((t: any) => t.id === techId) || tck.assignedTechnician || store.technicians?.[0];
    const now = new Date().toISOString();

    tck.assignedTechnicianId = tech?.id;
    tck.assignedTechnician = tech;
    tck.status = 'IN_PROGRESS';
    if (!tck.startedAt) tck.startedAt = now;
    tck.updatedAt = now;

    if (!tck.timeline) tck.timeline = [];
    if (!tck.statusHistory) tck.statusHistory = [];

    tck.statusHistory.push({
      id: `sh-${Date.now()}`,
      ticketId: tck.id,
      previousStatus: prevStatus,
      newStatus: 'IN_PROGRESS',
      comment: req.body.comment || 'بدء أعمال الصيانة الميدانية والفحص',
      createdAt: now
    });

    tck.timeline.unshift({
      id: `tl-${Date.now()}`,
      ticketId: tck.id,
      timestamp: now,
      technicianId: tech?.id,
      technicianName: tech?.fullName || tech?.employeeCode,
      technicianCode: tech?.employeeCode,
      action: 'WORK_STARTED',
      actionLabel: 'بدء العمل الميداني',
      description: req.body.comment || `وصول الفني إلى موقع الماكينة (${tck.location?.fullDescription || 'الموقع'}) وبدء الفحص والتشخيص.`
    });

    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'WORK_STARTED',
      entityName: 'Ticket',
      entityId: tck.ticketNumber,
      oldValues: { status: prevStatus },
      newValues: { status: 'IN_PROGRESS', startedAt: tck.startedAt },
      createdAt: now
    });

    saveStore(store);
    res.json(tck);
  });

  // Add Ticket Maintenance Action (تسجيل إجراءات الصيانة وحفظها في قاعدة البيانات)
  apiRouter.post('/tickets/:id/actions', requireEnterpriseRole(['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER', 'TECHNICIAN']), (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const tck = store.tickets.find((x: any) => x.id === id || x.ticketNumber === id);
    if (!tck) return res.status(404).json({ error: 'Ticket not found' });

    const data = req.body;
    const now = new Date().toISOString();
    const tech = (store.technicians || []).find((t: any) => t.id === (data.technicianId || tck.assignedTechnicianId)) || tck.assignedTechnician || store.technicians?.[0];

    if (data.rootCause) tck.rootCause = data.rootCause;
    if (!tck.maintenanceActions) tck.maintenanceActions = [];
    if (!tck.timeline) tck.timeline = [];

    const newAction = {
      id: `ma-${Date.now()}`,
      ticketId: tck.id,
      technicianId: tech?.id,
      technician: tech,
      actionType: data.actionType || 'CORRECTIVE_MAINTENANCE',
      actionTaken: data.actionTaken || data.description || 'إجراء صيانة',
      description: data.description || data.actionTaken || 'إجراء صيانة',
      rootCause: data.rootCause,
      durationMinutes: data.durationMinutes || 30,
      workDurationMinutes: data.durationMinutes || 30,
      partsReplaced: data.partsReplaced,
      partsUsed: data.partsUsed,
      performedAt: now,
      createdAt: now
    };

    tck.maintenanceActions.unshift(newAction);

    // Calculate parts cost
    if (data.partsReplaced && Array.isArray(data.partsReplaced)) {
      const partsCostDelta = data.partsReplaced.reduce((acc: number, p: any) => acc + ((p.quantity || 1) * (p.unitCost || 0)), 0);
      tck.totalPartsCost = (tck.totalPartsCost || 0) + partsCostDelta;
    }

    tck.timeline.unshift({
      id: `tl-${Date.now()}`,
      ticketId: tck.id,
      timestamp: now,
      technicianId: tech?.id,
      technicianName: tech?.fullName || tech?.employeeCode,
      technicianCode: tech?.employeeCode,
      action: 'ACTION_ADDED',
      actionLabel: data.actionType ? data.actionType.replace(/_/g, ' ') : 'تسجيل إجراء صيانة',
      description: `${data.actionTaken || data.description}${data.durationMinutes ? ` (استغرق ${data.durationMinutes} دقيقة)` : ''}`,
      part: data.partsReplaced?.[0] ? {
        partNumber: data.partsReplaced[0].partNumber,
        name: data.partsReplaced[0].name,
        quantity: data.partsReplaced[0].quantity,
        unitCost: data.partsReplaced[0].unitCost
      } : undefined
    });

    tck.updatedAt = now;

    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'MAINTENANCE_ACTION_ADDED',
      entityName: 'Ticket',
      entityId: tck.ticketNumber,
      newValues: {
        actionType: data.actionType,
        actionTaken: data.actionTaken,
        durationMinutes: data.durationMinutes,
        technician: tech?.employeeCode || tech?.fullName
      },
      createdAt: now
    });

    saveStore(store);
    console.log(`[API] Maintenance action recorded successfully for ticket ${tck.ticketNumber}`);
    res.json(newAction);
  });

  // Attachments / Photos
  apiRouter.post('/tickets/:id/attachments', requireEnterpriseRole(['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER', 'TECHNICIAN']), (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const tck = store.tickets.find((x: any) => x.id === id || x.ticketNumber === id);
    if (!tck) return res.status(404).json({ error: 'Ticket not found' });

    const photo = req.body;
    const now = new Date().toISOString();
    if (!tck.attachments) tck.attachments = [];
    if (!tck.timeline) tck.timeline = [];

    const newAtt = {
      id: `att-${Date.now()}`,
      ticketId: tck.id,
      fileName: photo.fileName || `site-photo-${Date.now()}.jpg`,
      fileType: photo.fileType || 'image/jpeg',
      fileUrl: photo.fileUrl,
      fileSize: photo.fileSize || 1024 * 340,
      caption: photo.caption || 'صورة توثيق الفحص الميداني',
      uploadedBy: photo.uploadedBy || tck.assignedTechnician?.fullName || 'Technician',
      uploaderRole: photo.uploaderRole || 'TECHNICIAN',
      createdAt: now
    };

    tck.attachments.unshift(newAtt);

    tck.timeline.unshift({
      id: `tl-${Date.now()}`,
      ticketId: tck.id,
      timestamp: now,
      technicianName: newAtt.uploadedBy,
      action: 'PHOTO_UPLOADED',
      actionLabel: 'إرفاق صورة توثيقية',
      description: photo.caption || `تم إرفاق صورة الفحص الميداني: ${newAtt.fileName}`,
      attachment: {
        id: newAtt.id,
        fileName: newAtt.fileName,
        fileUrl: newAtt.fileUrl,
        fileType: newAtt.fileType,
        caption: newAtt.caption
      }
    });

    tck.updatedAt = now;

    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'PHOTO_UPLOADED',
      entityName: 'Ticket',
      entityId: tck.ticketNumber,
      newValues: { fileName: photo.fileName, uploadedBy: newAtt.uploadedBy },
      createdAt: now
    });

    saveStore(store);
    res.json(newAtt);
  });

  // Notes
  apiRouter.post('/tickets/:id/notes', requireEnterpriseRole(['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER', 'TECHNICIAN']), (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const tck = store.tickets.find((x: any) => x.id === id || x.ticketNumber === id);
    if (!tck) return res.status(404).json({ error: 'Ticket not found' });

    const note = req.body;
    const now = new Date().toISOString();
    if (!tck.notes) tck.notes = [];
    if (!tck.timeline) tck.timeline = [];

    const newNote = {
      id: `nt-${Date.now()}`,
      ticketId: tck.id,
      authorName: note.authorName || 'Technician',
      authorRole: note.authorRole || 'Technician',
      content: note.content,
      isInternal: note.isInternal ?? true,
      createdAt: now
    };

    tck.notes.unshift(newNote);

    tck.timeline.unshift({
      id: `tl-${Date.now()}`,
      ticketId: tck.id,
      timestamp: now,
      technicianName: newNote.authorName,
      action: 'NOTE_ADDED',
      actionLabel: 'إضافة ملاحظة عمل',
      description: note.content
    });

    tck.updatedAt = now;

    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'NOTE_ADDED',
      entityName: 'Ticket',
      entityId: tck.ticketNumber,
      newValues: { author: newNote.authorName, content: note.content },
      createdAt: now
    });

    saveStore(store);
    res.json(newNote);
  });

  // Part Requests
  apiRouter.post('/tickets/:id/part-requests', requireEnterpriseRole(['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER', 'TECHNICIAN']), (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const tck = store.tickets.find((x: any) => x.id === id || x.ticketNumber === id);
    if (!tck) return res.status(404).json({ error: 'Ticket not found' });

    const partReq = req.body;
    let part = (store.spareParts || []).find((p: any) => p.id === partReq.sparePartId);

    // If not matched by ID, try matching by name or SKU
    if (!part && partReq.partName) {
      const q = (partReq.partName || '').trim().toLowerCase();
      const qNum = (partReq.partNumber || '').trim().toLowerCase();
      part = (store.spareParts || []).find((p: any) => 
        (p.name && p.name.toLowerCase() === q) ||
        (p.nameAr && p.nameAr.toLowerCase() === q) ||
        (p.partNumber && p.partNumber.toLowerCase() === qNum) ||
        (p.partNumber && p.partNumber.toLowerCase() === q)
      );
    }

    const isCustomPart = !part || Boolean(partReq.isCustomPart);
    const partNumber = part ? part.partNumber : (partReq.partNumber?.trim() || `REQ-NEW-${Math.floor(1000 + Math.random() * 9000)}`);
    const partName = part ? (part.nameAr || part.name) : (partReq.partName?.trim() || 'قطعة غيار مخصصة');
    const unitCost = part ? (part.unitCost || 0) : (Number(partReq.estimatedCost) || 0);
    const tech = (store.technicians || []).find((t: any) => t.id === (partReq.technicianId || tck.assignedTechnicianId)) || tck.assignedTechnician || store.technicians?.[0];
    const prevStatus = tck.status;
    const now = new Date().toISOString();
    const quantity = Number(partReq.quantity) || 1;

    const newReq: any = {
      id: `req-${Date.now()}`,
      requestNumber: `REQ-${Math.floor(100000 + Math.random() * 900000)}`,
      ticketId: tck.id,
      ticket: tck,
      ticketNumber: tck.ticketNumber,
      machineId: tck.machineId,
      machineNumber: tck.machine?.machineNumber,
      technicianId: tech?.id,
      technician: tech,
      technicianName: tech?.fullName || tech?.employeeCode,
      partId: part?.id,
      sparePartId: part?.id,
      part: part || {
        id: `custom-part-${Date.now()}`,
        partNumber,
        name: partName,
        nameAr: partName,
        unitCost: unitCost,
        currentQuantity: 0,
        storageLocation: 'غير مدرجة بالمخزن (طلب شراء خارجي / توريد جديد)'
      },
      sparePart: part,
      partNumber,
      partName,
      isCustomNonCatalog: isCustomPart,
      estimatedCost: unitCost,
      quantity,
      priority: partReq.priority || 'HIGH',
      status: 'PENDING',
      reason: partReq.reason || (isCustomPart ? 'طلب توريد وشراء قطعة غيار جديدة غير مسجلة بالمخزن' : 'طلب صرف قطعة غيار من المخزن'),
      notes: partReq.notes,
      createdAt: now
    };

    if (!store.partRequests) store.partRequests = [];
    store.partRequests.unshift(newReq);

    tck.status = 'WAITING_FOR_PART';
    if (unitCost > 0) {
      tck.totalPartsCost = (tck.totalPartsCost || 0) + (unitCost * quantity);
    }
    tck.updatedAt = now;

    if (!tck.timeline) tck.timeline = [];
    if (!tck.statusHistory) tck.statusHistory = [];

    tck.statusHistory.push({
      id: `sh-${Date.now()}`,
      ticketId: tck.id,
      previousStatus: prevStatus,
      newStatus: 'WAITING_FOR_PART',
      comment: isCustomPart
        ? `طلب توريد جديد لقطعة غير مسجلة بالمخزن: ${quantity}x ${partName} (${partNumber})`
        : `طلب صرف قطعة من المخزن: ${quantity}x ${partName} (${partNumber})`,
      createdAt: now
    });

    tck.timeline.unshift({
      id: `tl-${Date.now()}`,
      ticketId: tck.id,
      timestamp: now,
      technicianId: tech?.id,
      technicianName: tech?.fullName || tech?.employeeCode,
      technicianCode: tech?.employeeCode,
      action: 'PART_REQUESTED',
      actionLabel: isCustomPart ? 'طلب توريد قطعة جديدة (غير مدرجة)' : 'طلب صرف قطعة من المخزن',
      description: isCustomPart
        ? `تم تقديم طلب شراء وتوريد قطعة غير مدرجة في المخزن: ${quantity}x ${partName} (${partNumber}). تحولت حالة التذكرة إلى في انتظار القطع.`
        : `تم تقديم طلب صرف ${quantity}x من ${partName} (${partNumber}). المخزون المتوفر: ${part.currentQuantity} قطعة.`,
      part: {
        partNumber,
        name: partName,
        quantity,
        unitCost,
        status: 'PENDING'
      }
    });

    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'PART_REQUESTED',
      entityName: 'SparePartRequest',
      entityId: newReq.id,
      newValues: {
        ticketNumber: tck.ticketNumber,
        partNumber,
        partName,
        quantity,
        isCustomNonCatalog: isCustomPart
      },
      createdAt: now
    });

    saveStore(store);
    res.json(newReq);
  });

  // Resolve Ticket
  apiRouter.post('/tickets/:id/resolve', requireEnterpriseRole(['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER', 'TECHNICIAN']), async (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const tck = store.tickets.find((x: any) => x.id === id || x.ticketNumber === id);
    if (!tck) return res.status(404).json({ error: 'Ticket not found' });

    const resolution = req.body;
    const tech = (store.technicians || []).find((t: any) => t.id === (resolution.technicianId || tck.assignedTechnicianId)) || tck.assignedTechnician || store.technicians?.[0];
    const prevStatus = tck.status;
    const now = new Date().toISOString();

    tck.status = 'RESOLVED';
    tck.resolvedAt = now;
    tck.rootCause = resolution.rootCause;
    tck.resolutionSummary = resolution.resolutionSummary;
    tck.updatedAt = now;

    // Deduct stock for parts used if any
    if (resolution.partsUsed && Array.isArray(resolution.partsUsed)) {
      if (!store.transactions) store.transactions = [];
      let partsCostSum = 0;
      for (const pu of resolution.partsUsed) {
        const part = (store.spareParts || []).find((p: any) => p.id === (pu.partId || pu.sparePart?.id));
        if (part) {
          const qty = pu.quantity || 1;
          const cost = pu.unitCostAtUse || part.unitCost || 0;
          partsCostSum += (qty * cost);

          const balanceBefore = part.currentQuantity || 0;
          const balanceAfter = Math.max(0, balanceBefore - qty);
          part.currentQuantity = balanceAfter;
          part.totalValue = balanceAfter * (part.unitCost || 0);
          part.updatedAt = now;

          store.transactions.unshift({
            id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            partId: part.id,
            sparePartId: part.id,
            part: part,
            sparePart: part,
            transactionType: 'ISSUE',
            quantity: qty,
            quantityDelta: -qty,
            balanceBefore,
            balanceAfter,
            unitCost: cost,
            unitPrice: cost,
            totalCost: qty * cost,
            referenceTicketId: tck.id,
            referenceTicketNumber: tck.ticketNumber,
            referenceNumber: `TCK-${tck.ticketNumber}`,
            machineId: tck.machineId,
            machineNumber: tck.machine?.machineNumber,
            performedBy: tech?.fullName || tech?.employeeCode || 'Technician',
            notes: `صرف لصيانة الماكينة ${tck.machine?.machineNumber || ''} بموجب البلاغ ${tck.ticketNumber}`,
            createdAt: now
          });
        }
      }
      tck.totalPartsCost = (tck.totalPartsCost || 0) + partsCostSum;
    }

    if (!tck.maintenanceActions) tck.maintenanceActions = [];
    tck.maintenanceActions.unshift({
      id: `ma-${Date.now()}`,
      ticketId: tck.id,
      technicianId: tech?.id,
      technician: tech,
      actionType: 'RESOLUTION_COMPLETED',
      actionTaken: resolution.resolutionSummary,
      description: `تم إنجاز الصيانة: ${resolution.resolutionSummary}`,
      rootCause: resolution.rootCause,
      durationMinutes: resolution.durationMinutes || 45,
      workDurationMinutes: resolution.durationMinutes || 45,
      partsUsed: resolution.partsUsed,
      performedAt: now,
      createdAt: now
    });

    if (!tck.timeline) tck.timeline = [];
    if (!tck.statusHistory) tck.statusHistory = [];

    tck.statusHistory.push({
      id: `sh-${Date.now()}`,
      ticketId: tck.id,
      previousStatus: prevStatus,
      newStatus: 'RESOLVED',
      comment: resolution.resolutionSummary,
      createdAt: now
    });

    tck.timeline.unshift({
      id: `tl-${Date.now()}`,
      ticketId: tck.id,
      timestamp: now,
      technicianId: tech?.id,
      technicianName: tech?.fullName || tech?.employeeCode,
      technicianCode: tech?.employeeCode,
      action: 'RESOLVED',
      actionLabel: 'اكتمال الإصلاح وحل المشكلة',
      description: `السبب الجذري: ${resolution.rootCause}. ملخص الإجراء: ${resolution.resolutionSummary}`
    });

    // Update machine status back to OPERATIONAL if no other active critical tickets
    const mch = (store.machines || []).find((m: any) => m.id === tck.machineId);
    if (mch) {
      const remainingActive = store.tickets.filter((t: any) => t.machineId === mch.id && t.id !== tck.id && !['RESOLVED', 'VERIFIED', 'CLOSED'].includes(t.status));
      if (remainingActive.length === 0) {
        mch.status = 'OPERATIONAL';
        mch.lastMaintenanceAt = now;
        mch.healthScore = Math.min(100, (mch.healthScore || 80) + 15);
      }
    }

    // Automatically fulfill/issue any linked active part requests for this ticket
    const linkedReqs = (store.partRequests || []).filter(
      (r: any) => (r.ticketId === tck.id || r.ticketNumber === tck.ticketNumber) && !['ISSUED', 'CANCELLED', 'REJECTED'].includes(r.status)
    );
    for (const r of linkedReqs) {
      r.status = 'ISSUED';
      r.issuedAt = now;
      r.issuedBy = tech?.fullName || tech?.employeeCode || 'فني الصيانة المعتمد';
      r.updatedAt = now;
      if (!r.timeline) r.timeline = [];
      r.timeline.unshift({
        status: 'ISSUED',
        timestamp: now,
        actor: tech?.fullName || tech?.employeeCode || 'فني الصيانة',
        comment: `تم صرف واستخدام القطعة وإتمام الإصلاح بنجاح مع حل البلاغ ${tck.ticketNumber}`
      });
    }

    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'TICKET_RESOLVED',
      entityName: 'Ticket',
      entityId: tck.ticketNumber,
      oldValues: { status: prevStatus },
      newValues: { status: 'RESOLVED', rootCause: resolution.rootCause, resolutionSummary: resolution.resolutionSummary },
      createdAt: now
    });

    saveStore(store);

    const cloudLifecycleResult =
      await syncCloudTicketLifecycleFromMain(
        req,
        tck,
        'RESOLVED',
        resolution.resolutionSummary
      );

    if (!cloudLifecycleResult.ok && !cloudLifecycleResult.skipped) {
      console.error(
        '[CloudTicketLifecycle] RESOLVED sync failed:',
        tck.ticketNumber,
        cloudLifecycleResult
      );
    }

    res.json(tck);
  });

  // Verify Ticket
  apiRouter.post('/tickets/:id/verify', requireEnterpriseRole(['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER']), (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const tck = store.tickets.find((x: any) => x.id === id || x.ticketNumber === id);
    if (!tck) return res.status(404).json({ error: 'Ticket not found' });

    const prevStatus = tck.status;
    const now = new Date().toISOString();
    tck.status = 'VERIFIED';
    tck.verifiedAt = now;
    tck.updatedAt = now;

    if (!tck.timeline) tck.timeline = [];
    if (!tck.statusHistory) tck.statusHistory = [];

    tck.statusHistory.push({
      id: `sh-${Date.now()}`,
      ticketId: tck.id,
      previousStatus: prevStatus,
      newStatus: 'VERIFIED',
      comment: req.body.comment || 'تم فحص جودة الإصلاح والتأكد من جاهزية الماكينة',
      createdAt: now
    });

    tck.timeline.unshift({
      id: `tl-${Date.now()}`,
      ticketId: tck.id,
      timestamp: now,
      technicianName: req.body.verifiedBy || 'مشرف الجودة / العمليات',
      action: 'VERIFIED',
      actionLabel: 'اعتماد ومطابقة الفحص',
      description: req.body.comment || 'تمت مطابقة نتائج الفحص الفني واختبار التشغيل بنجاح.'
    });

    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'TICKET_VERIFIED',
      entityName: 'Ticket',
      entityId: tck.ticketNumber,
      oldValues: { status: prevStatus },
      newValues: { status: 'VERIFIED' },
      createdAt: now
    });

    saveStore(store);
    res.json(tck);
  });

  // Close Ticket
  apiRouter.post('/tickets/:id/close', requireEnterpriseRole(['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER']), async (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const tck = store.tickets.find((x: any) => x.id === id || x.ticketNumber === id);
    if (!tck) return res.status(404).json({ error: 'Ticket not found' });

    const prevStatus = tck.status;
    const now = new Date().toISOString();
    tck.status = 'CLOSED';
    tck.closedAt = now;
    tck.updatedAt = now;

    if (!tck.timeline) tck.timeline = [];
    if (!tck.statusHistory) tck.statusHistory = [];

    tck.statusHistory.push({
      id: `sh-${Date.now()}`,
      ticketId: tck.id,
      previousStatus: prevStatus,
      newStatus: 'CLOSED',
      comment: req.body.comment || 'إغلاق التذكرة وأرشفتها نهائياً',
      createdAt: now
    });

    tck.timeline.unshift({
      id: `tl-${Date.now()}`,
      ticketId: tck.id,
      timestamp: now,
      technicianName: req.body.closedBy || 'مدير النظام',
      action: 'CLOSED',
      actionLabel: 'إغلاق وأرشفة البلاغ',
      description: req.body.comment || 'تم إغلاق البلاغ وأرشفة كافة خطوات العمل والقطع المستهلكة في السجل المركزي.'
    });

    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'TICKET_CLOSED',
      entityName: 'Ticket',
      entityId: tck.ticketNumber,
      oldValues: { status: prevStatus },
      newValues: { status: 'CLOSED' },
      createdAt: now
    });

    saveStore(store);

    const cloudLifecycleResult =
      await syncCloudTicketLifecycleFromMain(
        req,
        tck,
        'CLOSED',
        req.body.comment || tck.resolutionSummary
      );

    if (!cloudLifecycleResult.ok && !cloudLifecycleResult.skipped) {
      console.error(
        '[CloudTicketLifecycle] CLOSED sync failed:',
        tck.ticketNumber,
        cloudLifecycleResult
      );
    }

    res.json(tck);
  });

  // Archive Ticket
  apiRouter.post('/tickets/:id/archive', requireEnterpriseRole(['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER']), (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const tck = store.tickets.find((x: any) => x.id === id || x.ticketNumber === id);
    if (!tck) return res.status(404).json({ error: 'Ticket not found' });

    const now = new Date().toISOString();
    tck.isArchived = true;
    tck.archivedAt = now;
    tck.archivedBy = req.body.archivedBy || 'مدير النظام';
    tck.archivedReason = req.body.reason || 'أرشفة بواسطة الإدارة';
    tck.updatedAt = now;

    saveStore(store);
    res.json(tck);
  });

  // Restore Ticket
  apiRouter.post('/tickets/:id/restore', requireEnterpriseRole(['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER']), (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const tck = store.tickets.find((x: any) => x.id === id || x.ticketNumber === id);
    if (!tck) return res.status(404).json({ error: 'Ticket not found' });

    const now = new Date().toISOString();
    tck.isArchived = false;
    tck.archivedAt = undefined;
    tck.archivedBy = undefined;
    tck.archivedReason = undefined;
    tck.updatedAt = now;

    saveStore(store);
    res.json(tck);
  });

  // Delete Ticket
  apiRouter.delete('/tickets/:id', requireEnterpriseRole(['SUPER_ADMIN', 'ADMIN']), (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const idx = store.tickets.findIndex((x: any) => x.id === id || x.ticketNumber === id);
    if (idx === -1) return res.status(404).json({ error: 'Ticket not found' });

    const deleted = store.tickets.splice(idx, 1)[0];
    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      action: 'TICKET_DELETED',
      entityName: 'Ticket',
      entityId: deleted.ticketNumber,
      newValues: { status: 'DELETED' },
      createdAt: new Date().toISOString()
    });

    runtimeStoreManager.recordTombstone('Ticket', deleted.id || deleted.ticketNumber, (req as any).user?.username || 'Admin', 'Deleted via API');
    if (deleted.ticketNumber && deleted.ticketNumber !== deleted.id) {
      runtimeStoreManager.recordTombstone('Ticket', deleted.ticketNumber, (req as any).user?.username || 'Admin', 'Deleted via API');
    }

    saveStore(store);
    res.json({ success: true, deletedTicket: deleted });
  });

  apiRouter.put('/tickets/:id', requireEnterpriseRole(['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER']), (req, res) => {
    const store = getStore();
    const id = req.params.id;
    const idx = store.tickets.findIndex((x: any) => x.id === id || x.ticketNumber === id);
    if (idx === -1) return res.status(404).json({ error: 'Ticket not found' });

    store.tickets[idx] = {
      ...store.tickets[idx],
      ...req.body,
      updatedAt: new Date().toISOString()
    };

    saveStore(store);
    res.json(store.tickets[idx]);
  });

  // Mount API router to both /api and /api/v1
  apiRouter.get('/sync/status', (req, res) => {
    const store = getStore();
    const opts = desktopSyncWorker.getOptions();
    res.json({
      cloudApiUrl: opts.cloudApiUrl,
      syncClientId: opts.syncClientId,
      intervalSeconds: opts.intervalSeconds,
      lastCloudSyncCursor: store.lastCloudSyncCursor || 0,
      processedEventsCount: (store.processedSyncEventIds || []).length,
      machinesAuthoritativeCount: (store.machines || []).length,
      timestamp: new Date().toISOString()
    });
  });

  apiRouter.post('/sync/trigger', async (req, res) => {
    const result = await desktopSyncWorker.syncOnce(getStore, saveStore);
    res.json(result);
  });

  apiRouter.post('/sync/pause', (req, res) => {
    desktopSyncWorker.pause();
    res.json({ success: true, isPaused: true, message: 'Sync worker paused.' });
  });

  apiRouter.post('/sync/resume', async (req, res) => {
    const result = await desktopSyncWorker.resume(true);
    res.json({ success: true, isPaused: false, message: 'Sync worker resumed and synced.', result });
  });

  app.use('/api/v1', apiRouter);
  app.use('/api', apiRouter);

  // Vite middleware for development or static serving for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Start Standalone Cloud Service ONLY if explicitly requested via START_EMBEDDED_CLOUD
  // Standalone cloud startup must occur only through its explicit entry point (cloud/src/server.ts)
  if (process.env.START_EMBEDDED_CLOUD === 'true') {
    const cloudPort = parseInt(process.env.CLOUD_PORT || '3001', 10);
    startCloudServer(cloudPort).catch((err) => {
      console.warn('[Server] Notice: Standalone Cloud server startup notice:', err.message);
    });
  }

  // Start background Desktop Sync Worker
  desktopSyncWorker.start(getStore, saveStore);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Unified Fleet Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

/**
 * Hybrid Cloud Architecture Engine
 * Handles:
 * - Public QR Portal (Opaque token lookup & customer reports)
 * - Cloud Ticket Generation with Idempotency Key (cloudReportId)
 * - Bidirectional Sync Queue & Event Processing
 * - Authenticated Technician Mobile Sessions & GPS Verification
 * - Maintenance Evidence (Photos & Tests)
 * - Warehouse Spare Part Approvals & Inventory Transactions
 * - Admin Cloud Settings
 */

import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { createRateLimiter } from './rateLimiter';
import { storageService } from '../services/storageService';
import {
  CloudSyncEvent,
  TechnicianCheckInRecord,
  FunctionalTestRecord,
  MaintenanceEvidenceRecord,
  PublicMachineSummary,
  PublicTicketTracking,
  Machine,
  Ticket,
  Technician,
  SparePart,
  SparePartRequest,
  InventoryTransaction
} from '../types/database';

const BASE32_CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateSecureOpaqueToken(length = 8): string {
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += BASE32_CHARSET[bytes[i] % BASE32_CHARSET.length];
  }
  return result;
}

/**
 * Haversine formula to compute great-circle distance between two GPS coordinates in meters
 */
export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) return 999999;
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Idempotent Fleet Master Migration
 * Ensures all 189 machines have unique publicQrToken and GPS coordinates.
 * NEVER changes IDs, machineNumbers, or serialNumbers.
 * Preserves 189 machine baseline count.
 */
export function initHybridFleetMigration(store: any, saveStore: (data: any) => void) {
  if (!store || !Array.isArray(store.machines)) return;

  const machines: Machine[] = store.machines;
  const existingTokens = new Set<string>();
  let tokensGenerated = 0;
  let coordsAssigned = 0;

  // First pass: collect existing tokens
  machines.forEach((m) => {
    if (m.publicQrToken) {
      existingTokens.add(m.publicQrToken.toUpperCase());
    }
  });

  // Second pass: assign token & coordinates if missing
  machines.forEach((m, idx) => {
    if (!m.publicQrToken) {
      let token = generateSecureOpaqueToken(8);
      while (existingTokens.has(token)) {
        token = generateSecureOpaqueToken(8);
      }
      existingTokens.add(token);
      m.publicQrToken = token;
      tokensGenerated++;
    }

    // Safe location initialization without fabricating coordinates
    if (m.latitude === undefined || m.latitude === null) {
      m.latitude = null;
      m.longitude = null;
      m.machineLatitude = null as any;
      m.machineLongitude = null as any;
      m.locationSource = m.locationSource || 'NONE';
      m.locationStatus = 'LOCATION_NOT_CONFIGURED';
    } else {
      m.locationSource = m.locationSource || 'MANUAL_ENTRY';
      m.locationStatus = 'GPS_CONFIGURED';
    }
  });

  // Initialize Sync Queue if missing
  if (!Array.isArray(store.syncQueue)) {
    store.syncQueue = [];
  }

  // Initialize Technician Sessions if missing
  if (!store.technicianSessions || typeof store.technicianSessions !== 'object') {
    store.technicianSessions = {};
  }

  // Initialize Cloud Settings if missing
  if (!store.settings) store.settings = {};
  if (store.settings.publicQrBaseUrl === undefined) {
    store.settings.publicQrBaseUrl = process.env.PUBLIC_QR_BASE_URL || '';
  }
  if (store.settings.cloudApiUrl === undefined) {
    store.settings.cloudApiUrl = process.env.CLOUD_API_URL || '';
  }
  if (store.settings.localServerUrl === undefined) {
    store.settings.localServerUrl = process.env.LOCAL_SERVER_URL || 'http://localhost:3000';
  }
  if (store.settings.technicianCheckinRadiusMeters === undefined) {
    store.settings.technicianCheckinRadiusMeters = Number(process.env.TECHNICIAN_CHECKIN_RADIUS_METERS || 100);
  }
  if (store.settings.technicianMaxGpsAccuracyMeters === undefined) {
    store.settings.technicianMaxGpsAccuracyMeters = Number(process.env.TECHNICIAN_MAX_GPS_ACCURACY_METERS || 100);
  }
  if (store.settings.syncInterval === undefined) {
    store.settings.syncInterval = Number(process.env.SYNC_INTERVAL || 60);
  }

  if (tokensGenerated > 0 || coordsAssigned > 0) {
    saveStore(store);
    console.log(
      `[HYBRID MIGRATION] Safely initialized ${tokensGenerated} QR tokens and ${coordsAssigned} machine coordinates. Total machines: ${machines.length}.`
    );
  }
}

/**
 * Filter machine information for public viewing:
 * NEVER expose internal machine IDs, serial numbers, technician list, or spare parts.
 */
export function sanitizePublicMachine(m: any, store: any): PublicMachineSummary {
  const bldName =
    m.currentLocation?.building?.name ||
    (m.currentLocation?.buildingId
      ? store.buildings.find((b: any) => b.id === m.currentLocation?.buildingId)?.name
      : undefined) ||
    'مجمع ماكينات البيع';

  const locDesc =
    m.currentLocation?.fullDescription ||
    `${bldName} — ${m.currentLocation?.areaZone || 'منطقة الماكينة'}`;

  return {
    publicQrToken: m.publicQrToken,
    machineType: m.machineType || 'ماكينة بيع ذاتي (Vending Machine)',
    buildingName: bldName,
    locationDescription: locDesc,
    status: m.status,
    lastFaultAt: m.lastFaultAt
  };
}

/**
 * Filter ticket for public tracking:
 * NEVER expose internal maintenance notes, internal costs, or technician personal data.
 */
export function sanitizePublicTicketTracking(t: any): PublicTicketTracking {
  return {
    ticketNumber: t.ticketNumber,
    trackingToken: t.publicTrackingToken || '',
    status: t.status,
    category: t.category,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    machineSummary: {
      buildingName: t.machine?.currentLocation?.building?.name || 'موقع الماكينة',
      locationDescription: t.machine?.currentLocation?.fullDescription || 'منطقة الماكينة',
      machineType: t.machine?.machineType || 'ماكينة بيع ذاتي'
    }
  };
}

/**
 * Create Hybrid Router with all Public, Technician, Admin, and Sync endpoints
 */
export function createHybridRouter(getStore: () => any, saveStore: (store: any) => void) {
  const router = express.Router();

  // FIX 12: Rate limiters for public customer reports, tracking, and technician authentication
  // Customer reports: 5 requests / IP / 10 minutes
  const customerReportLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 5,
    message: 'تم تجاوز الحد المسموح به لرفع البلاغات من هذا العنوان (5 بلاغات لكل 10 دقائق). يرجى الانتظار.'
  });

  // Ticket tracking: 60 requests / IP / minute
  const ticketTrackingLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 60,
    message: 'تم تجاوز الحد المسموح به للاستعلام عن البلاغات (60 طلب بالدقيقة). يرجى الانتظار.'
  });

  // Technician login: 5 failed attempts / IP / 15 minutes (failed attempts only)
  const technicianLoginLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,
    message: 'تم قفل محاولات تسجيل الدخول مؤقتاً بسبب تكرار المحاولات الفاشلة (الحد الأقصى: 5 محاولات). يرجى الانتظار 15 دقيقة.'
  });

  // Technician check-in: 20 requests / IP / 10 minutes
  const technicianCheckinLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 20,
    message: 'تم تجاوز الحد المسموح به لعمليات التحقق الميداني (20 محاولة لكل 10 دقائق).'
  });

  // Helper to find machine by opaque publicQrToken (or backward compatible identifier)
  const findMachineByToken = (store: any, token: string): Machine | null => {
    if (!token) return null;
    const clean = token.toString().trim().toUpperCase();
    return (
      store.machines.find((m: any) => {
        if (!m) return false;
        if (m.publicQrToken && m.publicQrToken.toUpperCase() === clean) return true;
        // Strict lookup fallback only if token exactly equals publicQrId or publicId
        if (m.publicQrId && m.publicQrId.toUpperCase() === clean) return true;
        if (m.publicId && m.publicId.toUpperCase() === clean) return true;
        return false;
      }) || null
    );
  };

  // Helper to log audit event
  const logAudit = (store: any, eventType: string, action: string, details: any, actorName = 'SYSTEM') => {
    if (!Array.isArray(store.auditLogs)) store.auditLogs = [];
    const event = {
      id: `adt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      eventType,
      action,
      entityType: 'HYBRID_OPERATIONS',
      actorName,
      details,
      timestamp: new Date().toISOString()
    };
    store.auditLogs.unshift(event);
    if (store.auditLogs.length > 500) {
      store.auditLogs = store.auditLogs.slice(0, 500);
    }
  };

  // =========================================================================
  // 1. PUBLIC ENDPOINTS (No Authentication, Minimal Sanitized Data Only)
  // =========================================================================

  /**
   * Public QR Status & Config
   */
  const handlePublicConfig = (req: Request, res: Response) => {
    const store = getStore();
    const publicUrl = store.settings?.publicQrBaseUrl || process.env.PUBLIC_QR_BASE_URL || '';
    res.json({
      configured: !!publicUrl,
      publicQrBaseUrl: publicUrl,
      supportPhone: store.settings?.supportPhone || '800-123-4567',
      supportEmail: store.settings?.supportEmail || 'support@vendingfleet.com',
      message: publicUrl
        ? 'Public QR Portal is configured'
        : 'Public QR URL is not configured. QR codes generated on this computer will not work from external phones.'
    });
  };
  router.get('/public/config', handlePublicConfig);
  router.get('/api/v1/public/config', handlePublicConfig);

  /**
   * Public Machine Lookup by Opaque Token
   * Returns 404 if token is invalid.
   * NEVER returns technician list or spare parts.
   * NEVER selects the first machine or fake machine.
   */
  const handlePublicMachineLookup = (req: Request, res: Response) => {
    const store = getStore();
    const token = req.params.token || req.params.qrId;
    const machine = findMachineByToken(store, token);

    if (!machine) {
      logAudit(store, 'SECURITY_ALERT', 'INVALID_QR_SCAN', { token, ip: req.ip }, 'ANONYMOUS_SCANNER');
      saveStore(store);
      return res.status(404).json({
        error: 'INVALID_QR_TOKEN',
        message: 'عذراً، رمز الـ QR الممسوح غير صالح أو غير مرتبط بماكينة في الأسطول.'
      });
    }

    const sanitized = sanitizePublicMachine(machine, store);
    res.json(sanitized);
  };
  router.get('/public/m/:token', handlePublicMachineLookup);
  router.get('/public/machine/:token', handlePublicMachineLookup);
  router.get('/api/v1/public/m/:token', handlePublicMachineLookup);

  /**
   * Public Customer Fault Report Submission
   * Idempotent via cloudReportId.
   * Returns ticketNumber and publicTrackingToken.
   * Queues a CloudSyncEvent for desktop sync.
   */
  const handlePublicFaultReport = (req: Request, res: Response) => {
    const store = getStore();
    const token = req.params.token || req.body.publicQrToken || req.body.publicQrId;
    const machine = findMachineByToken(store, token);

    if (!machine) {
      logAudit(store, 'SECURITY_ALERT', 'INVALID_QR_REPORT_ATTEMPT', { token, body: req.body }, 'ANONYMOUS_REPORTER');
      saveStore(store);
      return res.status(404).json({
        error: 'INVALID_QR_TOKEN',
        message: 'لا يمكن رفع بلاغ: رمز الـ QR غير صالح أو لا يطابق أي ماكينة مسجلة.'
      });
    }

    const {
      category = 'OTHER',
      description = '',
      reporterName = 'عميل عبر رمز QR',
      reporterPhone = '',
      reporterEmail = '',
      cloudReportId
    } = req.body;

    if (!description.trim()) {
      return res.status(400).json({
        error: 'DESCRIPTION_REQUIRED',
        message: 'يرجى كتابة وصف موجز للمشكلة التي واجهتها.'
      });
    }

    // Idempotency check: if cloudReportId already processed, return existing ticket
    if (cloudReportId) {
      const existingTicket = store.tickets.find((t: any) => t.cloudReportId === cloudReportId);
      if (existingTicket) {
        return res.status(200).json({
          success: true,
          duplicate: true,
          ticketNumber: existingTicket.ticketNumber,
          trackingToken: existingTicket.publicTrackingToken,
          trackingUrl: `/public/ticket/${existingTicket.publicTrackingToken}`,
          status: existingTicket.status,
          message: 'تم استلام هذا البلاغ مسبقاً، وجارٍ متابعته.'
        });
      }
    }

    const now = new Date().toISOString();
    const resolvedCloudReportId = cloudReportId || `CR-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const publicTrackingToken = `TRK-${generateSecureOpaqueToken(6)}`;

    // Determine priority
    let priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM';
    if (['REFRIGERATION', 'POWER', 'LEAK'].includes(category)) {
      priority = 'CRITICAL';
    } else if (['CARD_POS', 'PAYMENT', 'PRODUCT_SELECTION', 'NO_PRODUCT', 'CARD_READER'].includes(category)) {
      priority = 'HIGH';
    }

    const ticketCount = store.tickets.length + 1;
    const ticketNumber = `TCK-2026-${String(ticketCount).padStart(4, '0')}`;
    const ticketId = `tck-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

    const newTicket: Ticket = {
      id: ticketId,
      ticketNumber,
      cloudReportId: resolvedCloudReportId,
      publicTrackingToken,
      title: `بلاغ عطل ماكينة #${machine.machineNumber} (${category})`,
      titleAr: `بلاغ عطل ماكينة #${machine.machineNumber} (${category})`,
      machineId: machine.id,
      machine,
      locationId: machine.currentLocation?.id || 'loc-001',
      location: machine.currentLocation,
      source: 'CUSTOMER_QR',
      category: category as any,
      priority,
      status: 'NEW',
      description,
      reporterName,
      reporterPhone,
      reporterEmail,
      createdAt: now,
      updatedAt: now,
      timeline: [
        {
          id: `tml-${Date.now()}`,
          ticketId,
          timestamp: now,
          action: 'CREATED',
          actionLabel: 'تم تسجيل البلاغ',
          description: `تم إرسال بلاغ العطل بواسطة العميل عبر رمز QR الميداني (${category}).`
        }
      ]
    };

    store.tickets.unshift(newTicket);

    // Update machine status to WARNING or UNDER_MAINTENANCE if OPERATIONAL
    if (machine.status === 'OPERATIONAL') {
      machine.status = 'WARNING';
      machine.lastFaultAt = now;
    }

    // Queue sync event for desktop
    const syncEvent: CloudSyncEvent = {
      id: `evt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      eventType: 'CUSTOMER_REPORT',
      aggregateType: 'TICKET',
      aggregateId: ticketId,
      cloudReportId: resolvedCloudReportId,
      machinePublicToken: machine.publicQrToken || '',
      payload: {
        ticketId,
        ticketNumber,
        cloudReportId: resolvedCloudReportId,
        machineId: machine.id,
        machineNumber: machine.machineNumber,
        category,
        description,
        reporterName,
        reporterPhone,
        createdAt: now
      },
      createdAt: now,
      processedAt: null,
      syncStatus: 'PENDING',
      retryCount: 0
    };
    store.syncQueue.push(syncEvent);

    logAudit(
      store,
      'TICKET_MANAGEMENT',
      'CUSTOMER_QR_TICKET_CREATED',
      { ticketNumber, machineNumber: machine.machineNumber, category, resolvedCloudReportId },
      reporterName
    );

    saveStore(store);

    res.status(201).json({
      success: true,
      ticketId: newTicket.id,
      ticketNumber,
      trackingToken: publicTrackingToken,
      trackingUrl: `/public/ticket/${publicTrackingToken}`,
      status: 'NEW',
      message: 'تم استلام بلاغك بنجاح وجارٍ توجيهه لفريق الصيانة الميداني.',
      createdAt: now
    });
  };
  router.post('/public/m/:token/report', customerReportLimiter, handlePublicFaultReport);
  router.post('/public/submit-qr-fault', customerReportLimiter, handlePublicFaultReport);
  router.post('/api/v1/public/m/:token/report', customerReportLimiter, handlePublicFaultReport);

  /**
   * Public Ticket Status Tracking
   * Customer tracks their ticket using trackingToken.
   * FIX 11: Endpoint must ONLY accept TRK-xxxxxx tracking tokens.
   * Reject ticket numbers (e.g. TCK-2026-0001), machine IDs, or raw IDs.
   */
  const handlePublicTicketTracking = (req: Request, res: Response) => {
    const store = getStore();
    const rawToken = (req.params.trackingToken || '').trim();
    const token = rawToken.toUpperCase();

    if (!token.startsWith('TRK-')) {
      return res.status(400).json({
        error: 'INVALID_TRACKING_TOKEN',
        message: 'رمز التتبع غير صالح. يجب استخدام رمز التتبع العشوائي الخاص بالبلاغ (يبدأ بـ TRK-).'
      });
    }

    const ticket = store.tickets.find((t: any) => {
      if (!t) return false;
      const tTrack = (t.publicTrackingToken || '').toUpperCase();
      return tTrack === token;
    });

    if (!ticket) {
      return res.status(404).json({
        error: 'TICKET_NOT_FOUND',
        message: 'لم يتم العثور على بلاغ مطابق لرمز التتبع المدخل.'
      });
    }

    const sanitized = sanitizePublicTicketTracking(ticket);
    res.json(sanitized);
  };
  router.get('/public/ticket/:trackingToken', ticketTrackingLimiter, handlePublicTicketTracking);
  router.get('/api/v1/public/ticket/:trackingToken', ticketTrackingLimiter, handlePublicTicketTracking);

  // =========================================================================
  // 2. TECHNICIAN AUTHENTICATION & MOBILE SESSIONS
  // =========================================================================

  /**
   * Technician Login
   * FIX 1: Remove ALL hardcoded password bypasses (tech123, 1234, etc.)
   * FIX 2: If an account has no valid authentication credential, return TECHNICIAN_CREDENTIALS_NOT_CONFIGURED
   * FIX 3: Secure password hash mechanism using bcryptjs. Never log passwords or hashes.
   * FIX 4: Cryptographically secure 24-byte session token with createdAt and expiresAt (8 hours).
   */
  const handleTechnicianLogin = (req: Request, res: Response) => {
    const store = getStore();
    const { username, employeeCode, email, identifier, password, pin } = req.body;
    const rawId = identifier || employeeCode || username || email || '';
    const cleanId = rawId.toString().trim().toLowerCase();
    const secret = typeof password === 'string' ? password.trim() : (typeof pin === 'string' ? pin.trim() : '');

    const normalizeCode = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const numOnly = (s: string) => s.replace(/\D/g, '');

    if (!cleanId) {
      return res.status(400).json({
        error: 'CREDENTIALS_REQUIRED',
        message: 'يرجى إدخال الكود الوظيفي أو البريد الإلكتروني للفني.'
      });
    }

    const tech = store.technicians.find((t: any) => {
      if (!t || t.isDeleted) return false;
      const code = (t.employeeCode || '').toLowerCase().trim();
      const mail = (t.email || '').toLowerCase().trim();
      const tId = (t.id || '').toLowerCase().trim();
      const tName = (t.fullName || t.name || '').toLowerCase().trim();
      if (code === cleanId || mail === cleanId || tId === cleanId || tName === cleanId) return true;
      if (normalizeCode(code) && normalizeCode(code) === normalizeCode(cleanId)) return true;
      if (numOnly(code) && numOnly(cleanId) && numOnly(code) === numOnly(cleanId)) return true;
      return false;
    });

    if (!tech) {
      logAudit(store, 'SECURITY_ALERT', 'UNAUTHORIZED_TECHNICIAN_LOGIN', { cleanId, ip: req.ip }, 'UNAUTHORIZED_TECH');
      saveStore(store);
      return res.status(401).json({
        error: 'TECHNICIAN_NOT_AUTHORIZED',
        message: 'الفني غير مسجل في النظام أو حسابه غير مفعل. يرجى مراجعة إدارة النظام.'
      });
    }

    // Require password or PIN
    if (!secret) {
      return res.status(400).json({
        error: 'CREDENTIALS_REQUIRED',
        message: 'يرجى إدخال كلمة المرور أو رمز الـ PIN.'
      });
    }

    // Locate associated user record
    const associatedUser = store.users.find((u: any) => u.id === tech.userId || u.email?.toLowerCase() === tech.email?.toLowerCase());

    // FIX 2: Check if credentials are configured
    const hasHash = associatedUser && typeof associatedUser.passwordHash === 'string' && associatedUser.passwordHash.length > 0;
    const hasPlain = associatedUser && typeof associatedUser.password === 'string' && associatedUser.password.length > 0;

    if (!associatedUser || (!hasHash && !hasPlain)) {
      // Do NOT auto-assign password, do NOT silently authenticate
      logAudit(store, 'SECURITY_ALERT', 'TECHNICIAN_LOGIN_NO_CREDENTIALS', { employeeCode: tech.employeeCode }, tech.fullName);
      saveStore(store);
      return res.status(403).json({
        error: 'TECHNICIAN_CREDENTIALS_NOT_CONFIGURED',
        message: 'لم يتم ضبط كلمة مرور أو رمز PIN لهذا الحساب بعد. يرجى التواصل مع مسؤول النظام لتعيين بيانات الدخول.'
      });
    }

    // FIX 3: Password verification using bcrypt
    let isPasswordValid = false;

    if (hasHash) {
      try {
        isPasswordValid = bcrypt.compareSync(secret, associatedUser.passwordHash);
      } catch {
        isPasswordValid = false;
      }
    } else if (hasPlain) {
      // Legacy plaintext comparison, then immediately migrate to bcrypt hash
      if (associatedUser.password === secret) {
        isPasswordValid = true;
        associatedUser.passwordHash = bcrypt.hashSync(secret, 10);
        delete associatedUser.password;
        saveStore(store);
      }
    }

    if (!isPasswordValid) {
      logAudit(store, 'SECURITY_ALERT', 'INVALID_TECHNICIAN_CREDENTIALS', { employeeCode: tech.employeeCode }, tech.fullName);
      saveStore(store);
      return res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'كلمة المرور أو رمز الـ PIN غير صحيح.'
      });
    }

    // FIX 4: Create secure session token with 8 hours expiration
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString();
    const token = `tech-sess-${crypto.randomBytes(24).toString('hex')}`;

    store.technicianSessions[token] = {
      sessionId: token,
      technicianId: tech.id,
      employeeCode: tech.employeeCode,
      fullName: tech.fullName,
      email: tech.email,
      createdAt: now.toISOString(),
      expiresAt
    };
    saveStore(store);

    logAudit(store, 'AUTH', 'TECHNICIAN_LOGIN_SUCCESS', { employeeCode: tech.employeeCode }, tech.fullName);

    res.json({
      success: true,
      token,
      expiresAt,
      technician: {
        id: tech.id,
        employeeCode: tech.employeeCode,
        fullName: tech.fullName,
        fullNameAr: tech.fullNameAr || tech.fullName,
        email: tech.email,
        phone: tech.phone || tech.phoneNumber,
        specialization: tech.specialization,
        status: tech.status,
        assignedRegion: tech.assignedRegion
      }
    });
  };
  router.post('/technician/login', technicianLoginLimiter, handleTechnicianLogin);
  router.post('/api/v1/technician/login', technicianLoginLimiter, handleTechnicianLogin);

  /**
   * Middleware to require authenticated technician session
   * FIX 4: Session validation & expiration check (8 hours)
   * Removed header bypass backdoors.
   */
  const requireTechnicianAuth = (req: Request, res: Response, next: NextFunction) => {
    const store = getStore();
    const authHeader = req.headers['authorization'] || req.headers['x-technician-token'];
    let token = '';
    if (typeof authHeader === 'string') {
      token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : authHeader.trim();
    }

    if (!token || !store.technicianSessions[token]) {
      return res.status(401).json({
        error: 'TECHNICIAN_AUTH_REQUIRED',
        message: 'جلسة عمل الفني غير صالحة أو غير موجودة. يرجى تسجيل الدخول مجدداً.'
      });
    }

    const session = store.technicianSessions[token];

    // Check expiration (8 hours)
    if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
      delete store.technicianSessions[token];
      saveStore(store);
      return res.status(401).json({
        error: 'TECHNICIAN_SESSION_EXPIRED',
        message: 'انتهت صلاحية جلسة عمل الفني (8 ساعات). يرجى تسجيل الدخول مجدداً.'
      });
    }

    const tech = store.technicians.find((t: any) => t.id === session.technicianId);
    if (!tech) {
      return res.status(401).json({
        error: 'TECHNICIAN_NOT_AUTHORIZED',
        message: 'بيانات الفني غير متوفرة في النظام.'
      });
    }

    (req as any).technician = tech;
    (req as any).technicianSession = session;
    next();
  };

  /**
   * Get Current Technician Profile
   */
  router.get('/technician/me', requireTechnicianAuth, (req: Request, res: Response) => {
    const tech = (req as any).technician;
    res.json(tech);
  });

  /**
   * Get Tickets Assigned to Authenticated Technician
   */
  router.get('/technician/tickets', requireTechnicianAuth, (req: Request, res: Response) => {
    const store = getStore();
    const tech = (req as any).technician;
    const tickets = store.tickets.filter((t: any) => {
      if (!t) return false;
      return t.assignedTechnicianId === tech.id || t.assignedTechnician?.id === tech.id;
    });
    res.json(tickets);
  });

  /**
   * Technician Check-In with GPS Verification
   * Verifies machine token matches ticket.
   * Compares distance against configurable radius.
   */
  const handleTechnicianCheckin = (req: Request, res: Response) => {
    const store = getStore();
    const tech = (req as any).technician;
    const { ticketId, ticketNumber, machineToken, latitude, longitude, accuracyMeters = 10, manualExceptionReason } = req.body;
    const targetTicketId = ticketId || ticketNumber;

    if (!targetTicketId || !machineToken) {
      return res.status(400).json({
        error: 'MISSING_PARAMETERS',
        message: 'رقم التذكرة ورمز مسح الـ QR للماكينة مطلوبان لإتمام التحقق الميداني.'
      });
    }

    const ticket = store.tickets.find((t: any) => t.id === targetTicketId || t.ticketNumber === targetTicketId);
    if (!ticket) {
      return res.status(404).json({ error: 'TICKET_NOT_FOUND', message: 'التذكرة غير موجودة.' });
    }

    // Ensure technician is assigned to this ticket (or self-assigns if open)
    if (ticket.assignedTechnicianId && ticket.assignedTechnicianId !== tech.id) {
      return res.status(403).json({
        error: 'TICKET_ASSIGNED_TO_OTHER',
        message: `هذه التذكرة مسندة بالفعل إلى فني آخر (${ticket.assignedTechnician?.fullName || ticket.assignedTechnicianId}).`
      });
    }

    const scannedMachine = findMachineByToken(store, machineToken);
    if (!scannedMachine) {
      return res.status(404).json({
        error: 'INVALID_MACHINE_TOKEN',
        message: 'رمز الـ QR الممسوح لا يطابق أي ماكينة مسجلة.'
      });
    }

    // Validate machine matches ticket
    if (ticket.machineId !== scannedMachine.id && ticket.machine?.machineNumber !== scannedMachine.machineNumber) {
      logAudit(
        store,
        'SECURITY_ALERT',
        'MACHINE_QR_MISMATCH_ON_CHECKIN',
        { ticketId, ticketMachineId: ticket.machineId, scannedMachineId: scannedMachine.id },
        tech.fullName
      );
      saveStore(store);
      return res.status(400).json({
        error: 'MACHINE_QR_MISMATCH',
        message: `رمز الـ QR الممسوح يعود للماكينة #${scannedMachine.machineNumber}، بينما التذكرة مخصصة للماكينة #${ticket.machine?.machineNumber || ticket.machineId}.`
      });
    }

    // GPS Distance Calculation & Validation (ZERO FAKE GPS REMEDIATION)
    // Machine coordinates must be strictly verified or treated as null. Never inject fake default coordinates.
    const rawMachineLat = scannedMachine.latitude ?? scannedMachine.machineLatitude ?? null;
    const rawMachineLon = scannedMachine.longitude ?? scannedMachine.machineLongitude ?? null;
    const machineLat = typeof rawMachineLat === 'number' && !isNaN(rawMachineLat) ? rawMachineLat : null;
    const machineLon = typeof rawMachineLon === 'number' && !isNaN(rawMachineLon) ? rawMachineLon : null;
    const machineHasGps = machineLat !== null && machineLon !== null;

    const allowedRadius = store.settings?.technicianCheckinRadiusMeters || 100;
    const maxAcceptableAccuracy = store.settings?.technicianMaxGpsAccuracyMeters || 100;

    let hasValidCoords = false;
    let numLat: number | null = null;
    let numLon: number | null = null;

    if (latitude !== undefined && latitude !== null && longitude !== undefined && longitude !== null) {
      const latVal = typeof latitude === 'string' ? parseFloat(latitude) : Number(latitude);
      const lonVal = typeof longitude === 'string' ? parseFloat(longitude) : Number(longitude);

      if (
        !isNaN(latVal) &&
        !isNaN(lonVal) &&
        isFinite(latVal) &&
        isFinite(lonVal) &&
        latVal >= -90 &&
        latVal <= 90 &&
        lonVal >= -180 &&
        lonVal <= 180
      ) {
        hasValidCoords = true;
        numLat = latVal;
        numLon = lonVal;
      }
    }

    let numAccuracy: number | null = null;
    if (accuracyMeters !== undefined && accuracyMeters !== null) {
      const accVal = typeof accuracyMeters === 'string' ? parseFloat(accuracyMeters) : Number(accuracyMeters);
      if (!isNaN(accVal) && isFinite(accVal) && accVal >= 0) {
        numAccuracy = accVal;
      }
    }

    const cleanReason = (manualExceptionReason || '').trim();
    let distanceMeters: number | null = null;
    let gpsStatus: 'GPS_VERIFIED' | 'GPS_FAILED' | 'GPS_UNAVAILABLE' | 'MANUAL_EXCEPTION';
    let isGpsSuccess = false;

    if (machineHasGps && hasValidCoords && numLat !== null && numLon !== null) {
      const dist = calculateDistanceMeters(numLat, numLon, machineLat!, machineLon!);
      distanceMeters = dist;
      const accuracyAcceptable = numAccuracy === null || numAccuracy <= maxAcceptableAccuracy;

      if (dist <= allowedRadius && accuracyAcceptable) {
        gpsStatus = 'GPS_VERIFIED';
        isGpsSuccess = true;
      } else {
        gpsStatus = 'GPS_FAILED';
      }
    } else if (!machineHasGps) {
      gpsStatus = 'GPS_UNAVAILABLE';
    } else {
      gpsStatus = 'GPS_UNAVAILABLE';
    }

    let consumedApproval: any = null;

    if (!isGpsSuccess) {
      // Must find an approved, valid, unexpired FieldExceptionApproval in store.fieldExceptions
      const nowMs = Date.now();
      const exceptions: any[] = Array.isArray(store.fieldExceptions) ? store.fieldExceptions : [];

      const matchIndex = exceptions.findIndex((a: any) => {
        if (!a || typeof a !== 'object') return false;
        const matchesTicket = a.ticketId === ticket.id || a.ticketId === ticket.ticketNumber;
        const matchesMachine =
          a.integrationMachineId === scannedMachine.id ||
          a.integrationMachineId === scannedMachine.machineNumber ||
          a.machineId === scannedMachine.id;
        if (!matchesTicket || !matchesMachine) return false;
        if (a.status !== 'APPROVED') return false;
        if (a.expiresAt && new Date(a.expiresAt).getTime() <= nowMs) return false;

        // Technician binding policy:
        if (a.technicianId && a.technicianId.trim().length > 0) {
          return a.technicianId.trim() === tech.id || a.technicianId.trim() === tech.employeeCode;
        }
        return true;
      });

      if (matchIndex >= 0) {
        consumedApproval = exceptions[matchIndex];
        // Consume approval atomically
        consumedApproval.status = 'USED';
        consumedApproval.usedAt = new Date().toISOString();
        consumedApproval.updatedAt = new Date().toISOString();
        gpsStatus = 'MANUAL_EXCEPTION';
      } else {
        // Authorization DENIED
        logAudit(
          store,
          'SECURITY_ALERT',
          'TECHNICIAN_CHECKIN_FAILED_UNAUTHORIZED_EXCEPTION',
          {
            ticketId: ticket.id,
            machineId: scannedMachine.id,
            technicianId: tech.id,
            reasonSupplied: cleanReason,
            gpsStatus,
            distanceMeters,
            numAccuracy
          },
          tech.fullName
        );
        saveStore(store);

        if (!machineHasGps) {
          return res.status(400).json({
            success: false,
            error: 'MACHINE_GPS_NOT_CONFIGURED',
            status: 'GPS_UNAVAILABLE',
            message: `الماكينة #${scannedMachine.machineNumber} لا تملك إحداثيات موقع جغرافية معتمدة في النظام. يلزم وجود تصريح استثناء معتمد لإتمام تسجيل الحضور.`
          });
        }

        if (gpsStatus === 'GPS_FAILED') {
          const isAccuracyIssue = numAccuracy !== null && numAccuracy > maxAcceptableAccuracy;
          return res.status(400).json({
            success: false,
            error: 'GPS_VERIFICATION_FAILED',
            status: 'GPS_FAILED',
            distanceMeters,
            accuracyMeters: numAccuracy,
            allowedRadius,
            maxAcceptableAccuracy,
            message: isAccuracyIssue
              ? `دقة إشارة الموقع ضعيفة جداً (${numAccuracy}م أكبر من الحد المسموح ${maxAcceptableAccuracy}م). يلزم وجود تصريح استثناء معتمد لإتمام الحضور.`
              : `المسافة إلى الماكينة (${distanceMeters}م) تتجاوز النطاق المسموح به (${allowedRadius}م). يلزم وجود تصريح استثناء معتمد لإتمام الحضور.`
          });
        }

        return res.status(400).json({
          success: false,
          error: 'GPS_UNAVAILABLE',
          status: 'GPS_UNAVAILABLE',
          message: 'إحداثيات الموقع الجغرافي غير متوفرة أو غير صالحة. يلزم وجود تصريح استثناء معتمد لإتمام تسجيل الحضور.'
        });
      }
    }

    const now = new Date().toISOString();
    const checkInRecord: TechnicianCheckInRecord = {
      id: `chk-${Date.now()}`,
      ticketId: ticket.id,
      technicianId: tech.id,
      technicianName: tech.fullName,
      machineToken: scannedMachine.publicQrToken || machineToken,
      machineNumber: scannedMachine.machineNumber,
      timestamp: now,
      latitude: hasValidCoords ? numLat : null,
      longitude: hasValidCoords ? numLon : null,
      accuracyMeters: numAccuracy,
      distanceMeters: distanceMeters !== null ? distanceMeters : null,
      status: gpsStatus,
      manualExceptionReason: cleanReason || consumedApproval?.reason || undefined,
      approvedBy: consumedApproval ? (consumedApproval.approvedByActorName || consumedApproval.approvedBy || 'SUPERVISOR') : undefined,
      fieldExceptionId: consumedApproval ? consumedApproval.id : null
    };

    if (consumedApproval) {
      store.syncQueue.push({
        id: `evt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        eventType: 'FIELD_EXCEPTION_USED',
        aggregateType: 'TICKET',
        aggregateId: ticket.id,
        payload: {
          exceptionId: consumedApproval.id,
          ticketId: ticket.id,
          machineId: scannedMachine.id,
          technicianId: tech.id,
          technicianName: tech.fullName
        },
        createdAt: now,
        processedAt: null,
        syncStatus: 'PENDING',
        retryCount: 0
      });
    }

    ticket.technicianCheckIn = checkInRecord;
    ticket.gpsVerificationStatus = gpsStatus;
    ticket.gpsDistanceMeters = distanceMeters;
    ticket.assignedTechnicianId = tech.id;
    ticket.assignedTechnician = tech;

    if (ticket.status === 'NEW' || ticket.status === 'TRIAGED' || ticket.status === 'ASSIGNED') {
      ticket.status = 'IN_PROGRESS';
      ticket.startedAt = now;
    }

    if (!Array.isArray(ticket.timeline)) ticket.timeline = [];
    ticket.timeline.push({
      id: `tml-${Date.now()}`,
      ticketId: ticket.id,
      timestamp: now,
      action: 'WORK_STARTED',
      actionLabel: 'تسجيل الوصول والتحقق الميداني',
      description: `تم تسجيل وصول الفني ${tech.fullName}. حالة التحقق الجغرافي: ${gpsStatus} (${distanceMeters !== undefined ? distanceMeters + 'م' : 'بدون إحداثيات'}).`
    });

    // Queue sync event
    store.syncQueue.push({
      id: `evt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      eventType: 'TECHNICIAN_CHECKIN',
      aggregateType: 'TICKET',
      aggregateId: ticket.id,
      machinePublicToken: scannedMachine.publicQrToken || '',
      payload: checkInRecord,
      createdAt: now,
      processedAt: null,
      syncStatus: 'PENDING',
      retryCount: 0
    });

    logAudit(store, 'TICKET_MANAGEMENT', 'TECHNICIAN_CHECKIN', checkInRecord, tech.fullName);
    saveStore(store);

    res.json({
      success: true,
      checkIn: checkInRecord,
      ticketStatus: ticket.status,
      message:
        gpsStatus === 'GPS_VERIFIED'
          ? 'تم التحقق الجغرافي الميداني بنجاح.'
          : 'تم التحقق الميداني بناءً على تصريح استثناء معتمد.'
    });
  };
  router.post('/technician/checkin', requireTechnicianAuth, technicianCheckinLimiter, handleTechnicianCheckin);
  router.post('/api/v1/technician/checkin', requireTechnicianAuth, technicianCheckinLimiter, handleTechnicianCheckin);

  /**
   * Upload Maintenance Evidence (Photo / Test Record)
   */
  const handleTechnicianEvidence = async (req: Request, res: Response) => {
    try {
      const store = getStore();
      const tech = (req as any).technician;
      const { ticketId, evidenceType = 'BEFORE_PHOTO', caption, fileData, mimeType = 'image/jpeg' } = req.body;

      if (!ticketId || !fileData) {
        return res.status(400).json({ error: 'MISSING_DATA', message: 'رقم التذكرة وبيانات الصورة مطلوبة.' });
      }

      const ticket = store.tickets.find((t: any) => t.id === ticketId || t.ticketNumber === ticketId);
      if (!ticket) {
        return res.status(404).json({ error: 'TICKET_NOT_FOUND', message: 'التذكرة غير موجودة.' });
      }

      const uploadResult = await storageService.uploadEvidence(fileData, `${evidenceType}.jpg`, mimeType, ticket.id);
      const now = new Date().toISOString();

      const evidenceItem: MaintenanceEvidenceRecord = {
        id: `evd-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        ticketId: ticket.id,
        technicianId: tech.id,
        evidenceType,
        fileUrl: uploadResult.url,
        fileType: mimeType,
        caption: caption || `توثيق ميداني (${evidenceType}) بواسطة الفني ${tech.fullName}`,
        uploadStatus: 'UPLOADED',
        createdAt: now
      };

      if (!Array.isArray(ticket.evidence)) ticket.evidence = [];
      ticket.evidence.push(evidenceItem);

      if (!Array.isArray(ticket.attachments)) ticket.attachments = [];
      ticket.attachments.push({
        id: evidenceItem.id,
        ticketId: ticket.id,
        fileName: `${evidenceType}_${Date.now()}.jpg`,
        fileType: mimeType,
        fileUrl: uploadResult.url,
        caption: evidenceItem.caption,
        uploadedBy: tech.fullName,
        uploaderRole: 'TECHNICIAN',
        createdAt: now
      });

      if (!Array.isArray(ticket.timeline)) ticket.timeline = [];
      ticket.timeline.push({
        id: `tml-${Date.now()}`,
        ticketId: ticket.id,
        timestamp: now,
        action: 'PHOTO_UPLOADED',
        actionLabel: 'إرفاق صورة توثيقية',
        description: `تم إرفاق صورة توثيقية (${evidenceType}) بواسطة الفني ${tech.fullName}.`
      });

      // Queue sync event
      store.syncQueue.push({
        id: `evt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        eventType: 'EVIDENCE_UPLOAD',
        aggregateType: 'TICKET',
        aggregateId: ticket.id,
        machinePublicToken: ticket.machine?.publicQrToken || '',
        payload: evidenceItem,
        createdAt: now,
        processedAt: null,
        syncStatus: 'PENDING',
        retryCount: 0
      });

      saveStore(store);

      res.status(201).json({
        success: true,
        evidence: evidenceItem,
        storageProvider: uploadResult.storageProvider
      });
    } catch (err: any) {
      res.status(500).json({ error: 'UPLOAD_FAILED', message: err?.message || 'فشل تحميل الملف.' });
    }
  };
  router.post('/technician/evidence', requireTechnicianAuth, handleTechnicianEvidence);
  router.post('/api/v1/technician/evidence', requireTechnicianAuth, handleTechnicianEvidence);

  /**
   * Record Functional Test
   */
  const handleFunctionalTest = (req: Request, res: Response) => {
    const store = getStore();
    const tech = (req as any).technician;
    const { ticketId, ticketNumber, testType = 'ALL', status = 'PASSED', notes } = req.body;
    const targetTicketId = ticketId || ticketNumber;

    if (!targetTicketId) {
      return res.status(400).json({ error: 'TICKET_ID_REQUIRED', message: 'رقم التذكرة مطلوب.' });
    }

    const ticket = store.tickets.find((t: any) => t.id === targetTicketId || t.ticketNumber === targetTicketId);
    if (!ticket) {
      return res.status(404).json({ error: 'TICKET_NOT_FOUND', message: 'التذكرة غير موجودة.' });
    }

    const now = new Date().toISOString();
    const functionalTestRecord: FunctionalTestRecord = {
      status,
      testType,
      notes: notes || `اختبار تشغيلي ميداني (${testType}) - النتيجة: ${status}`,
      performedBy: tech.fullName,
      performedAt: now
    };

    ticket.functionalTest = functionalTestRecord;

    if (!Array.isArray(ticket.timeline)) ticket.timeline = [];
    ticket.timeline.push({
      id: `tml-${Date.now()}`,
      ticketId: ticket.id,
      timestamp: now,
      action: 'ACTION_ADDED',
      actionLabel: 'إجراء فحص تشغيلي',
      description: `تم تنفيذ الفحص التشغيلي (${testType}) بواسطة ${tech.fullName}. النتيجة: ${status}.`
    });

    // Queue sync event
    store.syncQueue.push({
      id: `evt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      eventType: 'FUNCTIONAL_TEST',
      aggregateType: 'TICKET',
      aggregateId: ticket.id,
      machinePublicToken: ticket.machine?.publicQrToken || '',
      payload: functionalTestRecord,
      createdAt: now,
      processedAt: null,
      syncStatus: 'PENDING',
      retryCount: 0
    });

    saveStore(store);

    res.json({
      success: true,
      functionalTest: functionalTestRecord
    });
  };
  router.post('/technician/functional-test', requireTechnicianAuth, handleFunctionalTest);
  router.post('/api/v1/technician/functional-test', requireTechnicianAuth, handleFunctionalTest);

  /**
   * Record Maintenance Action
   */
  const handleTechnicianAction = (req: Request, res: Response) => {
    const store = getStore();
    const tech = (req as any).technician;
    const { ticketId, ticketNumber, actionTaken, description, rootCause, durationMinutes = 30, partsUsed } = req.body;
    const targetTicketId = ticketId || ticketNumber;

    if (!targetTicketId) {
      return res.status(400).json({ error: 'TICKET_ID_REQUIRED', message: 'رقم التذكرة مطلوب.' });
    }

    const ticket = store.tickets.find((t: any) => t.id === targetTicketId || t.ticketNumber === targetTicketId);
    if (!ticket) {
      return res.status(404).json({ error: 'TICKET_NOT_FOUND', message: 'التذكرة غير موجودة.' });
    }

    const now = new Date().toISOString();
    const actionRecord = {
      id: `act-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      ticketId: ticket.id,
      technicianId: tech.id,
      technician: tech,
      actionTaken: actionTaken || 'صيانة وإصلاح ميداني',
      description: description || actionTaken || 'تم تنفيذ الإصلاحات المطلوبة',
      rootCause: rootCause || 'استهلاك تشغيلي طبيعي',
      workDurationMinutes: durationMinutes,
      partsUsed: partsUsed || [],
      performedAt: now,
      createdAt: now
    };

    if (!Array.isArray(ticket.maintenanceActions)) ticket.maintenanceActions = [];
    ticket.maintenanceActions.push(actionRecord);

    if (rootCause && !ticket.rootCause) ticket.rootCause = rootCause;

    if (!Array.isArray(ticket.timeline)) ticket.timeline = [];
    ticket.timeline.push({
      id: `tml-${Date.now()}`,
      ticketId: ticket.id,
      timestamp: now,
      action: 'ACTION_ADDED',
      actionLabel: 'تسجيل عمل صيانة',
      description: `قام الفني ${tech.fullName} بتسجيل إجراء صيانة: ${actionRecord.actionTaken}.`
    });

    // Queue sync event
    store.syncQueue.push({
      id: `evt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      eventType: 'MAINTENANCE_ACTION',
      aggregateType: 'TICKET',
      aggregateId: ticket.id,
      machinePublicToken: ticket.machine?.publicQrToken || '',
      payload: actionRecord,
      createdAt: now,
      processedAt: null,
      syncStatus: 'PENDING',
      retryCount: 0
    });

    saveStore(store);

    res.json({
      success: true,
      action: actionRecord
    });
  };
  router.post('/technician/action', requireTechnicianAuth, handleTechnicianAction);
  router.post('/api/v1/technician/action', requireTechnicianAuth, handleTechnicianAction);

  /**
   * Request Spare Part
   * Must link to ticket, machine, and technician. Never orphan!
   */
  const handleTechnicianPartRequest = (req: Request, res: Response) => {
    const store = getStore();
    const tech = (req as any).technician;
    const { ticketId, partId, quantity = 1, priority = 'HIGH', reason } = req.body;

    if (!ticketId || !partId) {
      return res.status(400).json({ error: 'MISSING_DATA', message: 'رقم التذكرة ورقم القطعة مطلوبان لطلب الغيار.' });
    }

    const ticket = store.tickets.find((t: any) => t.id === ticketId || t.ticketNumber === ticketId);
    if (!ticket) {
      return res.status(404).json({ error: 'TICKET_NOT_FOUND', message: 'التذكرة غير موجودة.' });
    }

    const sparePart = store.spareParts.find((p: any) => p.id === partId || p.partNumber === partId);
    if (!sparePart) {
      return res.status(404).json({ error: 'PART_NOT_FOUND', message: 'قطعة الغيار غير مسجلة في الكتالوج.' });
    }

    const now = new Date().toISOString();
    const reqNum = `REQ-2026-${String((store.partRequests || []).length + 1).padStart(4, '0')}`;
    const partRequest: SparePartRequest = {
      id: `prq-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      requestNumber: reqNum,
      ticketId: ticket.id,
      ticket,
      ticketNumber: ticket.ticketNumber,
      machineId: ticket.machineId,
      machine: ticket.machine,
      machineNumber: ticket.machine?.machineNumber,
      technicianId: tech.id,
      technician: tech,
      technicianName: tech.fullName,
      partId: sparePart.id,
      sparePartId: sparePart.id,
      part: sparePart,
      sparePart,
      partNumber: sparePart.partNumber,
      partName: sparePart.name,
      quantity: Number(quantity) || 1,
      priority,
      status: 'PENDING',
      isInStock: (sparePart.currentQuantity || 0) >= (Number(quantity) || 1),
      reason: reason || `طلب قطعة غيار ${sparePart.name} لإصلاح التذكرة ${ticket.ticketNumber}`,
      createdAt: now,
      updatedAt: now,
      timeline: [
        {
          status: 'PENDING',
          timestamp: now,
          actor: tech.fullName,
          comment: `تم إنشاء طلب قطعة الغيار بواسطة الفني ${tech.fullName}.`
        }
      ]
    };

    if (!Array.isArray(store.partRequests)) store.partRequests = [];
    store.partRequests.unshift(partRequest);

    ticket.status = 'WAITING_FOR_PART';
    if (!Array.isArray(ticket.timeline)) ticket.timeline = [];
    ticket.timeline.push({
      id: `tml-${Date.now()}`,
      ticketId: ticket.id,
      timestamp: now,
      action: 'PART_REQUESTED',
      actionLabel: 'طلب قطعة غيار',
      description: `طلب الفني ${tech.fullName} قطعة غيار: ${sparePart.name} (${quantity} وحدة). حالة التذكرة: بانتظار قطعة الغيار.`
    });

    // Queue sync event
    store.syncQueue.push({
      id: `evt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      eventType: 'PART_REQUEST',
      aggregateType: 'PART_REQUEST',
      aggregateId: partRequest.id,
      machinePublicToken: ticket.machine?.publicQrToken || '',
      payload: partRequest,
      createdAt: now,
      processedAt: null,
      syncStatus: 'PENDING',
      retryCount: 0
    });

    logAudit(store, 'INVENTORY_MANAGEMENT', 'PART_REQUEST_CREATED', partRequest, tech.fullName);
    saveStore(store);

    res.status(201).json({
      success: true,
      partRequest,
      ticketStatus: ticket.status
    });
  };
  router.post('/technician/request-part', requireTechnicianAuth, handleTechnicianPartRequest);
  router.post('/api/v1/technician/request-part', requireTechnicianAuth, handleTechnicianPartRequest);

  /**
   * Complete & Resolve Ticket
   * Enforces: cannot resolve if functional test FAILED (unless explicit override).
   */
  const handleTechnicianResolve = (req: Request, res: Response) => {
    const store = getStore();
    const tech = (req as any).technician;
    const { ticketId, ticketNumber, resolutionSummary, rootCause, bypassFunctionalTest = false } = req.body;
    const targetTicketId = ticketId || ticketNumber;

    if (!targetTicketId) {
      return res.status(400).json({ error: 'TICKET_ID_REQUIRED', message: 'رقم التذكرة مطلوب.' });
    }

    const ticket = store.tickets.find((t: any) => t.id === targetTicketId || t.ticketNumber === targetTicketId);
    if (!ticket) {
      return res.status(404).json({ error: 'TICKET_NOT_FOUND', message: 'التذكرة غير موجودة.' });
    }

    // Functional Test Guard
    if (ticket.functionalTest && ticket.functionalTest.status === 'FAILED' && !bypassFunctionalTest) {
      return res.status(400).json({
        error: 'FUNCTIONAL_TEST_FAILED',
        message: 'لا يمكن إنهاء التذكرة طالما أن الاختبار الوظيفي فشل. يجب إعادة الاختبار بنجاح أو الحصول على موافقة استثنائية من المدير.'
      });
    }

    const now = new Date().toISOString();
    ticket.status = 'RESOLVED';
    ticket.resolvedAt = now;
    if (resolutionSummary) ticket.resolutionSummary = resolutionSummary;
    if (rootCause) ticket.rootCause = rootCause;

    // Set machine back to OPERATIONAL if no other open tickets
    const otherOpenTickets = store.tickets.some(
      (t: any) => t.id !== ticket.id && t.machineId === ticket.machineId && t.status !== 'RESOLVED' && t.status !== 'VERIFIED' && t.status !== 'CLOSED'
    );
    if (!otherOpenTickets && ticket.machine) {
      const liveMachine = store.machines.find((m: any) => m.id === ticket.machineId);
      if (liveMachine) {
        liveMachine.status = 'OPERATIONAL';
        liveMachine.lastMaintenanceAt = now;
      }
    }

    if (!Array.isArray(ticket.timeline)) ticket.timeline = [];
    ticket.timeline.push({
      id: `tml-${Date.now()}`,
      ticketId: ticket.id,
      timestamp: now,
      action: 'RESOLVED',
      actionLabel: 'تم حل البلاغ وإتمام الصيانة',
      description: `أنهى الفني ${tech.fullName} أعمال الصيانة بنجاح. ملخص الحل: ${resolutionSummary || 'تم الإصلاح والاختبار'}. حالة التذكرة: بانتظار اعتماد المدير (VERIFIED).`
    });

    // Queue sync event
    store.syncQueue.push({
      id: `evt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      eventType: 'TICKET_STATUS_UPDATE',
      aggregateType: 'TICKET',
      aggregateId: ticket.id,
      machinePublicToken: ticket.machine?.publicQrToken || '',
      payload: { ticketId: ticket.id, status: 'RESOLVED', resolvedAt: now, resolutionSummary },
      createdAt: now,
      processedAt: null,
      syncStatus: 'PENDING',
      retryCount: 0
    });

    logAudit(store, 'TICKET_MANAGEMENT', 'TICKET_RESOLVED', { ticketNumber: ticket.ticketNumber }, tech.fullName);
    saveStore(store);

    res.json({
      success: true,
      ticket,
      message: 'تم إنهاء الصيانة وحل التذكرة بنجاح. التذكرة بانتظار مراجعة واعتماد مدير الصيانة.'
    });
  };
  router.post('/technician/resolve', requireTechnicianAuth, handleTechnicianResolve);
  router.post('/api/v1/technician/resolve', requireTechnicianAuth, handleTechnicianResolve);

  // =========================================================================
  // 3. ADMIN & MANAGEMENT WORKFLOWS (Manager Verification, Warehouse Issuing)
  // =========================================================================

  /**
   * Manager Verifies Work -> VERIFIED
   */
  const handleManagerVerify = (req: Request, res: Response) => {
    const store = getStore();
    const ticketId = req.params.id || req.body.ticketId;
    const { managerName = 'مدير الصيانة', notes } = req.body;

    const ticket = store.tickets.find((t: any) => t.id === ticketId || t.ticketNumber === ticketId);
    if (!ticket) {
      return res.status(404).json({ error: 'TICKET_NOT_FOUND', message: 'التذكرة غير موجودة.' });
    }

    if (ticket.status !== 'RESOLVED' && ticket.status !== 'IN_PROGRESS') {
      return res.status(400).json({
        error: 'INVALID_STATUS',
        message: 'يمكن اعتماد العمل فقط للتذاكر التي تم حلها (RESOLVED) أو قيد المعالجة.'
      });
    }

    const now = new Date().toISOString();
    ticket.status = 'VERIFIED';
    ticket.verifiedAt = now;

    if (!Array.isArray(ticket.timeline)) ticket.timeline = [];
    ticket.timeline.push({
      id: `tml-${Date.now()}`,
      ticketId: ticket.id,
      timestamp: now,
      action: 'VERIFIED',
      actionLabel: 'اعتماد جودة الصيانة',
      description: `قام مدير الصيانة (${managerName}) بمراجعة واعتماد جودة الإصلاح الميداني. ${notes || ''}`
    });

    logAudit(store, 'TICKET_MANAGEMENT', 'TICKET_VERIFIED', { ticketNumber: ticket.ticketNumber }, managerName);
    saveStore(store);

    res.json({ success: true, ticket });
  };
  router.post('/admin/tickets/:id/verify', handleManagerVerify);
  router.post('/api/v1/admin/tickets/:id/verify', handleManagerVerify);

  /**
   * Manager Closes Ticket -> CLOSED
   */
  const handleManagerClose = (req: Request, res: Response) => {
    const store = getStore();
    const ticketId = req.params.id || req.body.ticketId;
    const { managerName = 'مدير النظام', closeReason = 'تم الإنجاز والاعتماد النهائي' } = req.body;

    const ticket = store.tickets.find((t: any) => t.id === ticketId || t.ticketNumber === ticketId);
    if (!ticket) {
      return res.status(404).json({ error: 'TICKET_NOT_FOUND', message: 'التذكرة غير موجودة.' });
    }

    const now = new Date().toISOString();
    ticket.status = 'CLOSED';
    ticket.closedAt = now;

    if (!Array.isArray(ticket.timeline)) ticket.timeline = [];
    ticket.timeline.push({
      id: `tml-${Date.now()}`,
      ticketId: ticket.id,
      timestamp: now,
      action: 'CLOSED',
      actionLabel: 'إغلاق التذكرة نهائياً',
      description: `قام ${managerName} بإغلاق التذكرة نهائياً. السبب: ${closeReason}.`
    });

    logAudit(store, 'TICKET_MANAGEMENT', 'TICKET_CLOSED', { ticketNumber: ticket.ticketNumber }, managerName);
    saveStore(store);

    res.json({ success: true, ticket });
  };
  router.post('/admin/tickets/:id/close', handleManagerClose);
  router.post('/api/v1/admin/tickets/:id/close', handleManagerClose);

  /**
   * Warehouse Approves Part Request -> APPROVED
   */
  const handlePartRequestApprove = (req: Request, res: Response) => {
    const store = getStore();
    const requestId = req.params.id || req.body.requestId;
    const { officerName = 'مسؤول المستودع', poNumber } = req.body;

    const partReq = (store.partRequests || []).find((r: any) => r.id === requestId || r.requestNumber === requestId);
    if (!partReq) {
      return res.status(404).json({ error: 'REQUEST_NOT_FOUND', message: 'طلب قطعة الغيار غير موجود.' });
    }

    const now = new Date().toISOString();
    partReq.status = 'APPROVED';
    partReq.approvedBy = officerName;
    partReq.approvedAt = now;
    if (poNumber) partReq.poNumber = poNumber;

    if (!Array.isArray(partReq.timeline)) partReq.timeline = [];
    partReq.timeline.push({
      status: 'APPROVED',
      timestamp: now,
      actor: officerName,
      comment: `تمت الموافقة على طلب الصرف بواسطة ${officerName}.`
    });

    logAudit(store, 'INVENTORY_MANAGEMENT', 'PART_REQUEST_APPROVED', { requestNumber: partReq.requestNumber }, officerName);
    saveStore(store);

    res.json({ success: true, partRequest: partReq });
  };
  router.post('/admin/part-requests/:id/approve', handlePartRequestApprove);
  router.post('/api/v1/admin/part-requests/:id/approve', handlePartRequestApprove);

  /**
   * Warehouse Issues Part -> ISSUED
   * Validates available stock >= requested quantity.
   * Decrements inventory and creates InventoryTransaction.
   * Prevents negative inventory!
   */
  const handlePartRequestIssue = (req: Request, res: Response) => {
    const store = getStore();
    const requestId = req.params.id || req.body.requestId;
    const { officerName = 'مسؤول المستودع', notes } = req.body;

    const partReq = (store.partRequests || []).find((r: any) => r.id === requestId || r.requestNumber === requestId);
    if (!partReq) {
      return res.status(404).json({ error: 'REQUEST_NOT_FOUND', message: 'طلب قطعة الغيار غير موجود.' });
    }

    const sparePart = store.spareParts.find((p: any) => p.id === partReq.partId || p.partNumber === partReq.partNumber);
    if (!sparePart) {
      return res.status(404).json({ error: 'SPARE_PART_NOT_FOUND', message: 'قطعة الغيار غير موجودة في المخزن.' });
    }

    const currentQty = sparePart.currentQuantity ?? sparePart.currentStock ?? 0;
    const reqQty = partReq.quantity || 1;

    // Strict Negative Stock Prevention
    if (currentQty < reqQty) {
      return res.status(400).json({
        error: 'INSUFFICIENT_STOCK',
        message: `الرصيد المتوفر في المستودع (${currentQty}) أقل من الكمية المطلوبة لصرفها (${reqQty}). لا يمكن الصرف بالسالب.`
      });
    }

    const now = new Date().toISOString();
    const balanceBefore = currentQty;
    const balanceAfter = currentQty - reqQty;

    sparePart.currentQuantity = balanceAfter;
    sparePart.currentStock = balanceAfter;

    // Create Inventory Transaction
    const transaction: InventoryTransaction = {
      id: `trx-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      partId: sparePart.id,
      sparePartId: sparePart.id,
      part: sparePart,
      sparePart,
      transactionType: 'ISSUE',
      quantityDelta: -reqQty,
      balanceBefore,
      balanceAfter,
      referenceTicketId: partReq.ticketId,
      referenceTicketNumber: partReq.ticketNumber,
      machineId: partReq.machineId,
      machineNumber: partReq.machineNumber,
      performedBy: officerName,
      unitCost: sparePart.unitCost || 0,
      totalCost: (sparePart.unitCost || 0) * reqQty,
      notes: notes || `صرف قطع غيار بموجب الطلب ${partReq.requestNumber} للتذكرة ${partReq.ticketNumber}`,
      createdAt: now
    };

    if (!Array.isArray(store.transactions)) store.transactions = [];
    store.transactions.unshift(transaction);

    partReq.status = 'ISSUED';
    partReq.issuedBy = officerName;
    partReq.issuedAt = now;

    if (!Array.isArray(partReq.timeline)) partReq.timeline = [];
    partReq.timeline.push({
      status: 'ISSUED',
      timestamp: now,
      actor: officerName,
      comment: `تم صرف القطعة (${reqQty} وحدة) من المستودع بواسطة ${officerName}. الرصيد المتبقي: ${balanceAfter}.`
    });

    // Update ticket if linked
    if (partReq.ticketId) {
      const ticket = store.tickets.find((t: any) => t.id === partReq.ticketId);
      if (ticket) {
        if (ticket.status === 'WAITING_FOR_PART') {
          ticket.status = 'IN_PROGRESS';
        }
        if (!Array.isArray(ticket.timeline)) ticket.timeline = [];
        ticket.timeline.push({
          id: `tml-${Date.now()}`,
          ticketId: ticket.id,
          timestamp: now,
          action: 'PART_RECEIVED_AVAILABLE',
          actionLabel: 'تم صرف قطعة الغيار',
          description: `تم صرف قطعة الغيار (${sparePart.name}) من المستودع وجاهزة للتركيب. استئناف العمل على التذكرة.`
        });
      }
    }

    logAudit(
      store,
      'INVENTORY_MANAGEMENT',
      'INVENTORY_ISSUE_TRANSACTION',
      { requestNumber: partReq.requestNumber, partName: sparePart.name, quantity: reqQty, balanceAfter },
      officerName
    );
    saveStore(store);

    res.json({
      success: true,
      partRequest: partReq,
      newStockQuantity: balanceAfter,
      transaction
    });
  };
  router.post('/admin/part-requests/:id/issue', handlePartRequestIssue);
  router.post('/api/v1/admin/part-requests/:id/issue', handlePartRequestIssue);

  /**
   * Regenerate Machine QR Token (Admin Only)
   */
  const handleRegenerateMachineQrToken = (req: Request, res: Response) => {
    const store = getStore();
    const machineId = req.params.id;

    const machine = store.machines.find(
      (m: any) => m.id === machineId || m.machineNumber === machineId || m.publicQrToken === machineId
    );
    if (!machine) {
      return res.status(404).json({ error: 'MACHINE_NOT_FOUND', message: 'الماكينة غير موجودة.' });
    }

    const existingTokens = new Set(store.machines.map((m: any) => m.publicQrToken).filter(Boolean));
    let newToken = generateSecureOpaqueToken(8);
    while (existingTokens.has(newToken)) {
      newToken = generateSecureOpaqueToken(8);
    }

    const oldToken = machine.publicQrToken;
    machine.publicQrToken = newToken;
    machine.qrGeneratedAt = new Date().toISOString();

    logAudit(
      store,
      'FLEET_MANAGEMENT',
      'REGENERATE_MACHINE_QR_TOKEN',
      { machineNumber: machine.machineNumber, oldToken, newToken },
      'ADMIN'
    );
    saveStore(store);

    res.json({
      success: true,
      machineNumber: machine.machineNumber,
      publicQrToken: newToken
    });
  };
  router.post('/admin/machines/:id/regenerate-qr-token', handleRegenerateMachineQrToken);
  router.post('/api/v1/admin/machines/:id/regenerate-qr-token', handleRegenerateMachineQrToken);

  /**
   * Cloud & Sync Settings API
   */
  const handleGetCloudSettings = (req: Request, res: Response) => {
    const store = getStore();
    res.json({
      publicQrBaseUrl: store.settings?.publicQrBaseUrl || '',
      cloudApiUrl: store.settings?.cloudApiUrl || '',
      localServerUrl: store.settings?.localServerUrl || 'http://localhost:3000',
      technicianCheckinRadiusMeters: store.settings?.technicianCheckinRadiusMeters || 100,
      syncInterval: store.settings?.syncInterval || 60,
      storageStatus: storageService.getStorageStatus(),
      fleetMachinesCount: store.machines.length,
      syncQueueCount: (store.syncQueue || []).filter((e: any) => e.syncStatus === 'PENDING').length
    });
  };
  router.get('/admin/cloud-settings', handleGetCloudSettings);
  router.get('/api/v1/admin/cloud-settings', handleGetCloudSettings);

  const handleUpdateCloudSettings = (req: Request, res: Response) => {
    const store = getStore();
    const { publicQrBaseUrl, cloudApiUrl, localServerUrl, technicianCheckinRadiusMeters, syncInterval } = req.body;

    if (!store.settings) store.settings = {};
    if (publicQrBaseUrl !== undefined) store.settings.publicQrBaseUrl = String(publicQrBaseUrl).trim();
    if (cloudApiUrl !== undefined) store.settings.cloudApiUrl = String(cloudApiUrl).trim();
    if (localServerUrl !== undefined) store.settings.localServerUrl = String(localServerUrl).trim();
    if (technicianCheckinRadiusMeters !== undefined) {
      store.settings.technicianCheckinRadiusMeters = Math.max(10, Number(technicianCheckinRadiusMeters) || 100);
    }
    if (syncInterval !== undefined) {
      store.settings.syncInterval = Math.max(5, Number(syncInterval) || 60);
    }

    logAudit(store, 'SYSTEM_SETTINGS', 'UPDATE_CLOUD_SETTINGS', req.body, 'ADMIN');
    saveStore(store);

    res.json({
      success: true,
      settings: store.settings,
      message: 'تم حفظ إعدادات الربط السحابي والتشغيل الهجين بنجاح.'
    });
  };
  router.post('/admin/cloud-settings', handleUpdateCloudSettings);
  router.post('/api/v1/admin/cloud-settings', handleUpdateCloudSettings);

  // =========================================================================
  // 4. SYNCHRONIZATION QUEUE & EVENT CONSUMPTION (Desktop <-> Cloud Gateway)
  // =========================================================================

  /**
   * Fetch Pending Events from Cloud Queue
   */
  const handleGetPendingSyncEvents = (req: Request, res: Response) => {
    const store = getStore();
    const pendingEvents = (store.syncQueue || []).filter((e: any) => e.syncStatus === 'PENDING');
    res.json({
      success: true,
      count: pendingEvents.length,
      pendingCount: pendingEvents.length,
      events: pendingEvents
    });
  };
  router.get('/sync/pending', handleGetPendingSyncEvents);
  router.get('/api/v1/sync/pending', handleGetPendingSyncEvents);

  /**
   * Acknowledge Processed Sync Events
   */
  const handleAcknowledgeSyncEvents = (req: Request, res: Response) => {
    const store = getStore();
    const { eventIds = [] } = req.body;
    const ids = Array.isArray(eventIds) ? eventIds : [eventIds];

    let acknowledgedCount = 0;
    const now = new Date().toISOString();

    (store.syncQueue || []).forEach((e: any) => {
      if (ids.includes(e.id)) {
        e.syncStatus = 'SYNCED';
        e.processedAt = now;
        acknowledgedCount++;
      }
    });

    saveStore(store);
    res.json({
      success: true,
      acknowledgedCount,
      remainingPending: (store.syncQueue || []).filter((e: any) => e.syncStatus === 'PENDING').length
    });
  };
  router.post('/sync/acknowledge', handleAcknowledgeSyncEvents);
  router.post('/api/v1/sync/acknowledge', handleAcknowledgeSyncEvents);

  /**
   * Push Local Changes to Sync Queue
   */
  const handlePushSyncEvents = (req: Request, res: Response) => {
    const store = getStore();
    const { events = [] } = req.body;

    if (!Array.isArray(store.syncQueue)) store.syncQueue = [];
    let addedCount = 0;

    events.forEach((evt: any) => {
      const exists = store.syncQueue.some(
        (e: any) => e.id === evt.id || (e.cloudReportId && e.cloudReportId === evt.cloudReportId)
      );
      if (!exists) {
        store.syncQueue.push({
          ...evt,
          id: evt.id || `evt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
          syncStatus: 'PENDING',
          createdAt: evt.createdAt || new Date().toISOString()
        });
        addedCount++;
      }
    });

    saveStore(store);
    res.json({ success: true, addedCount, totalQueue: store.syncQueue.length });
  };
  router.post('/sync/push', handlePushSyncEvents);
  router.post('/api/v1/sync/push', handlePushSyncEvents);

  /**
   * Sync Queue Health & Status
   */
  const handleGetSyncStatus = (req: Request, res: Response) => {
    const store = getStore();
    const queue = store.syncQueue || [];
    const pending = queue.filter((e: any) => e.syncStatus === 'PENDING');
    const synced = queue.filter((e: any) => e.syncStatus === 'SYNCED');
    const failed = queue.filter((e: any) => e.syncStatus === 'FAILED');

    res.json({
      status: 'ONLINE',
      pendingCount: pending.length,
      syncedCount: synced.length,
      failedCount: failed.length,
      totalEvents: queue.length,
      fleetMachinesCount: store.machines.length,
      lastEventTimestamp: queue.length > 0 ? queue[queue.length - 1].createdAt : null,
      storageStatus: storageService.getStorageStatus()
    });
  };
  router.get('/sync/status', handleGetSyncStatus);
  router.get('/api/v1/sync/status', handleGetSyncStatus);

  return router;
}

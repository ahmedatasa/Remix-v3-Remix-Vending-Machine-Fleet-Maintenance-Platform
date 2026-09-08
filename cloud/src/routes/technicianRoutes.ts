import { Router, Request, Response } from 'express';
import { AuthService } from '../services/authService';
import { TicketService } from '../services/ticketService';
import { LocationService } from '../services/locationService';
import { requireCloudTechnicianAuth } from '../middleware/technicianAuth';
import { createCloudRateLimiter } from '../middleware/rateLimiter';
import { cloudStorage } from '../storage/cloudStorage';

export const technicianRoutes = Router();

// Rate limiters
const loginLimiter = createCloudRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: 'تم قفل محاولات تسجيل الدخول مؤقتاً بسبب تكرار المحاولات الفاشلة (الحد الأقصى: 5 محاولات). يرجى الانتظار 15 دقيقة.'
});

const checkinLimiter = createCloudRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: 'تم تجاوز الحد المسموح به لعمليات التحقق الميداني (20 محاولة لكل 10 دقائق).'
});

/**
 * POST /technician/login
 */
technicianRoutes.post('/technician/login', loginLimiter, async (req: Request, res: Response) => {
  const { identifier, employeeCode, username, email, password, pin } = req.body;
  const id = identifier || employeeCode || username || email;
  const secret = password || pin;

  try {
    const result = await AuthService.loginTechnician(id, secret, req.ip);
    res.json(result);
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.startsWith('CREDENTIALS_REQUIRED:')) {
      return res.status(400).json({ error: 'CREDENTIALS_REQUIRED', message: msg.replace('CREDENTIALS_REQUIRED: ', '') });
    }
    if (msg.startsWith('TECHNICIAN_NOT_AUTHORIZED:')) {
      return res.status(401).json({ error: 'TECHNICIAN_NOT_AUTHORIZED', message: msg.replace('TECHNICIAN_NOT_AUTHORIZED: ', '') });
    }
    if (msg.startsWith('TECHNICIAN_ACCOUNT_DISABLED:')) {
      return res.status(403).json({ error: 'TECHNICIAN_ACCOUNT_DISABLED', message: msg.replace('TECHNICIAN_ACCOUNT_DISABLED: ', '') });
    }
    if (msg.startsWith('TECHNICIAN_CREDENTIALS_NOT_CONFIGURED:')) {
      return res.status(403).json({ error: 'TECHNICIAN_CREDENTIALS_NOT_CONFIGURED', message: msg.replace('TECHNICIAN_CREDENTIALS_NOT_CONFIGURED: ', '') });
    }
    if (msg.startsWith('INVALID_CREDENTIALS:')) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: msg.replace('INVALID_CREDENTIALS: ', '') });
    }
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'حدث خطأ في عملية تسجيل الدخول.' });
  }
});

/**
 * POST /technician/logout
 */
technicianRoutes.post('/technician/logout', requireCloudTechnicianAuth, async (req: Request, res: Response) => {
  const tokenHash = (req as any).sessionTokenHash;
  await AuthService.logoutTechnician(tokenHash);
  res.json({ success: true, message: 'تم تسجيل الخروج بنجاح وإلغاء صلاحية الجلسة.' });
});

/**
 * GET /technician/me
 */
technicianRoutes.get('/technician/me', requireCloudTechnicianAuth, (req: Request, res: Response) => {
  const tech = (req as any).technician;
  res.json({
    technician: tech,
    sessionExpiresAt: (req as any).technicianSession?.expiresAt
  });
});

/**
 * POST /technician/checkin
 */
technicianRoutes.post('/technician/checkin', checkinLimiter, requireCloudTechnicianAuth, async (req: Request, res: Response) => {
  const tech = (req as any).technician;
  const { ticketId, machineToken, coordinates, manualExceptionReason } = req.body;

  if (!ticketId || !machineToken) {
    return res.status(400).json({
      error: 'PARAMS_REQUIRED',
      message: 'معرف البلاغ ورمز الماكينة مطلوبان لإتمام التحقق الميداني.'
    });
  }

  try {
    const result = await TicketService.performTechnicianCheckin({
      ticketId,
      machineToken,
      technicianId: tech.id,
      technicianName: tech.fullName,
      coordinates,
      manualExceptionReason,
      clientIp: req.ip
    });

    res.json({
      success: true,
      checkin: result.checkin,
      ticketStatus: result.ticket.status,
      message: result.checkin.manualException
        ? 'تم تسجيل الحضور الميداني بناءً على استثناء تشغيلي معتمد.'
        : 'تم التحقق من الوجود الميداني في نطاق الماكينة بنجاح.'
    });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.startsWith('TICKET_NOT_FOUND:')) {
      return res.status(404).json({ error: 'TICKET_NOT_FOUND', message: msg.replace('TICKET_NOT_FOUND: ', '') });
    }
    if (msg.startsWith('MACHINE_NOT_FOUND:')) {
      return res.status(404).json({ error: 'MACHINE_NOT_FOUND', message: msg.replace('MACHINE_NOT_FOUND: ', '') });
    }
    if (msg.includes('MACHINE_GPS_NOT_CONFIGURED:')) {
      const clean = msg.replace('GPS_VALIDATION_FAILED: ', '').replace('MACHINE_GPS_NOT_CONFIGURED: ', '');
      return res.status(400).json({ error: 'MACHINE_GPS_NOT_CONFIGURED', status: 'GPS_UNAVAILABLE', message: clean });
    }
    if (msg.startsWith('GPS_VALIDATION_FAILED:')) {
      return res.status(400).json({ error: 'GPS_VALIDATION_FAILED', message: msg.replace('GPS_VALIDATION_FAILED: ', '') });
    }
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'حدث خطأ أثناء إجراء التحقق الميداني.' });
  }
});

/**
 * POST /technician/evidence
 * Upload maintenance evidence (image base64 or buffer)
 */
technicianRoutes.post('/technician/evidence', requireCloudTechnicianAuth, async (req: Request, res: Response) => {
  const tech = (req as any).technician;
  const { ticketId, imageBase64, mimeType = 'image/jpeg', caption } = req.body;

  if (!ticketId || !imageBase64) {
    return res.status(400).json({
      error: 'PARAMS_REQUIRED',
      message: 'معرف البلاغ وبيانات الصورة مطلوبة لرفع الدليل الميداني.'
    });
  }

  try {
    // Strip data url prefix if present
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const uploadResult = await cloudStorage.upload({
      buffer,
      mimeType,
      ticketId,
      technicianId: tech.id
    });

    const result = await TicketService.attachEvidence({
      ticketId,
      technicianId: tech.id,
      technicianName: tech.fullName,
      uploadResult,
      caption
    });

    res.json({
      success: true,
      evidence: result.evidence,
      message: 'تم رفع وتوثيق صورة الدليل الميداني في التخزين السحابي بنجاح.'
    });
  } catch (err: any) {
    return res.status(400).json({
      error: 'EVIDENCE_UPLOAD_FAILED',
      message: err.message || 'فشل رفع وتوثيق صورة الدليل الميداني.'
    });
  }
});

/**
 * POST /technician/action
 */
technicianRoutes.post('/technician/action', requireCloudTechnicianAuth, async (req: Request, res: Response) => {
  const tech = (req as any).technician;
  const { ticketId, actionType = 'MAINTENANCE_WORK', description } = req.body;

  if (!ticketId || !description) {
    return res.status(400).json({
      error: 'PARAMS_REQUIRED',
      message: 'معرف البلاغ وتفاصيل الإجراء المنفذ مطلوبة.'
    });
  }

  try {
    const result = await TicketService.addTechnicianAction({
      ticketId,
      technicianId: tech.id,
      technicianName: tech.fullName,
      actionType,
      description
    });

    res.json({
      success: true,
      action: result.action,
      message: 'تم تسجيل إجراء الصيانة بنجاح.'
    });
  } catch (err: any) {
    return res.status(404).json({ error: 'ACTION_FAILED', message: err.message });
  }
});

/**
 * POST /technician/test
 */
technicianRoutes.post('/technician/test', requireCloudTechnicianAuth, async (req: Request, res: Response) => {
  const tech = (req as any).technician;
  const { ticketId, testType = 'DISPENSE_TEST', passed, notes } = req.body;

  if (!ticketId || typeof passed !== 'boolean') {
    return res.status(400).json({
      error: 'PARAMS_REQUIRED',
      message: 'معرف البلاغ ونتيجة الاختبار (ناجح/راسب) مطلوبة.'
    });
  }

  try {
    const result = await TicketService.addFunctionalTest({
      ticketId,
      technicianId: tech.id,
      technicianName: tech.fullName,
      testType,
      passed,
      notes
    });

    res.json({
      success: true,
      test: result.test,
      message: 'تم توثيق نتيجة الاختبار الوظيفي للماكينة بنجاح.'
    });
  } catch (err: any) {
    return res.status(404).json({ error: 'TEST_FAILED', message: err.message });
  }
});

/**
 * POST /technician/part-request
 */
technicianRoutes.post('/technician/part-request', requireCloudTechnicianAuth, async (req: Request, res: Response) => {
  const tech = (req as any).technician;
  const { ticketId, partName, quantityRequested = 1, reason, partId } = req.body;

  try {
    const result = await TicketService.requestSparePart({
      ticketId,
      technicianId: tech.id,
      technicianName: tech.fullName,
      partName,
      quantityRequested,
      reason,
      partId
    });

    res.json({
      success: true,
      partRequest: result.partRequest,
      message: 'تم إرسال طلب قطعة الغيار لمسؤول المستودع للاعتماد والتسليم.'
    });
  } catch (err: any) {
    return res.status(400).json({ error: 'PART_REQUEST_FAILED', message: err.message });
  }
});

/**
 * POST /technician/resolve
 */
technicianRoutes.post('/technician/resolve', requireCloudTechnicianAuth, async (req: Request, res: Response) => {
  const tech = (req as any).technician;
  const { ticketId, summary = 'تمت معالجة العطل واختبار الماكينة بنجاح.' } = req.body;

  try {
    const result = await TicketService.resolveTicket({
      ticketId,
      technicianId: tech.id,
      technicianName: tech.fullName,
      summary
    });

    res.json({
      success: true,
      ticket: result.ticket,
      message: 'تم إغلاق البلاغ بنجاح وتحديث حالته إلى "تم الحل".'
    });
  } catch (err: any) {
    return res.status(404).json({ error: 'RESOLVE_FAILED', message: err.message });
  }
});

/**
 * POST /technician/propose-location
 * Submit machine location proposal from field device
 */
technicianRoutes.post('/technician/propose-location', requireCloudTechnicianAuth, async (req: Request, res: Response) => {
  const tech = (req as any).technician;
  const { machineTokenOrId, machineId, publicQrToken, latitude, longitude, accuracyMeters, ticketId } = req.body;

  const target = machineTokenOrId || machineId || publicQrToken;
  if (!target) {
    return res.status(400).json({
      error: 'PARAMS_REQUIRED',
      message: 'رمز أو معرف الماكينة مطلوب لتقديم المقترح.'
    });
  }

  try {
    const proposal = await LocationService.submitProposal({
      machineTokenOrId: target,
      latitude: Number(latitude),
      longitude: Number(longitude),
      accuracyMeters: Number(accuracyMeters),
      technicianId: tech.id,
      technicianName: tech.fullName,
      ticketId,
      clientIp: req.ip
    });

    res.json({
      success: true,
      proposal,
      message: 'تم تقديم مقترح إحداثيات موقع الماكينة بنجاح وبانتظار الاعتماد.'
    });
  } catch (err: any) {
    return res.status(400).json({ error: 'PROPOSAL_FAILED', message: err.message });
  }
});

/**
 * GET /technician/machine-location/:tokenOrId
 * Check machine coordinates and pending proposals
 */
technicianRoutes.get('/technician/machine-location/:tokenOrId', requireCloudTechnicianAuth, async (req: Request, res: Response) => {
  try {
    const details = await LocationService.getMachineLocationDetails(req.params.tokenOrId);
    res.json({
      success: true,
      ...details
    });
  } catch (err: any) {
    return res.status(404).json({ error: 'NOT_FOUND', message: err.message });
  }
});


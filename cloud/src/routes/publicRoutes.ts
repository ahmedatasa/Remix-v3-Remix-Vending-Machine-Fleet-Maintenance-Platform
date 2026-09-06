import { Router, Request, Response } from 'express';
import { cloudDb } from '../db/cloudDb';
import { cloudConfig } from '../config/cloudConfig';
import { TicketService } from '../services/ticketService';
import { createCloudRateLimiter } from '../middleware/rateLimiter';

export const publicRoutes = Router();

// Rate limiters
const customerReportLimiter = createCloudRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: 'تم تجاوز الحد المسموح به لرفع البلاغات من هذا العنوان (5 بلاغات لكل 10 دقائق). يرجى الانتظار.'
});

const ticketTrackingLimiter = createCloudRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'تم تجاوز الحد المسموح به للاستعلام عن البلاغات (60 طلب بالدقيقة). يرجى الانتظار.'
});

/**
 * GET /public/config
 */
publicRoutes.get('/public/config', (req: Request, res: Response) => {
  res.json({
    configured: !!cloudConfig.publicQrBaseUrl,
    publicQrBaseUrl: cloudConfig.publicQrBaseUrl,
    supportPhone: '800-123-4567',
    supportEmail: 'support@ksu-vending.edu.sa',
    service: 'KSU Vending Fleet Cloud Gateway',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /public/m/:token
 * Lookup sanitized machine by opaque public QR token.
 * Returns 404 if invalid. Never returns private costs, serial numbers, or technicians.
 */
publicRoutes.get('/public/m/:token', (req: Request, res: Response) => {
  const token = req.params.token;
  const machine = cloudDb.findMachineByQrToken(token);

  if (!machine) {
    cloudDb.logAudit('ANONYMOUS', token, 'Anonymous Scanner', 'INVALID_QR_LOOKUP', 'MACHINE_REGISTRY', 'FAILURE', {
      token,
      ip: req.ip
    });
    return res.status(404).json({
      error: 'INVALID_QR_TOKEN',
      message: 'عذراً، رمز الـ QR الممسوح غير صالح أو غير مرتبط بماكينة في الأسطول.'
    });
  }

  // Return strictly sanitized public fields only
  res.json({
    publicQrToken: machine.publicQrToken,
    machineNumber: machine.machineNumber,
    model: machine.model,
    publicDisplayName: machine.publicDisplayName,
    machineType: machine.machineType,
    buildingPublicName: machine.buildingPublicName,
    locationPublicName: machine.locationPublicName,
    active: machine.active
  });
});

/**
 * POST /public/m/:token/report
 * Customer fault report submission.
 */
publicRoutes.post('/public/m/:token/report', customerReportLimiter, (req: Request, res: Response) => {
  const token = req.params.token;
  const { category, description, reporterName, reporterPhone, reporterEmail, cloudReportId } = req.body;

  try {
    const result = TicketService.submitCustomerFaultReport({
      publicQrToken: token,
      category,
      description,
      reporterName,
      reporterPhone,
      reporterEmail,
      cloudReportId: cloudReportId || (req.headers['x-idempotency-key'] as string),
      clientIp: req.ip
    });

    res.status(result.isDuplicate ? 200 : 201).json({
      success: true,
      ticketNumber: result.ticket.id,
      trackingToken: result.ticket.trackingToken,
      status: result.ticket.status,
      createdAt: result.ticket.createdAt,
      message: result.isDuplicate
        ? 'تم استلام هذا البلاغ مسبقاً بنجاح. يمكنك متابعة حالته برمز التتبع.'
        : 'تم تسجيل بلاغ العطل بنجاح وسيتولى الفريق الميداني معالجته فوراً.'
    });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.startsWith('INVALID_QR_TOKEN:')) {
      return res.status(404).json({ error: 'INVALID_QR_TOKEN', message: msg.replace('INVALID_QR_TOKEN: ', '') });
    }
    if (msg.startsWith('DESCRIPTION_REQUIRED:')) {
      return res.status(400).json({ error: 'DESCRIPTION_REQUIRED', message: msg.replace('DESCRIPTION_REQUIRED: ', '') });
    }
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'حدث خطأ أثناء معالجة البلاغ.' });
  }
});

/**
 * GET /public/ticket/:trackingToken
 * Public ticket status query by opaque tracking token.
 */
publicRoutes.get('/public/ticket/:trackingToken', ticketTrackingLimiter, (req: Request, res: Response) => {
  const trackingToken = req.params.trackingToken;

  try {
    const data = TicketService.getPublicTicketTracking(trackingToken, req.ip);
    res.json(data);
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.startsWith('INVALID_TRACKING_TOKEN:')) {
      return res.status(400).json({ error: 'INVALID_TRACKING_TOKEN', message: msg.replace('INVALID_TRACKING_TOKEN: ', '') });
    }
    if (msg.startsWith('TICKET_NOT_FOUND:')) {
      return res.status(404).json({ error: 'TICKET_NOT_FOUND', message: msg.replace('TICKET_NOT_FOUND: ', '') });
    }
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'حدث خطأ أثناء الاستعلام عن حالة البلاغ.' });
  }
});

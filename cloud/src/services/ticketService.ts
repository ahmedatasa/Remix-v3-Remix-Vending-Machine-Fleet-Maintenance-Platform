import crypto from 'crypto';
import { cloudDb, CloudTicket, SanitizedCloudMachine } from '../db/cloudDb';
import { GpsService, GpsCoordinates } from './gpsService';
import { StorageUploadResult } from '../storage/cloudStorage';

export interface PublicTicketResponse {
  trackingToken: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  category: string;
  submittedAt: string;
  lastUpdatedAt: string;
  publicStatusDescription: string;
  machineSummary: {
    machineType: string;
    buildingName: string;
    locationDescription: string;
  };
}

export class TicketService {
  /**
   * Submit customer fault report via opaque public QR token.
   * Idempotent: repeated identical submissions with the same cloudReportId do not duplicate tickets.
   */
  public static submitCustomerFaultReport(params: {
    publicQrToken: string;
    category: string;
    description: string;
    reporterName?: string;
    reporterPhone?: string;
    reporterEmail?: string;
    cloudReportId?: string;
    clientIp?: string;
  }): { ticket: CloudTicket; isDuplicate: boolean } {
    const {
      publicQrToken,
      category,
      description,
      reporterName = 'عميل عبر رمز QR',
      reporterPhone = '',
      reporterEmail = '',
      cloudReportId,
      clientIp
    } = params;

    const cleanToken = (publicQrToken || '').trim().toUpperCase();
    const machine = cloudDb.findMachineByQrToken(cleanToken);

    if (!machine) {
      cloudDb.logAudit('ANONYMOUS', 'QR_SCANNER', 'Anonymous Customer', 'INVALID_QR_REPORT', 'PUBLIC_PORTAL', 'FAILURE', {
        publicQrToken,
        ip: clientIp
      });
      throw new Error('INVALID_QR_TOKEN: عذراً، رمز الـ QR الممسوح غير صالح أو غير مرتبط بماكينة في الأسطول السحابي.');
    }

    if (!description || !description.trim()) {
      throw new Error('DESCRIPTION_REQUIRED: يرجى كتابة وصف موجز للمشكلة التي واجهتها.');
    }

    // Check Idempotency via cloudReportId
    const safeReportId = cloudReportId || `rpt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const existing = cloudDb.findTicketByReportId(safeReportId);
    if (existing) {
      return { ticket: existing, isDuplicate: true };
    }

    const now = new Date().toISOString();
    // High-entropy tracking token (starts with TRK-)
    const trackingToken = `TRK-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const ticketId = `cld-tck-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const newTicket: CloudTicket = {
      id: ticketId,
      cloudReportId: safeReportId,
      trackingToken,
      integrationMachineId: machine.integrationMachineId,
      publicQrToken: machine.publicQrToken,
      category: category || 'OTHER',
      description: description.trim(),
      reporterName: reporterName.trim(),
      reporterPhone: reporterPhone.trim(),
      reporterEmail: reporterEmail.trim(),
      status: 'OPEN',
      syncStatus: 'PENDING',
      createdAt: now,
      updatedAt: now,
      checkins: [],
      actions: [],
      evidence: [],
      functionalTests: [],
      partRequests: []
    };

    cloudDb.insertTicket(newTicket);

    // Push event to sync buffer for desktop sync worker
    cloudDb.pushSyncEvent('CUSTOMER_TICKET_CREATED', newTicket.id, {
      ticketId: newTicket.id,
      cloudReportId: newTicket.cloudReportId,
      trackingToken: newTicket.trackingToken,
      integrationMachineId: newTicket.integrationMachineId,
      publicQrToken: newTicket.publicQrToken,
      category: newTicket.category,
      description: newTicket.description,
      reporterName: newTicket.reporterName,
      reporterPhone: newTicket.reporterPhone,
      reporterEmail: newTicket.reporterEmail,
      createdAt: newTicket.createdAt
    });

    cloudDb.logAudit('CUSTOMER', trackingToken, newTicket.reporterName, 'CUSTOMER_TICKET_CREATED', 'TICKET', 'SUCCESS', {
      ticketId: newTicket.id,
      machineId: machine.integrationMachineId,
      category: newTicket.category,
      ip: clientIp
    });

    return { ticket: newTicket, isDuplicate: false };
  }

  /**
   * Public Ticket Tracking:
   * Accepts ONLY valid TRK-* tracking tokens.
   * Rejects internal ticket IDs (e.g. TCK-*) or database IDs.
   * Returns sanitized public data.
   */
  public static getPublicTicketTracking(trackingToken: string, clientIp?: string): PublicTicketResponse {
    const raw = (trackingToken || '').trim().toUpperCase();

    // Strict validation: Must start with TRK- and have sufficient length
    if (!raw.startsWith('TRK-') || raw.length < 8) {
      cloudDb.logAudit('ANONYMOUS', raw, 'Anonymous Querier', 'INVALID_TRACKING_QUERY', 'TICKET_TRACKING', 'BLOCKED', {
        trackingToken: raw,
        reason: 'FORBIDDEN_IDENTIFIER_FORMAT',
        ip: clientIp
      });
      throw new Error('INVALID_TRACKING_TOKEN: رمز التتبع غير صالح. يجب استخدام رمز التتبع العشوائي الخاص بالبلاغ (يبدأ بـ TRK-).');
    }

    const ticket = cloudDb.findTicketByTrackingToken(raw);
    if (!ticket) {
      throw new Error('TICKET_NOT_FOUND: لم يتم العثور على بلاغ مطابق لرمز التتبع المدخل.');
    }

    const machine = cloudDb.findMachineByIntegrationId(ticket.integrationMachineId);

    const statusDescriptions: Record<string, string> = {
      OPEN: 'تم استلام البلاغ وهو بانتظار تعيين ومباشرة الفني المختص.',
      IN_PROGRESS: 'الفني متواجد ميدانياً وجارٍ تشخيص وصيانة الماكينة.',
      RESOLVED: 'تمت معالجة العطل واختبار الماكينة بنجاح، وعادت للخدمة.',
      CLOSED: 'تم إغلاق البلاغ نهائياً.'
    };

    return {
      trackingToken: ticket.trackingToken,
      status: ticket.status,
      category: ticket.category,
      submittedAt: ticket.createdAt,
      lastUpdatedAt: ticket.updatedAt,
      publicStatusDescription: statusDescriptions[ticket.status] || 'جارٍ متابعة حالة البلاغ.',
      machineSummary: {
        machineType: machine?.machineType || 'ماكينة بيع ذاتي',
        buildingName: machine?.buildingPublicName || 'مبنى الماكينة',
        locationDescription: machine?.locationPublicName || 'موقع الماكينة'
      }
    };
  }

  /**
   * Technician Field Check-In with GPS verification
   */
  public static performTechnicianCheckin(params: {
    ticketId: string;
    machineToken: string;
    technicianId: string;
    technicianName: string;
    coordinates?: GpsCoordinates | null;
    manualException?: { approvedBy: string; reason: string; approverRole?: string };
    clientIp?: string;
  }): { checkin: any; ticket: CloudTicket } {
    const { ticketId, machineToken, technicianId, technicianName, coordinates, manualException, clientIp } = params;

    const ticket = cloudDb.findTicketById(ticketId);
    if (!ticket) {
      throw new Error('TICKET_NOT_FOUND: البلاغ المطلوب غير موجود.');
    }

    const machine = cloudDb.findMachineByQrToken(machineToken) || cloudDb.findMachineByIntegrationId(ticket.integrationMachineId);
    if (!machine) {
      throw new Error('MACHINE_NOT_FOUND: رمز الماكينة غير صالح أو غير مرتبط بسجل معتمد.');
    }

    // Authoritative Backend GPS Validation
    const validation = GpsService.validateFieldPresence(coordinates, machine, manualException);

    if (!validation.verified) {
      cloudDb.logAudit('TECHNICIAN', technicianId, technicianName, 'TECHNICIAN_CHECKIN_FAILED', 'TICKET', 'FAILURE', {
        ticketId,
        validation,
        coordinates,
        ip: clientIp
      });
      throw new Error(`GPS_VALIDATION_FAILED: ${validation.message}`);
    }

    const now = new Date().toISOString();
    const checkinRecord = {
      id: `chk-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      ticketId,
      technicianId,
      technicianName,
      timestamp: now,
      latitude: coordinates?.latitude || 0,
      longitude: coordinates?.longitude || 0,
      accuracyMeters: validation.accuracyMeters,
      distanceMeters: validation.distanceMeters,
      verified: true,
      status: validation.status,
      manualException: manualException ? {
        approvedBy: manualException.approvedBy,
        reason: manualException.reason,
        approverRole: manualException.approverRole || 'SUPERVISOR',
        timestamp: now
      } : undefined
    };

    ticket.checkins.push(checkinRecord);
    if (ticket.status === 'OPEN') {
      ticket.status = 'IN_PROGRESS';
    }
    ticket.updatedAt = now;
    cloudDb.save();

    // Push sync event
    cloudDb.pushSyncEvent('TECHNICIAN_CHECKIN', ticket.id, {
      ticketId: ticket.id,
      checkin: checkinRecord,
      updatedAt: now
    });

    cloudDb.logAudit('TECHNICIAN', technicianId, technicianName, 'TECHNICIAN_CHECKIN_SUCCESS', 'TICKET', 'SUCCESS', {
      ticketId,
      status: validation.status,
      distanceMeters: validation.distanceMeters,
      ip: clientIp
    });

    return { checkin: checkinRecord, ticket };
  }

  /**
   * Record Technician Maintenance Action
   */
  public static addTechnicianAction(params: {
    ticketId: string;
    technicianId: string;
    technicianName: string;
    actionType: string;
    description: string;
  }): { action: any; ticket: CloudTicket } {
    const { ticketId, technicianId, technicianName, actionType, description } = params;

    const ticket = cloudDb.findTicketById(ticketId);
    if (!ticket) {
      throw new Error('TICKET_NOT_FOUND: البلاغ المطلوب غير موجود.');
    }

    const now = new Date().toISOString();
    const actionRecord = {
      id: `act-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      ticketId,
      technicianId,
      technicianName,
      actionType,
      description: description.trim(),
      timestamp: now
    };

    ticket.actions.push(actionRecord);
    ticket.updatedAt = now;
    cloudDb.save();

    cloudDb.pushSyncEvent('TECHNICIAN_ACTION', ticket.id, {
      ticketId: ticket.id,
      action: actionRecord,
      updatedAt: now
    });

    return { action: actionRecord, ticket };
  }

  /**
   * Attach Evidence Metadata to Ticket
   */
  public static attachEvidence(params: {
    ticketId: string;
    technicianId: string;
    technicianName: string;
    uploadResult: StorageUploadResult;
    caption?: string;
  }): { evidence: any; ticket: CloudTicket } {
    const { ticketId, technicianId, technicianName, uploadResult, caption = '' } = params;

    const ticket = cloudDb.findTicketById(ticketId);
    if (!ticket) {
      throw new Error('TICKET_NOT_FOUND: البلاغ المطلوب غير موجود.');
    }

    const now = new Date().toISOString();
    const evidenceRecord = {
      id: `evi-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      ticketId,
      technicianId,
      technicianName,
      objectKey: uploadResult.objectKey,
      url: uploadResult.url,
      mimeType: uploadResult.mimeType,
      sizeBytes: uploadResult.sizeBytes,
      sha256: uploadResult.sha256,
      caption: caption.trim(),
      timestamp: now
    };

    ticket.evidence.push(evidenceRecord);
    ticket.updatedAt = now;
    cloudDb.save();

    cloudDb.pushSyncEvent('EVIDENCE_ADDED', ticket.id, {
      ticketId: ticket.id,
      evidence: evidenceRecord,
      updatedAt: now
    });

    return { evidence: evidenceRecord, ticket };
  }

  /**
   * Record Functional Test
   */
  public static addFunctionalTest(params: {
    ticketId: string;
    technicianId: string;
    technicianName: string;
    testType: string;
    passed: boolean;
    notes?: string;
  }): { test: any; ticket: CloudTicket } {
    const { ticketId, technicianId, technicianName, testType, passed, notes = '' } = params;

    const ticket = cloudDb.findTicketById(ticketId);
    if (!ticket) {
      throw new Error('TICKET_NOT_FOUND: البلاغ المطلوب غير موجود.');
    }

    const now = new Date().toISOString();
    const testRecord = {
      id: `tst-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      ticketId,
      technicianId,
      technicianName,
      testType,
      passed,
      notes: notes.trim(),
      timestamp: now
    };

    ticket.functionalTests.push(testRecord);
    ticket.updatedAt = now;
    cloudDb.save();

    cloudDb.pushSyncEvent('FUNCTIONAL_TEST_COMPLETED', ticket.id, {
      ticketId: ticket.id,
      functionalTest: testRecord,
      updatedAt: now
    });

    return { test: testRecord, ticket };
  }

  /**
   * Request Spare Part from Field
   * Sets status 'REQUESTED'. Never modifies inventory stock directly from Cloud.
   */
  public static requestSparePart(params: {
    ticketId: string;
    technicianId: string;
    technicianName: string;
    partName: string;
    quantityRequested: number;
    reason: string;
    partId?: string;
  }): { partRequest: any; ticket: CloudTicket } {
    const { ticketId, technicianId, technicianName, partName, quantityRequested, reason, partId } = params;

    const ticket = cloudDb.findTicketById(ticketId);
    if (!ticket) {
      throw new Error('TICKET_NOT_FOUND: البلاغ المطلوب غير موجود.');
    }

    if (!partName.trim()) {
      throw new Error('PART_NAME_REQUIRED: اسم القطعة المطلوبة إلزامي.');
    }
    if (quantityRequested <= 0) {
      throw new Error('INVALID_QUANTITY: الكمية المطلوبة يجب أن تكون 1 أو أكثر.');
    }

    const now = new Date().toISOString();
    const partRequestRecord = {
      id: `prq-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      ticketId,
      technicianId,
      technicianName,
      partId,
      partName: partName.trim(),
      quantityRequested,
      reason: reason.trim(),
      status: 'REQUESTED' as const,
      timestamp: now
    };

    ticket.partRequests.push(partRequestRecord);
    ticket.updatedAt = now;
    cloudDb.save();

    cloudDb.pushSyncEvent('PART_REQUEST_CREATED', ticket.id, {
      ticketId: ticket.id,
      partRequest: partRequestRecord,
      updatedAt: now
    });

    return { partRequest: partRequestRecord, ticket };
  }

  /**
   * Resolve Ticket with Summary
   */
  public static resolveTicket(params: {
    ticketId: string;
    technicianId: string;
    technicianName: string;
    summary: string;
  }): { ticket: CloudTicket } {
    const { ticketId, technicianId, technicianName, summary } = params;

    const ticket = cloudDb.findTicketById(ticketId);
    if (!ticket) {
      throw new Error('TICKET_NOT_FOUND: البلاغ المطلوب غير موجود.');
    }

    const now = new Date().toISOString();
    ticket.status = 'RESOLVED';
    ticket.resolutionSummary = summary.trim();
    ticket.updatedAt = now;
    cloudDb.save();

    cloudDb.pushSyncEvent('TICKET_RESOLVED', ticket.id, {
      ticketId: ticket.id,
      resolutionSummary: ticket.resolutionSummary,
      resolvedBy: technicianName,
      resolvedAt: now
    });

    cloudDb.logAudit('TECHNICIAN', technicianId, technicianName, 'TICKET_RESOLVED', 'TICKET', 'SUCCESS', {
      ticketId: ticket.id,
      summary: ticket.resolutionSummary
    });

    return { ticket };
  }
}

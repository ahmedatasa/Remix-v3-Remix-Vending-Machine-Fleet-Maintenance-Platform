import crypto from 'crypto';
import type { CloudTicket } from '../db/cloudDb';
import { getCloudRepository } from '../repositories';
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
  public static async submitCustomerFaultReport(params: {
    publicQrToken: string;
    category: string;
    description: string;
    reporterName?: string;
    reporterPhone?: string;
    reporterEmail?: string;
    cloudReportId?: string;
    clientIp?: string;
  }): Promise<{ ticket: CloudTicket; isDuplicate: boolean }> {
    const repo = getCloudRepository();
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
    const machine = await repo.machines.findByQrToken(cleanToken);

    if (!machine) {
      await repo.audit.log({
        actorType: 'ANONYMOUS',
        actorId: 'QR_SCANNER',
        actorName: 'Anonymous Customer',
        action: 'INVALID_QR_REPORT',
        entity: 'PUBLIC_PORTAL',
        result: 'FAILURE',
        details: {
          publicQrToken,
          ip: clientIp
        },
        ip: clientIp
      });
      throw new Error('INVALID_QR_TOKEN: عذراً، رمز الـ QR الممسوح غير صالح أو غير مرتبط بماكينة في الأسطول السحابي.');
    }

    if (!description || !description.trim()) {
      throw new Error('DESCRIPTION_REQUIRED: يرجى كتابة وصف موجز للمشكلة التي واجهتها.');
    }

    // Check Idempotency via cloudReportId or idempotency repository
    const safeReportId = cloudReportId || `rpt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const existing = await repo.tickets.findByReportId(safeReportId);
    if (existing) {
      return { ticket: existing, isDuplicate: true };
    }

    const cachedIdempotency = await repo.idempotency.get(safeReportId);
    if (cachedIdempotency && cachedIdempotency.ticketId) {
      const existingCached = await repo.tickets.findById(cachedIdempotency.ticketId);
      if (existingCached) {
        return { ticket: existingCached, isDuplicate: true };
      }
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

    await repo.tickets.createTicket(newTicket);
    await repo.idempotency.set(safeReportId, {
      ticketId: newTicket.id,
      trackingToken: newTicket.trackingToken
    });

    // Push event to sync buffer for desktop sync worker
    await repo.syncEvents.pushEvent('CUSTOMER_TICKET_CREATED', newTicket.id, {
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

    await repo.audit.log({
      actorType: 'CUSTOMER',
      actorId: trackingToken,
      actorName: newTicket.reporterName,
      action: 'CUSTOMER_TICKET_CREATED',
      entity: 'TICKET',
      result: 'SUCCESS',
      details: {
        ticketId: newTicket.id,
        machineId: machine.integrationMachineId,
        category: newTicket.category,
        ip: clientIp
      },
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
  public static async getPublicTicketTracking(trackingToken: string, clientIp?: string): Promise<PublicTicketResponse> {
    const repo = getCloudRepository();
    const raw = (trackingToken || '').trim().toUpperCase();

    // Strict validation: Must start with TRK- and have sufficient length
    if (!raw.startsWith('TRK-') || raw.length < 8) {
      await repo.audit.log({
        actorType: 'ANONYMOUS',
        actorId: raw,
        actorName: 'Anonymous Querier',
        action: 'INVALID_TRACKING_QUERY',
        entity: 'TICKET_TRACKING',
        result: 'BLOCKED',
        details: {
          trackingToken: raw,
          reason: 'FORBIDDEN_IDENTIFIER_FORMAT',
          ip: clientIp
        },
        ip: clientIp
      });
      throw new Error('INVALID_TRACKING_TOKEN: رمز التتبع غير صالح. يجب استخدام رمز التتبع العشوائي الخاص بالبلاغ (يبدأ بـ TRK-).');
    }

    const ticket = await repo.tickets.findByTrackingToken(raw);
    if (!ticket) {
      throw new Error('TICKET_NOT_FOUND: لم يتم العثور على بلاغ مطابق لرمز التتبع المدخل.');
    }

    const machine = await repo.machines.findByIntegrationId(ticket.integrationMachineId);

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
  public static async performTechnicianCheckin(params: {
    ticketId: string;
    machineToken: string;
    technicianId: string;
    technicianName: string;
    coordinates?: GpsCoordinates | null;
    manualException?: { approvedBy: string; reason: string; approverRole?: string };
    clientIp?: string;
  }): Promise<{ checkin: any; ticket: CloudTicket }> {
    const repo = getCloudRepository();
    const { ticketId, machineToken, technicianId, technicianName, coordinates, manualException, clientIp } = params;

    const ticket = await repo.tickets.findById(ticketId);
    if (!ticket) {
      throw new Error('TICKET_NOT_FOUND: البلاغ المطلوب غير موجود.');
    }

    const machine = (await repo.machines.findByQrToken(machineToken)) || (await repo.machines.findByIntegrationId(ticket.integrationMachineId));
    if (!machine) {
      throw new Error('MACHINE_NOT_FOUND: رمز الماكينة غير صالح أو غير مرتبط بسجل معتمد.');
    }

    // Check for pre-authorized field exception if GPS validation needs it
    let effectiveManualException = manualException;
    let consumedApprovalId: string | undefined;

    if (!effectiveManualException) {
      const activeApproval = await repo.fieldExceptions.findValidForTicketAndMachine(ticketId, machine.integrationMachineId);
      if (activeApproval) {
        effectiveManualException = {
          approvedBy: activeApproval.approvedByActorName,
          reason: activeApproval.reason,
          approverRole: 'SUPERVISOR'
        };
        consumedApprovalId = activeApproval.id;
      }
    }

    // Authoritative Backend GPS Validation
    const validation = GpsService.validateFieldPresence(coordinates, machine, effectiveManualException);

    if (!validation.verified) {
      await repo.audit.log({
        actorType: 'TECHNICIAN',
        actorId: technicianId,
        actorName: technicianName,
        action: 'TECHNICIAN_CHECKIN_FAILED',
        entity: 'TICKET',
        result: 'FAILURE',
        details: {
          ticketId,
          validation,
          coordinates,
          ip: clientIp
        },
        ip: clientIp
      });
      throw new Error(`GPS_VALIDATION_FAILED: ${validation.message}`);
    }

    // If an approved field exception was consumed, mark it used in database
    if (consumedApprovalId) {
      await repo.fieldExceptions.consumeApproval(consumedApprovalId);
      await repo.syncEvents.pushEvent('FIELD_EXCEPTION_USED', ticketId, {
        exceptionId: consumedApprovalId,
        ticketId,
        machineId: machine.integrationMachineId,
        technicianId,
        technicianName
      });
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
      fieldExceptionId: consumedApprovalId,
      manualException: effectiveManualException ? {
        approvedBy: effectiveManualException.approvedBy,
        reason: effectiveManualException.reason,
        approverRole: effectiveManualException.approverRole || 'SUPERVISOR',
        timestamp: now
      } : undefined
    };

    await repo.tickets.addCheckin(checkinRecord);
    if (ticket.status === 'OPEN') {
      await repo.tickets.updateTicketStatus(ticket.id, 'IN_PROGRESS');
    }

    // Push sync event
    await repo.syncEvents.pushEvent('TECHNICIAN_CHECKIN', ticket.id, {
      ticketId: ticket.id,
      checkin: checkinRecord,
      updatedAt: now
    });

    await repo.audit.log({
      actorType: 'TECHNICIAN',
      actorId: technicianId,
      actorName: technicianName,
      action: 'TECHNICIAN_CHECKIN_SUCCESS',
      entity: 'TICKET',
      result: 'SUCCESS',
      details: {
        ticketId,
        status: validation.status,
        distanceMeters: validation.distanceMeters,
        ip: clientIp
      },
      ip: clientIp
    });

    const updatedTicket = (await repo.tickets.findById(ticket.id)) || ticket;
    return { checkin: checkinRecord, ticket: updatedTicket };
  }

  /**
   * Record Technician Maintenance Action
   */
  public static async addTechnicianAction(params: {
    ticketId: string;
    technicianId: string;
    technicianName: string;
    actionType: string;
    description: string;
  }): Promise<{ action: any; ticket: CloudTicket }> {
    const repo = getCloudRepository();
    const { ticketId, technicianId, technicianName, actionType, description } = params;

    const ticket = await repo.tickets.findById(ticketId);
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

    await repo.tickets.addAction(actionRecord);

    await repo.syncEvents.pushEvent('TECHNICIAN_ACTION', ticket.id, {
      ticketId: ticket.id,
      action: actionRecord,
      updatedAt: now
    });

    const updatedTicket = (await repo.tickets.findById(ticket.id)) || ticket;
    return { action: actionRecord, ticket: updatedTicket };
  }

  /**
   * Attach Evidence Metadata to Ticket
   */
  public static async attachEvidence(params: {
    ticketId: string;
    technicianId: string;
    technicianName: string;
    uploadResult: StorageUploadResult;
    caption?: string;
  }): Promise<{ evidence: any; ticket: CloudTicket }> {
    const repo = getCloudRepository();
    const { ticketId, technicianId, technicianName, uploadResult, caption = '' } = params;

    const ticket = await repo.tickets.findById(ticketId);
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

    await repo.tickets.addEvidence(evidenceRecord);

    await repo.syncEvents.pushEvent('EVIDENCE_ADDED', ticket.id, {
      ticketId: ticket.id,
      evidence: evidenceRecord,
      updatedAt: now
    });

    const updatedTicket = (await repo.tickets.findById(ticket.id)) || ticket;
    return { evidence: evidenceRecord, ticket: updatedTicket };
  }

  /**
   * Record Functional Test
   */
  public static async addFunctionalTest(params: {
    ticketId: string;
    technicianId: string;
    technicianName: string;
    testType: string;
    passed: boolean;
    notes?: string;
  }): Promise<{ test: any; ticket: CloudTicket }> {
    const repo = getCloudRepository();
    const { ticketId, technicianId, technicianName, testType, passed, notes = '' } = params;

    const ticket = await repo.tickets.findById(ticketId);
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

    await repo.tickets.addFunctionalTest(testRecord);

    await repo.syncEvents.pushEvent('FUNCTIONAL_TEST_COMPLETED', ticket.id, {
      ticketId: ticket.id,
      functionalTest: testRecord,
      updatedAt: now
    });

    const updatedTicket = (await repo.tickets.findById(ticket.id)) || ticket;
    return { test: testRecord, ticket: updatedTicket };
  }

  /**
   * Request Spare Part from Field
   * Sets status 'REQUESTED'. Never modifies inventory stock directly from Cloud.
   */
  public static async requestSparePart(params: {
    ticketId: string;
    technicianId: string;
    technicianName: string;
    partName: string;
    quantityRequested: number;
    reason: string;
    partId?: string;
  }): Promise<{ partRequest: any; ticket: CloudTicket }> {
    const repo = getCloudRepository();
    const { ticketId, technicianId, technicianName, partName, quantityRequested, reason, partId } = params;

    const ticket = await repo.tickets.findById(ticketId);
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

    await repo.tickets.addPartRequest(partRequestRecord);

    await repo.syncEvents.pushEvent('PART_REQUEST_CREATED', ticket.id, {
      ticketId: ticket.id,
      partRequest: partRequestRecord,
      updatedAt: now
    });

    const updatedTicket = (await repo.tickets.findById(ticket.id)) || ticket;
    return { partRequest: partRequestRecord, ticket: updatedTicket };
  }

  /**
   * Resolve Ticket with Summary
   */
  public static async resolveTicket(params: {
    ticketId: string;
    technicianId: string;
    technicianName: string;
    summary: string;
  }): Promise<{ ticket: CloudTicket }> {
    const repo = getCloudRepository();
    const { ticketId, technicianId, technicianName, summary } = params;

    const ticket = await repo.tickets.findById(ticketId);
    if (!ticket) {
      throw new Error('TICKET_NOT_FOUND: البلاغ المطلوب غير موجود.');
    }

    const now = new Date().toISOString();
    await repo.tickets.updateTicketStatus(ticket.id, 'RESOLVED', summary.trim());

    await repo.syncEvents.pushEvent('TICKET_RESOLVED', ticket.id, {
      ticketId: ticket.id,
      resolutionSummary: summary.trim(),
      resolvedBy: technicianName,
      resolvedAt: now
    });

    await repo.audit.log({
      actorType: 'TECHNICIAN',
      actorId: technicianId,
      actorName: technicianName,
      action: 'TICKET_RESOLVED',
      entity: 'TICKET',
      result: 'SUCCESS',
      details: {
        ticketId: ticket.id,
        summary: summary.trim()
      }
    });

    const updatedTicket = (await repo.tickets.findById(ticket.id)) || ticket;
    return { ticket: updatedTicket };
  }
}

import crypto from 'crypto';
import type { AssignmentSyncResult } from './cloudTicketAssignmentClient';
import type { CloudManualTicketSyncResult } from './cloudManualTicketClient';

export function createMainTicketAssignmentHandler(deps: {
  getStore: () => any;
  saveStore: (store?: any) => void;
  sync: (req: any, ticket: any) => Promise<AssignmentSyncResult>;
  ensureCloud?: (
    req: any,
    ticket: any,
    machine: any
  ) => Promise<CloudManualTicketSyncResult>;
}) {
  const busy = new Set<string>();
  return async (req: any, res: any) => {
    if (!req.user || !['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER'].includes(req.user.role)) {
      return res.status(403).json({ error: 'ASSIGNMENT_ROLE_FORBIDDEN' });
    }
    const store = deps.getStore();
    const ticket = (store.tickets || []).find((t: any) => t.id === req.params.id || t.ticketNumber === req.params.id);
    if (!ticket || ticket.isDeleted) return res.status(404).json({ error: 'Ticket not found' });
    const techId = req.body?.technician_id || req.body?.technicianId;
    const tech = (store.technicians || []).find((t: any) => t.id === techId);
    if (!tech || tech.isDeleted || tech.isActive === false || ['DISABLED', 'INACTIVE'].includes(tech.status)) {
      return res.status(400).json({ error: 'الفني المحدد غير موجود أو غير نشط.' });
    }
    if (['RESOLVED', 'VERIFIED', 'CLOSED', 'CANCELLED'].includes(ticket.status)) {
      return res.status(409).json({ error: 'لا يمكن إسناد بلاغ منتهي.' });
    }
    if (busy.has(ticket.id)) return res.status(409).json({ error: 'إسناد هذا البلاغ قيد التنفيذ؛ انتظر اكتماله.' });
    busy.add(ticket.id);
    try {
      // Manual/legacy Main tickets must have a Cloud counterpart
      // before assignment because technicians work from Cloud.
      if (!ticket.cloudTicketId) {
        if (!deps.ensureCloud) {
          ticket.cloudCreationSync = {
            status: 'FAILED',
            reason: 'CLOUD_TICKET_CREATE_UNAVAILABLE'
          };
          deps.saveStore(store);
          return res.status(503).json({
            error: 'CLOUD_TICKET_CREATE_UNAVAILABLE'
          });
        }

        const machine = (store.machines || []).find(
          (m: any) => m.id === ticket.machineId
        );

        if (!machine) {
          ticket.cloudCreationSync = {
            status: 'FAILED',
            reason: 'MACHINE_NOT_FOUND'
          };
          deps.saveStore(store);
          return res.status(409).json({
            error: 'MACHINE_NOT_FOUND'
          });
        }

        let createResult: CloudManualTicketSyncResult;

        try {
          createResult = await deps.ensureCloud(
            req,
            { ...ticket },
            { ...machine }
          );
        } catch {
          createResult = {
            status: 'FAILED',
            reason: 'CLOUD_OUTCOME_UNCONFIRMED'
          };
        }

        ticket.cloudCreationSync = createResult;

        if (
          createResult.status !== 'SYNCED' ||
          !createResult.cloudTicketId
        ) {
          deps.saveStore(store);
          return res.status(503).json({
            error: 'CLOUD_TICKET_CREATE_FAILED',
            reason: createResult.reason || 'UNKNOWN'
          });
        }

        ticket.cloudTicketId =
          createResult.cloudTicketId;
        ticket.cloudReportId =
          createResult.cloudReportId;
        ticket.publicTrackingToken =
          createResult.publicTrackingToken;

        deps.saveStore(store);
      }

      const same = ticket.assignedTechnicianId === tech.id;
      const currentRevision = Number.isSafeInteger(ticket.assignmentRevision) ? ticket.assignmentRevision : 0;
      if (!same || currentRevision === 0) {
        const previousStatus = ticket.status;
        const now = new Date().toISOString();
        ticket.assignmentRevision = currentRevision + 1;
        ticket.assignedTechnicianId = tech.id;
        ticket.assignedTechnician = tech;
        if (['NEW', 'OPEN', 'TRIAGED', 'ASSIGNED', 'DISPATCHED'].includes(ticket.status)) ticket.status = 'ASSIGNED';
        ticket.updatedAt = now;
        const description = String(req.body?.comment || `تم إسناد التذكرة إلى الفني ${tech.fullName || tech.employeeCode}`);
        ticket.statusHistory = ticket.statusHistory || [];
        ticket.statusHistory.push({ id: `sh-${crypto.randomUUID()}`, ticketId: ticket.id,
          previousStatus, newStatus: ticket.status, comment: description, createdAt: now });
        ticket.timeline = ticket.timeline || [];
        ticket.timeline.unshift({ id: `tl-${crypto.randomUUID()}`, ticketId: ticket.id, timestamp: now,
          technicianId: tech.id, technicianName: tech.fullName, technicianCode: tech.employeeCode,
          action: 'ASSIGNED', actionLabel: 'تم إسناد التذكرة للفني', description });
        store.auditLogs = store.auditLogs || [];
        store.auditLogs.unshift({ id: `aud-${crypto.randomUUID()}`, action: 'TICKET_ASSIGNED',
          entityName: 'Ticket', entityId: ticket.ticketNumber,
          userName: req.user.fullName || req.user.name || req.user.id,
          newValues: { technicianId: tech.id, assignmentRevision: ticket.assignmentRevision }, createdAt: now });
      }
      ticket.cloudAssignmentSync = ticket.cloudTicketId
        ? { status: 'FAILED', reason: 'AWAITING_CLOUD_CONFIRMATION' } : { status: 'NOT_REQUIRED' };
      deps.saveStore(store);
      let result: AssignmentSyncResult;
      try { result = await deps.sync(req, { ...ticket }); }
      catch { result = { status: 'FAILED', reason: 'CLOUD_OUTCOME_UNCONFIRMED' }; }
      ticket.cloudAssignmentSync = result;
      deps.saveStore(store);
      return res.json(ticket);
    } catch {
      return res.status(500).json({ error: 'تعذر تأكيد حفظ الإسناد. حدّث التذكرة قبل إعادة المحاولة.' });
    } finally { busy.delete(ticket.id); }
  };
}

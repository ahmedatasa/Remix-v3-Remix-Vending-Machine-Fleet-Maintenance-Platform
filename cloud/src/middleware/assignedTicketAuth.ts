import type { Request, Response, NextFunction } from 'express';
import { getCloudRepository } from '../repositories';

// Authenticated technician mutations are limited to that technician's active assignment.
export async function requireAssignedCloudTicket(req: Request, res: Response, next: NextFunction) {
  const id = typeof req.body?.ticketId === 'string' ? req.body.ticketId.trim() : '';
  if (!id) return res.status(400).json({ error: 'TICKET_ID_REQUIRED', message: 'معرف البلاغ مطلوب.' });
  try {
    const ticket = await getCloudRepository().tickets.findById(id);
    if (!ticket || ticket.assignedTechnicianId !== (req as any).technician?.id) {
      return res.status(403).json({ error: 'TICKET_NOT_ASSIGNED', message: 'هذا البلاغ غير مسند إليك.' });
    }
    if (!['OPEN', 'IN_PROGRESS'].includes(ticket.status)) {
      return res.status(409).json({ error: 'TICKET_NOT_ACTIVE', message: 'البلاغ لم يعد نشطاً.' });
    }
    next();
  } catch {
    return res.status(503).json({ error: 'ASSIGNMENT_CHECK_FAILED', message: 'تعذر التحقق من إسناد البلاغ.' });
  }
}

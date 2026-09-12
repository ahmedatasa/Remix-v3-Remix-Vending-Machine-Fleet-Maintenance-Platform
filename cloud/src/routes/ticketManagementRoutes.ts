import { Router, Request, Response } from 'express';
import { requireCloudTicketLifecycleAuth } from '../middleware/ticketLifecycleAuth';
import { getCloudRepository } from '../repositories';

export const ticketManagementRoutes = Router();

const STATUS_RANK: Record<string, number> = {
  OPEN: 0,
  IN_PROGRESS: 1,
  RESOLVED: 2,
  CLOSED: 3
};

/**
 * POST /api/tickets/:ticketId/status
 *
 * Trusted Main Server -> Cloud lifecycle update.
 * This endpoint changes ONLY an existing Cloud ticket status.
 * It does not bootstrap machines, technicians, or fleet data.
 */
ticketManagementRoutes.post(
  '/api/tickets/:ticketId/status',
  requireCloudTicketLifecycleAuth,
  async (req: Request, res: Response) => {
    const repo = getCloudRepository();
    const ticketId = String(req.params.ticketId || '').trim();
    const status = String(req.body?.status || '').trim().toUpperCase();
    const resolutionSummary = String(
      req.body?.resolutionSummary || req.body?.summary || ''
    ).trim();

    const allowedStatuses = new Set([
      'IN_PROGRESS',
      'RESOLVED',
      'CLOSED'
    ]);

    if (!ticketId) {
      return res.status(400).json({
        error: 'TICKET_ID_REQUIRED',
        message: 'Cloud ticket ID is required.'
      });
    }

    if (!allowedStatuses.has(status)) {
      return res.status(400).json({
        error: 'INVALID_TICKET_STATUS',
        message: 'Allowed statuses are IN_PROGRESS, RESOLVED, and CLOSED.'
      });
    }

    try {
      const ticket = await repo.tickets.findById(ticketId);

      if (!ticket) {
        return res.status(404).json({
          error: 'TICKET_NOT_FOUND',
          message: 'Cloud ticket was not found.'
        });
      }

      const currentRank = STATUS_RANK[String(ticket.status)] ?? 0;
      const requestedRank = STATUS_RANK[status] ?? 0;

      // Never allow a terminal ticket to move backwards.
      if (requestedRank < currentRank) {
        return res.status(409).json({
          error: 'TICKET_STATUS_DOWNGRADE_BLOCKED',
          message: `Ticket status cannot move backward from ${ticket.status} to ${status}.`
        });
      }

      await repo.tickets.updateTicketStatus(
        ticket.id,
        status as any,
        resolutionSummary || undefined
      );

      const actor = (req as any).managementActor;

      await repo.audit.log({
        actorType: 'SYSTEM',
        actorId: actor.id,
        actorName: actor.name,
        action: 'MAIN_SERVER_TICKET_STATUS_SYNC',
        entity: 'TICKET',
        result: 'SUCCESS',
        details: {
          ticketId: ticket.id,
          previousStatus: ticket.status,
          newStatus: status,
          actorRole: actor.role,
          resolutionSummary: resolutionSummary || undefined
        }
      });

      const updatedTicket =
        (await repo.tickets.findById(ticket.id)) || ticket;

      return res.json({
        success: true,
        ticket: updatedTicket,
        message: 'Cloud ticket lifecycle status updated successfully.'
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'TICKET_STATUS_UPDATE_FAILED',
        message: err.message || 'Failed to update Cloud ticket status.'
      });
    }
  }
);

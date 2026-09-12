import { Router, Request, Response } from 'express';
import { requireCloudTicketManagementAuth } from '../middleware/ticketLifecycleAuth';
import { getCloudRepository } from '../repositories';
import { cloudStorage } from '../storage/cloudStorage';
import { TicketService } from '../services/ticketService';

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
  requireCloudTicketManagementAuth,
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

/**
 * POST /api/tickets/:ticketId/evidence
 *
 * Trusted Main Server -> Cloud evidence upload.
 * The browser never receives S3 credentials.
 *
 * Flow:
 * Main authenticated actor
 *   -> M2M management authentication
 *   -> Cloud object storage
 *   -> PostgreSQL ticket_evidence
 *   -> EVIDENCE_ADDED sync event
 */
ticketManagementRoutes.post(
  '/api/tickets/:ticketId/evidence',
  requireCloudTicketManagementAuth,
  async (req: Request, res: Response) => {
    const repo = getCloudRepository();

    const ticketId = String(req.params.ticketId || '').trim();
    const imageBase64 = String(req.body?.imageBase64 || '').trim();
    const mimeType = String(
      req.body?.mimeType || 'image/jpeg'
    ).trim().toLowerCase();
    const caption = String(req.body?.caption || '').trim();

    if (!ticketId || !imageBase64) {
      return res.status(400).json({
        error: 'EVIDENCE_PARAMS_REQUIRED',
        message: 'Cloud ticket ID and image data are required.'
      });
    }

    try {
      // Check ticket first so a bad ticket ID never creates an orphan S3 object.
      const ticket = await repo.tickets.findById(ticketId);

      if (!ticket) {
        return res.status(404).json({
          error: 'TICKET_NOT_FOUND',
          message: 'Cloud ticket was not found.'
        });
      }

      const actor = (req as any).managementActor;

      // Accept a normal data URL or raw Base64.
      const rawBase64 = imageBase64.replace(
        /^data:[^;]+;base64,/i,
        ''
      );

      const buffer = Buffer.from(rawBase64, 'base64');

      if (!buffer.length) {
        return res.status(400).json({
          error: 'EMPTY_EVIDENCE_FILE',
          message: 'Evidence image is empty.'
        });
      }

      // Real PutObjectCommand path lives inside cloudStorage.
      const uploadResult = await cloudStorage.upload({
        buffer,
        mimeType,
        ticketId: ticket.id,
        technicianId: actor.id
      });

      // Persist metadata to PostgreSQL and emit EVIDENCE_ADDED.
      const result = await TicketService.attachEvidence({
        ticketId: ticket.id,
        technicianId: actor.id,
        technicianName: actor.name,
        uploadResult,
        caption
      });

      await repo.audit.log({
        actorType: 'SYSTEM',
        actorId: actor.id,
        actorName: actor.name,
        action: 'MAIN_SERVER_EVIDENCE_UPLOAD',
        entity: 'TICKET',
        result: 'SUCCESS',
        details: {
          ticketId: ticket.id,
          actorRole: actor.role,
          objectKey: uploadResult.objectKey,
          sizeBytes: uploadResult.sizeBytes,
          mimeType: uploadResult.mimeType,
          sha256: uploadResult.sha256
        }
      });

      return res.json({
        success: true,
        evidence: result.evidence,
        message: 'Evidence uploaded to Cloud storage successfully.'
      });
    } catch (err: any) {
      const message =
        err?.message || 'Failed to upload Cloud ticket evidence.';

      const statusCode =
        message.includes('STORAGE_SERVICE_UNAVAILABLE')
          ? 503
          : 400;

      return res.status(statusCode).json({
        error: 'EVIDENCE_UPLOAD_FAILED',
        message
      });
    }
  }
);

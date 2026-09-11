import { Router, Request, Response } from 'express';
import { LocationService } from '../services/locationService';
import { requireCloudTechnicianAuth } from '../middleware/technicianAuth';
import { requireCloudManagementAuth } from '../middleware/managementAuth';

export const locationRoutes = Router();

/**
 * POST /api/locations/propose
 * Technician submits a GPS location proposal for a machine
 */
locationRoutes.post('/api/locations/propose', requireCloudTechnicianAuth, async (req: Request, res: Response) => {
  const tech = (req as any).technician;
  const { machineTokenOrId, machineId, publicQrToken, latitude, longitude, accuracyMeters, ticketId } = req.body;

  const targetMachine = machineTokenOrId || machineId || publicQrToken;
  if (!targetMachine) {
    return res.status(400).json({
      error: 'PARAMS_REQUIRED',
      message: 'رمز أو معرف الماكينة مطلوب لتقديم المقترح.'
    });
  }

  try {
    const proposal = await LocationService.submitProposal({
      machineTokenOrId: targetMachine,
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
      message: 'تم رفع مقترح إحداثيات الماكينة بنجاح وبانتظار اعتماد الإدارة.'
    });
  } catch (err: any) {
    return res.status(400).json({
      error: 'PROPOSAL_FAILED',
      message: err.message || 'فشل في رفع مقترح الموقع.'
    });
  }
});

/**
 * GET /api/locations/pending
 * Management retrieves pending proposals
 */
locationRoutes.get('/api/locations/pending', requireCloudManagementAuth, async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const proposals = await LocationService.listPendingProposals(limit);
    res.json({
      success: true,
      count: proposals.length,
      proposals
    });
  } catch (err: any) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * POST /api/locations/proposals/:id/approve
 * Approves a location proposal and updates the machine
 */
locationRoutes.post('/api/locations/proposals/:id/approve', requireCloudManagementAuth, async (req: Request, res: Response) => {
  const proposalId = req.params.id;
  const actor = (req as any).managementActor;

  try {
    const result = await LocationService.approveProposal({
      proposalId,
      approverId: actor.id,
      approverName: actor.name,
      clientIp: req.ip
    });

    res.json({
      success: true,
      proposal: result.proposal,
      machine: result.machine,
      message: 'تم اعتماد موقع الماكينة بنجاح وتحديث إحداثياتها الرسمية في الأسطول.'
    });
  } catch (err: any) {
    res.status(400).json({ error: 'APPROVE_FAILED', message: err.message });
  }
});

/**
 * POST /api/locations/proposals/:id/reject
 * Rejects a location proposal
 */
locationRoutes.post('/api/locations/proposals/:id/reject', requireCloudManagementAuth, async (req: Request, res: Response) => {
  const proposalId = req.params.id;
  const actor = (req as any).managementActor;
  const { reason, rejectionReason } = req.body;
  const resolvedReason = reason || rejectionReason;

  try {
    const proposal = await LocationService.rejectProposal({
      proposalId,
      actorId: actor.id,
      actorName: actor.name,
      reason: resolvedReason,
      clientIp: req.ip
    });

    res.json({
      success: true,
      proposal,
      message: 'تم رفض مقترح الموقع.'
    });
  } catch (err: any) {
    res.status(400).json({ error: 'REJECT_FAILED', message: err.message });
  }
});

/**
 * PUT /api/locations/machines/:idOrToken
 * Manually update machine location (map picker or coordinates entry)
 */
locationRoutes.put('/api/locations/machines/:idOrToken', requireCloudManagementAuth, async (req: Request, res: Response) => {
  const idOrToken = req.params.idOrToken;
  const actor = (req as any).managementActor;
  const {
    latitude,
    longitude,
    locationSource = 'MANUAL_ENTRY',
    locationNote
  } = req.body;

  try {
    const machine = await LocationService.updateLocationManually({
      machineIdOrToken: idOrToken,
      latitude: latitude !== null && latitude !== undefined ? Number(latitude) : null,
      longitude: longitude !== null && longitude !== undefined ? Number(longitude) : null,
      locationSource,
      locationNote,
      actorId: actor.id,
      actorName: actor.name,
      clientIp: req.ip
    });

    res.json({
      success: true,
      machine,
      message: 'تم تحديث موقع الماكينة بنجاح.'
    });
  } catch (err: any) {
    res.status(400).json({ error: 'UPDATE_FAILED', message: err.message });
  }
});

/**
 * DELETE /api/locations/machines/:idOrToken
 * Clear machine location coordinates
 */
locationRoutes.delete('/api/locations/machines/:idOrToken', requireCloudManagementAuth, async (req: Request, res: Response) => {
  const idOrToken = req.params.idOrToken;
  const actor = (req as any).managementActor;

  try {
    const machine = await LocationService.clearLocation({
      machineIdOrToken: idOrToken,
      actorId: actor.id,
      actorName: actor.name,
      clientIp: req.ip
    });

    res.json({
      success: true,
      machine,
      message: 'تم مسح إحداثيات موقع الماكينة بنجاح.'
    });
  } catch (err: any) {
    res.status(400).json({ error: 'CLEAR_FAILED', message: err.message });
  }
});

/**
 * POST /api/locations/field-exceptions
 * Issue a secure field exception approval
 */
locationRoutes.post('/api/locations/field-exceptions', requireCloudManagementAuth, async (req: Request, res: Response) => {
  const actor = (req as any).managementActor;
  const {
    ticketId,
    machineIdOrToken,
    technicianId,
    reason,
    validHours = 4
  } = req.body;

  try {
    const approval = await LocationService.createFieldExceptionApproval({
      ticketId,
      machineIdOrToken,
      technicianId,
      reason,
      approvedByActorId: actor.id,
      approvedByActorName: actor.name,
      validHours: Number(validHours) || 4,
      clientIp: req.ip
    });

    res.json({
      success: true,
      approval,
      message: 'تم إصدار تصريح استثناء ميداني معتمد بنجاح.'
    });
  } catch (err: any) {
    res.status(400).json({ error: 'EXCEPTION_FAILED', message: err.message });
  }
});

/**
 * GET /api/locations/machines/:idOrToken
 * Fetch machine location details and pending proposals
 */
locationRoutes.get('/api/locations/machines/:idOrToken', requireCloudManagementAuth, async (req: Request, res: Response) => {
  try {
    const details = await LocationService.getMachineLocationDetails(req.params.idOrToken);
    res.json({
      success: true,
      ...details
    });
  } catch (err: any) {
    res.status(404).json({ error: 'NOT_FOUND', message: err.message });
  }
});

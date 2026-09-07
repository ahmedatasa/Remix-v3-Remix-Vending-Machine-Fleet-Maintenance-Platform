import { Router, Request, Response } from 'express';
import { requireSyncAuth } from '../middleware/syncAuth';
import type { SanitizedCloudMachine, CloudTechnicianAccount } from '../db/cloudDb';
import { getCloudRepository } from '../repositories';

export const syncRoutes = Router();

// Require M2M sync client authentication on all sync endpoints
syncRoutes.use(requireSyncAuth);

/**
 * POST /sync/bootstrap
 * Safely receives sanitized machine registry and technician accounts from Desktop.
 * DOES NOT overwrite or accept private desktop data (costs, notes, full inventory).
 */
syncRoutes.post('/sync/bootstrap', async (req: Request, res: Response) => {
  const { machines, technicians } = req.body;
  const repo = getCloudRepository();

  let machineStats = { updated: 0, total: 0 };

  if (Array.isArray(machines)) {
    // Validate each incoming sanitized machine
    const sanitizedList: SanitizedCloudMachine[] = [];
    for (const m of machines) {
      if (!m.integrationMachineId || !m.publicQrToken) continue;
      sanitizedList.push({
        integrationMachineId: String(m.integrationMachineId),
        publicQrToken: String(m.publicQrToken).toUpperCase().trim(),
        machineType: String(m.machineType || 'VENDING_MACHINE'),
        publicDisplayName: String(m.publicDisplayName || `ماكينة ${m.publicQrToken}`),
        buildingPublicName: String(m.buildingPublicName || 'موقع الماكينة'),
        locationPublicName: String(m.locationPublicName || 'موقع الماكينة'),
        latitude: typeof m.latitude === 'number' ? m.latitude : null,
        longitude: typeof m.longitude === 'number' ? m.longitude : null,
        active: m.active !== false,
        lastSyncedAt: new Date().toISOString(),
        version: 1
      });
    }
    machineStats = await repo.machines.bootstrapRegistry(sanitizedList);
  } else {
    machineStats.total = await repo.machines.count();
  }

  // Synchronize technician credentials (bcrypt hash) so technicians can authenticate on Cloud
  if (Array.isArray(technicians)) {
    for (const t of technicians) {
      if (!t.id || !t.employeeCode) continue;
      const account: CloudTechnicianAccount = {
        id: String(t.id),
        employeeCode: String(t.employeeCode).trim(),
        fullName: String(t.fullName || t.name || 'فني ميداني'),
        email: String(t.email || '').trim().toLowerCase(),
        phone: t.phone || t.phoneNumber,
        passwordHash: String(t.passwordHash || ''),
        status: t.status === 'DISABLED' ? 'DISABLED' : 'ACTIVE',
        specialization: t.specialization
      };
      await repo.technicians.saveTechnician(account);
    }
  }

  const finalMachineCount = await repo.machines.count();
  const finalTechCount = await repo.technicians.count();

  await repo.audit.log({
    actorType: 'DESKTOP_SYNC',
    actorId: req.headers['x-sync-client-id'] as string,
    actorName: 'Desktop Sync Agent',
    action: 'BOOTSTRAP_SYNC',
    entity: 'REGISTRY',
    result: 'SUCCESS',
    details: {
      machinesCount: finalMachineCount,
      techniciansCount: finalTechCount
    }
  });

  res.json({
    success: true,
    message: 'تمت مزامنة سجل الماكينات وحسابات الفنيين في البوابة السحابية بنجاح.',
    synchronizedMachines: finalMachineCount,
    synchronizedTechnicians: finalTechCount,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /sync/events
 * Cursor-based pull of pending cloud events for Desktop sync worker.
 */
syncRoutes.get('/sync/events', async (req: Request, res: Response) => {
  const afterCursor = parseInt(req.query.after as string || '0', 10);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string || '50', 10)));
  const repo = getCloudRepository();

  const result = await repo.syncEvents.getEventsAfter(afterCursor, limit);

  res.json({
    success: true,
    cursor: afterCursor,
    nextCursor: result.nextCursor,
    hasMore: result.hasMore,
    eventCount: result.events.length,
    events: result.events
  });
});

/**
 * POST /sync/ack
 * Idempotent acknowledgement of processed cloud events.
 */
syncRoutes.post('/sync/ack', async (req: Request, res: Response) => {
  const { eventIds } = req.body;
  const repo = getCloudRepository();

  if (!Array.isArray(eventIds) || eventIds.length === 0) {
    return res.status(400).json({
      error: 'INVALID_EVENT_IDS',
      message: 'قائمة معرفات الأحداث eventIds مطلوبة لتأكيد الاستلام.'
    });
  }

  const result = await repo.syncEvents.acknowledgeEvents(eventIds);

  await repo.audit.log({
    actorType: 'DESKTOP_SYNC',
    actorId: req.headers['x-sync-client-id'] as string,
    actorName: 'Desktop Sync Agent',
    action: 'EVENTS_ACKNOWLEDGED',
    entity: 'SYNC_QUEUE',
    result: 'SUCCESS',
    details: {
      acknowledgedCount: result.acknowledgedCount,
      eventIds
    }
  });

  res.json({
    success: true,
    acknowledgedCount: result.acknowledgedCount,
    message: `تم تأكيد استلام ومعالجة ${result.acknowledgedCount} حدث سحابي.`
  });
});

/**
 * GET /sync/status
 */
syncRoutes.get('/sync/status', async (req: Request, res: Response) => {
  const repo = getCloudRepository();
  const [
    registryMachinesCount,
    totalTicketsCount,
    totalSyncEvents,
    pendingSyncEvents,
    techniciansCount,
    activeSessionsCount
  ] = await Promise.all([
    repo.machines.count(),
    repo.tickets.count(),
    repo.syncEvents.count(),
    repo.syncEvents.countPending(),
    repo.technicians.count(),
    repo.sessions.countActive()
  ]);

  res.json({
    service: 'KSU Vending Fleet Standalone Cloud API',
    status: 'ONLINE',
    repositoryProvider: repo.providerType,
    registryMachinesCount,
    totalTicketsCount,
    totalSyncEvents,
    pendingSyncEvents,
    techniciansCount,
    activeSessionsCount,
    timestamp: new Date().toISOString()
  });
});

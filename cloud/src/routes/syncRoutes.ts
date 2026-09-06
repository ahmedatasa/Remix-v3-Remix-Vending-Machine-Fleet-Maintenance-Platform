import { Router, Request, Response } from 'express';
import { requireSyncAuth } from '../middleware/syncAuth';
import { cloudDb, SanitizedCloudMachine, CloudTechnicianAccount } from '../db/cloudDb';

export const syncRoutes = Router();

// Require M2M sync client authentication on all sync endpoints
syncRoutes.use(requireSyncAuth);

/**
 * POST /sync/bootstrap
 * Safely receives sanitized machine registry (189 machines) and technician accounts from Desktop.
 * DOES NOT overwrite or accept private desktop data (costs, notes, full inventory).
 */
syncRoutes.post('/sync/bootstrap', (req: Request, res: Response) => {
  const { machines, technicians } = req.body;

  let machineStats = { updated: 0, total: cloudDb.getData().cloud_machine_registry.length };
  let techCount = 0;

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
    machineStats = cloudDb.bootstrapMachineRegistry(sanitizedList);
  }

  // Synchronize technician credentials (bcrypt hash) so technicians can authenticate on Cloud
  if (Array.isArray(technicians)) {
    const existingAccounts = cloudDb.getData().technician_accounts;
    const accountMap = new Map<string, CloudTechnicianAccount>();
    for (const a of existingAccounts) {
      accountMap.set(a.id, a);
    }

    for (const t of technicians) {
      if (!t.id || !t.employeeCode) continue;
      accountMap.set(t.id, {
        id: String(t.id),
        employeeCode: String(t.employeeCode).trim(),
        fullName: String(t.fullName || t.name || 'فني ميداني'),
        email: String(t.email || '').trim().toLowerCase(),
        phone: t.phone || t.phoneNumber,
        passwordHash: String(t.passwordHash || ''),
        status: t.status === 'DISABLED' ? 'DISABLED' : 'ACTIVE',
        specialization: t.specialization
      });
      techCount++;
    }
    cloudDb.getData().technician_accounts = Array.from(accountMap.values());
    cloudDb.save();
  }

  cloudDb.logAudit('DESKTOP_SYNC', req.headers['x-sync-client-id'] as string, 'Desktop Sync Agent', 'BOOTSTRAP_SYNC', 'REGISTRY', 'SUCCESS', {
    machinesCount: machineStats.total,
    techniciansCount: cloudDb.getData().technician_accounts.length
  });

  res.json({
    success: true,
    message: 'تمت مزامنة سجل الماكينات وحسابات الفنيين في البوابة السحابية بنجاح.',
    synchronizedMachines: machineStats.total,
    synchronizedTechnicians: cloudDb.getData().technician_accounts.length,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /sync/events
 * Cursor-based pull of pending cloud events for Desktop sync worker.
 */
syncRoutes.get('/sync/events', (req: Request, res: Response) => {
  const afterCursor = parseInt(req.query.after as string || '0', 10);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string || '50', 10)));

  const result = cloudDb.getSyncEventsAfter(afterCursor, limit);

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
syncRoutes.post('/sync/ack', (req: Request, res: Response) => {
  const { eventIds } = req.body;

  if (!Array.isArray(eventIds) || eventIds.length === 0) {
    return res.status(400).json({
      error: 'INVALID_EVENT_IDS',
      message: 'قائمة معرفات الأحداث eventIds مطلوبة لتأكيد الاستلام.'
    });
  }

  const result = cloudDb.acknowledgeSyncEvents(eventIds);

  cloudDb.logAudit('DESKTOP_SYNC', req.headers['x-sync-client-id'] as string, 'Desktop Sync Agent', 'EVENTS_ACKNOWLEDGED', 'SYNC_QUEUE', 'SUCCESS', {
    acknowledgedCount: result.acknowledgedCount,
    eventIds
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
syncRoutes.get('/sync/status', (req: Request, res: Response) => {
  const data = cloudDb.getData();
  const pendingEvents = data.sync_events.filter(e => e.status === 'PENDING').length;

  res.json({
    service: 'KSU Vending Fleet Standalone Cloud API',
    status: 'ONLINE',
    registryMachinesCount: data.cloud_machine_registry.length,
    totalTicketsCount: data.cloud_tickets.length,
    totalSyncEvents: data.sync_events.length,
    pendingSyncEvents: pendingEvents,
    lastCursor: data.lastCursor,
    techniciansCount: data.technician_accounts.length,
    activeSessionsCount: Object.keys(data.technician_sessions).length,
    timestamp: new Date().toISOString()
  });
});

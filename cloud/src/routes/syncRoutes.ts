import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { requireSyncAuth } from '../middleware/syncAuth';
import type { SanitizedCloudMachine, CloudTechnicianAccount, CloudTicket } from '../db/cloudDb';
import { getCloudRepository } from '../repositories';

export const syncRoutes = Router();


const VALID_LOCATION_SOURCES = new Set([
  'NONE',
  'MANUAL_ENTRY',
  'MAP_PICKER',
  'MAP_SELECTION',
  'DEVICE_GPS',
  'TECHNICIAN_PROPOSAL_APPROVED',
  'IMPORT',
  'API',
  'FUTURE_DEVICE'
]);

function normalizeCoordinate(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(6)) : NaN;
}

function sameCoordinatePair(
  aLat: number | null,
  aLng: number | null,
  bLat: number | null,
  bLng: number | null
): boolean {
  if (aLat === null || aLng === null || bLat === null || bLng === null) {
    return aLat === bLat && aLng === bLng;
  }
  return Number(aLat.toFixed(6)) === Number(bLat.toFixed(6)) &&
    Number(aLng.toFixed(6)) === Number(bLng.toFixed(6));
}

// Require M2M sync client authentication on all sync endpoints
syncRoutes.use('/sync', requireSyncAuth);

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
        machineNumber: m.machineNumber !== undefined && m.machineNumber !== null
          ? String(m.machineNumber).trim()
          : undefined,
        model: m.model !== undefined && m.model !== null
          ? String(m.model).trim()
          : undefined,
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
 * POST /sync/manual-ticket
 *
 * Trusted Main -> Cloud creation for tickets entered manually in Main.
 * Protected by the existing /sync M2M middleware.
 *
 * Idempotency is based on a deterministic cloudReportId derived from
 * the Main ticket ID. No CUSTOMER_TICKET_CREATED event is emitted
 * because Main already owns the ticket.
 */
syncRoutes.post('/sync/manual-ticket', async (req: Request, res: Response) => {
  const repo = getCloudRepository();
  const body = req.body || {};

  const mainTicketId = String(body.mainTicketId || '').trim();
  const mainTicketNumber = String(body.mainTicketNumber || '').trim();
  const integrationMachineId =
    String(body.integrationMachineId || '').trim();
  const description = String(body.description || '').trim();

  const actorId = String(
    body.actorId ||
    req.headers['x-sync-client-id'] ||
    ''
  ).trim();

  const actorName = String(
    body.actorName || 'Main Manual Ticket Sync'
  ).trim();

  const actorRole = String(body.actorRole || '')
    .trim()
    .toUpperCase();

  const allowedRoles = new Set([
    'SUPER_ADMIN',
    'ADMIN',
    'MAINTENANCE_MANAGER',
    'FACILITY_MANAGER',
    'MANAGEMENT',
    'TECHNICIAN'
  ]);

  if (
    !mainTicketId ||
    !mainTicketNumber ||
    !integrationMachineId ||
    !description ||
    !actorId ||
    !actorRole
  ) {
    return res.status(400).json({
      error: 'MANUAL_TICKET_PARAMS_REQUIRED'
    });
  }

  if (!allowedRoles.has(actorRole)) {
    return res.status(403).json({
      error: 'MANUAL_TICKET_ROLE_FORBIDDEN'
    });
  }

  const machine =
    await repo.machines.findByIntegrationId(integrationMachineId);

  if (!machine || machine.active !== true) {
    return res.status(404).json({
      error: 'MACHINE_NOT_FOUND'
    });
  }

  const requestedQr =
    String(body.publicQrToken || '').trim().toUpperCase();
  const registryQr =
    String(machine.publicQrToken || '').trim().toUpperCase();

  if (requestedQr && requestedQr !== registryQr) {
    return res.status(409).json({
      error: 'MACHINE_QR_MISMATCH'
    });
  }

  const cloudReportId = `MAIN-${mainTicketId}`;

  const existing =
    await repo.tickets.findByReportId(cloudReportId);

  if (existing) {
    if (
      existing.integrationMachineId !==
      machine.integrationMachineId
    ) {
      return res.status(409).json({
        error: 'MANUAL_TICKET_CONFLICT'
      });
    }

    await repo.audit.log({
      actorType: 'DESKTOP_SYNC',
      actorId,
      actorName,
      action: 'MAIN_MANUAL_TICKET_CREATE_IDEMPOTENT',
      entity: 'TICKET',
      result: 'SUCCESS',
      details: {
        mainTicketId,
        mainTicketNumber,
        ticketId: existing.id,
        actorRole
      },
      ip: req.ip
    });

    return res.json({
      success: true,
      idempotent: true,
      ticketId: existing.id,
      cloudReportId: existing.cloudReportId,
      trackingToken: existing.trackingToken,
      status: existing.status
    });
  }

  const now = new Date().toISOString();

  const ticketId =
    `cld-tck-${Date.now()}-${crypto
      .randomBytes(4)
      .toString('hex')}`;

  const trackingToken =
    `TRK-${Date.now().toString(36).toUpperCase()}-${crypto
      .randomBytes(4)
      .toString('hex')
      .toUpperCase()}`;

  const newTicket: CloudTicket = {
    id: ticketId,
    mainTicketNumber,
    cloudReportId,
    trackingToken,
    integrationMachineId: machine.integrationMachineId,
    publicQrToken: machine.publicQrToken,
    category:
      String(body.category || 'OTHER').trim() || 'OTHER',
    description,
    reporterName:
      String(
        body.reporterName ||
        actorName ||
        'Operations Team'
      ).trim(),
    reporterPhone:
      String(body.reporterPhone || '').trim(),
    reporterEmail:
      String(body.reporterEmail || '').trim(),
    status: 'OPEN',
    syncStatus: 'ACKNOWLEDGED',
    createdAt: now,
    updatedAt: now,
    checkins: [],
    actions: [],
    evidence: [],
    functionalTests: [],
    partRequests: []
  };

  const created =
    await repo.tickets.createTicket(newTicket);

  await repo.audit.log({
    actorType: 'DESKTOP_SYNC',
    actorId,
    actorName,
    action: 'MAIN_MANUAL_TICKET_CREATED',
    entity: 'TICKET',
    result: 'SUCCESS',
    details: {
      mainTicketId,
      mainTicketNumber,
      ticketId: created.id,
      machineId: machine.integrationMachineId,
      actorRole
    },
    ip: req.ip
  });

  return res.status(201).json({
    success: true,
    idempotent: false,
    ticketId: created.id,
    cloudReportId: created.cloudReportId,
    trackingToken: created.trackingToken,
    status: created.status
  });
});

/**
 * PUT /sync/machines/:idOrToken/location
 *
 * Explicit Main-authoritative machine-location push.
 * This endpoint is M2M-only and intentionally does NOT emit a Cloud -> Main
 * sync event. That prevents a sync echo while the normal background worker
 * remains PULL_ONLY.
 */
syncRoutes.put('/sync/machines/:idOrToken/location', async (req: Request, res: Response) => {
  const repo = getCloudRepository();
  const idOrToken = String(req.params.idOrToken || '').trim();
  const {
    latitude,
    longitude,
    locationSource = 'MANUAL_ENTRY',
    locationNote,
    sourceRevision,
    operationId,
    actorId,
    actorName,
    publicQrToken
  } = req.body || {};

  if (!idOrToken || !operationId) {
    return res.status(400).json({
      error: 'SYNC_LOCATION_PARAMS_REQUIRED',
      message: 'Machine identifier and operationId are required.'
    });
  }

  if (!Number.isInteger(sourceRevision) || sourceRevision < 1) {
    return res.status(400).json({
      error: 'INVALID_SOURCE_REVISION',
      message: 'sourceRevision must be a positive integer.'
    });
  }

  const lat = normalizeCoordinate(latitude);
  const lng = normalizeCoordinate(longitude);

  const bothNull = lat === null && lng === null;
  const bothNumbers = Number.isFinite(lat) && Number.isFinite(lng);
  if (!bothNull && !bothNumbers) {
    return res.status(400).json({
      error: 'INVALID_COORDINATE_PAIR',
      message: 'latitude and longitude must both be valid numbers or both null.'
    });
  }

  if (typeof lat === 'number' && (lat < -90 || lat > 90)) {
    return res.status(400).json({ error: 'INVALID_LATITUDE' });
  }
  if (typeof lng === 'number' && (lng < -180 || lng > 180)) {
    return res.status(400).json({ error: 'INVALID_LONGITUDE' });
  }

  const source = String(locationSource || 'MANUAL_ENTRY').toUpperCase();
  if (!VALID_LOCATION_SOURCES.has(source)) {
    return res.status(400).json({ error: 'INVALID_LOCATION_SOURCE' });
  }

  const existing =
    (await repo.machines.findByIntegrationId(idOrToken)) ||
    (publicQrToken ? await repo.machines.findByQrToken(String(publicQrToken)) : null) ||
    (await repo.machines.findByQrToken(idOrToken));

  if (!existing) {
    return res.status(404).json({
      error: 'MACHINE_NOT_FOUND',
      message: `Machine ${idOrToken} is not present in the Cloud registry.`
    });
  }

  const normalizedExistingLat = typeof existing.latitude === 'number'
    ? Number(existing.latitude.toFixed(6))
    : null;
  const normalizedExistingLng = typeof existing.longitude === 'number'
    ? Number(existing.longitude.toFixed(6))
    : null;

  const requestedNote = locationNote === undefined ? existing.locationNote : String(locationNote || '');
  const isIdempotent =
    sameCoordinatePair(normalizedExistingLat, normalizedExistingLng, lat as number | null, lng as number | null) &&
    String(existing.locationSource || 'NONE') === source &&
    String(existing.locationNote || '') === String(requestedNote || '');

  const resolvedActorId = String(actorId || req.headers['x-sync-client-id'] || 'MAIN_SYNC').trim();
  const resolvedActorName = String(actorName || 'Main Authoritative Sync').trim();

  if (isIdempotent) {
    await repo.audit.log({
      actorType: 'DESKTOP_SYNC',
      actorId: resolvedActorId,
      actorName: resolvedActorName,
      action: 'MAIN_MACHINE_LOCATION_SYNC_IDEMPOTENT',
      entity: 'MACHINE',
      result: 'SUCCESS',
      details: {
        operationId,
        machineId: existing.integrationMachineId,
        sourceRevision,
        idempotent: true
      },
      ip: req.ip
    });

    return res.json({
      success: true,
      idempotent: true,
      operationId,
      sourceRevision,
      machine: existing
    });
  }

  try {
    const machine = await repo.machines.updateLocation(existing.integrationMachineId, {
      latitude: lat as number | null,
      longitude: lng as number | null,
      locationSource: source as any,
      locationNote: requestedNote,
      actorId: resolvedActorId,
      actorName: resolvedActorName
    });

    await repo.audit.log({
      actorType: 'DESKTOP_SYNC',
      actorId: resolvedActorId,
      actorName: resolvedActorName,
      action: 'MAIN_MACHINE_LOCATION_SYNC_APPLIED',
      entity: 'MACHINE',
      result: 'SUCCESS',
      details: {
        operationId,
        machineId: machine.integrationMachineId,
        sourceRevision,
        latitude: machine.latitude,
        longitude: machine.longitude,
        locationSource: machine.locationSource
      },
      ip: req.ip
    });

    return res.json({
      success: true,
      idempotent: false,
      operationId,
      sourceRevision,
      machine
    });
  } catch (err: any) {
    await repo.audit.log({
      actorType: 'DESKTOP_SYNC',
      actorId: resolvedActorId,
      actorName: resolvedActorName,
      action: 'MAIN_MACHINE_LOCATION_SYNC_FAILED',
      entity: 'MACHINE',
      result: 'FAILURE',
      details: {
        operationId,
        machineId: existing.integrationMachineId,
        sourceRevision,
        error: err?.message || 'UNKNOWN_ERROR'
      },
      ip: req.ip
    });

    return res.status(400).json({
      error: 'MACHINE_LOCATION_SYNC_FAILED',
      message: err?.message || 'Cloud machine location update failed.'
    });
  }
});

/**
 * GET /sync/audit/machines/:idOrToken
 *
 * M2M-only audit viewer for Main -> Cloud machine-location synchronization.
 * Returns only location-sync audit events for the resolved machine and never
 * exposes sync credentials or unrelated customer/technician audit records.
 */
syncRoutes.get('/sync/audit/machines/:idOrToken', async (req: Request, res: Response) => {
  const repo = getCloudRepository();
  const idOrToken = String(req.params.idOrToken || '').trim();
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));

  if (!idOrToken) {
    return res.status(400).json({ error: 'MACHINE_IDENTIFIER_REQUIRED' });
  }

  const machine =
    (await repo.machines.findByIntegrationId(idOrToken)) ||
    (await repo.machines.findByQrToken(idOrToken));

  if (!machine) {
    return res.status(404).json({
      error: 'MACHINE_NOT_FOUND',
      message: `Machine ${idOrToken} is not present in the Cloud registry.`
    });
  }

  const events = await repo.audit.listMachineSyncEvents(machine.integrationMachineId, limit);

  return res.json({
    success: true,
    machine: {
      integrationMachineId: machine.integrationMachineId,
      publicQrToken: machine.publicQrToken,
      publicDisplayName: machine.publicDisplayName,
      version: machine.version
    },
    count: events.length,
    events
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

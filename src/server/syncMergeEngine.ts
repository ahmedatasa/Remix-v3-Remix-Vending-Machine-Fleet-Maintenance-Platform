import { RuntimeStoreData } from './runtimeStoreTypes';
import { runtimeStoreManager } from './runtimeStoreManager';
import { sanitizeMachineGps } from './syntheticGpsSanitizer';

/**
 * PHASE 5.4.5: Authoritative Sync Merge Engine & Deterministic Version Comparator
 * 
 * Policies:
 *  1. Deterministic Version Comparator:
 *     - Separate numeric revision (1, 2, 3...) from updatedAt timestamp.
 *     - Never write timestamp milliseconds into the revision field.
 *  2. True Idempotency:
 *     - Equal revision & equal timestamp -> IDEMPOTENT NO-OP.
 *     - No entity mutation, no revision inflation, no duplicate audit.
 *  3. Stale-Sync Protection:
 *     - If incoming is strictly older -> IGNORE incoming.
 *     - Configured GPS is protected from stale null overwrite.
 *  4. Terminal Status Protection:
 *     - Tickets in terminal state (RESOLVED, VERIFIED, CLOSED) are never downgraded.
 *  5. Tombstone Protection:
 *     - Locally deleted/tombstoned entities are NEVER resurrected by incoming sync.
 *  6. Zero Fake GPS Rule:
 *     - Incoming machine sync payloads are filtered through sanitizeMachineGps.
 */

/**
 * Extracts a valid positive integer revision, or returns null if not present.
 */
export function getNumericRevision(entity: any): number | null {
  if (typeof entity?.revision === 'number' && !isNaN(entity.revision) && isFinite(entity.revision) && entity.revision >= 1) {
    return Math.floor(entity.revision);
  }
  return null;
}

/**
 * Extracts timestamp milliseconds from updatedAt, or returns null if not present/invalid.
 */
export function getUpdatedAtMs(entity: any): number | null {
  if (entity?.updatedAt) {
    const time = new Date(entity.updatedAt).getTime();
    if (!isNaN(time) && isFinite(time)) return time;
  }
  return null;
}

/**
 * Deterministic Version Comparator.
 * Returns:
 *   1  if incoming is strictly newer than existing (apply update)
 *  -1  if incoming is strictly older than existing (ignore stale)
 *   0  if incoming has identical/equivalent version (idempotent no-op)
 */
export function compareEntityVersion(existing: any, incoming: any): 1 | 0 | -1 {
  const existingRev = getNumericRevision(existing);
  const incRev = getNumericRevision(incoming);

  // CASE 1: Both have valid numeric revisions
  if (existingRev !== null && incRev !== null) {
    if (incRev > existingRev) return 1;
    if (incRev < existingRev) return -1;
    // Equal revision: compare updatedAt timestamps if available and different
    const existingMs = getUpdatedAtMs(existing);
    const incMs = getUpdatedAtMs(incoming);
    if (existingMs !== null && incMs !== null) {
      if (incMs > existingMs) return 1;
      if (incMs < existingMs) return -1;
    }
    return 0; // Identical revision and timestamp -> True idempotent no-op
  }

  // CASE 2: One or both lack numeric revision -> fallback to updatedAt timestamp comparison
  const existingMs = getUpdatedAtMs(existing);
  const incMs = getUpdatedAtMs(incoming);

  if (incMs !== null && existingMs !== null) {
    if (incMs > existingMs) return 1;
    if (incMs < existingMs) return -1;
    return 0; // Equal timestamps
  }

  if (incMs !== null && existingMs === null) return 1;
  if (incMs === null && existingMs !== null) return -1;

  // CASE 3: Neither has revision nor timestamp -> local authoritative existing wins (no-op)
  return 0;
}

export function mergeMachines(existingMachines: any[], incomingMachines: any[]): any[] {
  if (!Array.isArray(incomingMachines) || incomingMachines.length === 0) {
    return existingMachines;
  }

  const map = new Map<string, any>(existingMachines.map(m => [m.id, m]));

  for (const rawInc of incomingMachines) {
    if (!rawInc || !rawInc.id) continue;

    // Check tombstone
    if (
      runtimeStoreManager.isTombstoned('Machine', rawInc.id) ||
      (rawInc.machineNumber && runtimeStoreManager.isTombstoned('Machine', rawInc.machineNumber))
    ) {
      continue;
    }

    // Always sanitize incoming machine GPS so synthetic coordinates cannot enter via sync
    const inc = sanitizeMachineGps(rawInc);

    const existing = map.get(inc.id);
    if (!existing) {
      const incRev = getNumericRevision(inc) || 1;
      map.set(inc.id, {
        ...inc,
        revision: incRev,
        updatedAt: inc.updatedAt || new Date().toISOString()
      });
      continue;
    }

    const cmp = compareEntityVersion(existing, inc);

    // Stale sync protection: if incoming is strictly older, ignore it
    if (cmp < 0) {
      continue;
    }

    // True Idempotency: if incoming version equals existing, no-op (no revision bump, no timestamp change)
    if (cmp === 0) {
      continue;
    }

    // Incoming is strictly newer (cmp > 0): Determine coordinate merging
    let finalLat = existing.latitude;
    let finalLng = existing.longitude;
    let finalLocationSource = existing.locationSource;
    let finalLocationStatus = existing.locationStatus;
    let finalLocationUpdatedAt = existing.locationUpdatedAt;
    let finalLocationNote = existing.locationNote;

    const incomingHasValidCoords = typeof inc.latitude === 'number' && !isNaN(inc.latitude) && typeof inc.longitude === 'number' && !isNaN(inc.longitude);
    const existingHasValidCoords = typeof existing.latitude === 'number' && !isNaN(existing.latitude) && typeof existing.longitude === 'number' && !isNaN(existing.longitude);

    if (incomingHasValidCoords) {
      // Newer incoming valid coordinates -> apply
      finalLat = Number(inc.latitude.toFixed(6));
      finalLng = Number(inc.longitude.toFixed(6));
      finalLocationSource = inc.locationSource || 'MANUAL_ENTRY';
      finalLocationStatus = 'GPS_CONFIGURED';
      finalLocationUpdatedAt = inc.locationUpdatedAt || new Date().toISOString();
      finalLocationNote = inc.locationNote !== undefined ? inc.locationNote : existing.locationNote;
    } else if (!existingHasValidCoords && inc.latitude === null && inc.longitude === null) {
      // Explicit unconfigured state on both sides
      finalLat = null;
      finalLng = null;
      finalLocationSource = 'NONE';
      finalLocationStatus = 'LOCATION_NOT_CONFIGURED';
      finalLocationUpdatedAt = null;
    } else if (existingHasValidCoords && (inc.latitude === null || inc.latitude === undefined)) {
      // Protect existing configured GPS from stale/unconfigured incoming overwrite
      finalLat = existing.latitude;
      finalLng = existing.longitude;
      finalLocationSource = existing.locationSource;
      finalLocationStatus = existing.locationStatus;
      finalLocationUpdatedAt = existing.locationUpdatedAt;
    }

    const existingRev = getNumericRevision(existing) || 1;
    const incRev = getNumericRevision(inc);
    // Revision is integer only, never timestamp
    const nextRev = incRev !== null && incRev > existingRev ? incRev : existingRev + 1;

    map.set(inc.id, {
      ...existing,
      ...inc,
      latitude: finalLat,
      longitude: finalLng,
      machineLatitude: finalLat,
      machineLongitude: finalLng,
      locationSource: finalLocationSource,
      locationStatus: finalLocationStatus,
      locationUpdatedAt: finalLocationUpdatedAt,
      locationNote: finalLocationNote,
      revision: nextRev,
      updatedAt: inc.updatedAt || new Date().toISOString()
    });
  }

  return Array.from(map.values());
}

export function mergeBuildings(existingBuildings: any[], incomingBuildings: any[]): any[] {
  if (!Array.isArray(incomingBuildings) || incomingBuildings.length === 0) {
    return existingBuildings;
  }

  const map = new Map<string, any>(existingBuildings.map(b => [b.id, b]));

  for (const inc of incomingBuildings) {
    if (!inc || !inc.id) continue;

    if (
      runtimeStoreManager.isTombstoned('Building', inc.id) ||
      (inc.code && runtimeStoreManager.isTombstoned('Building', inc.code))
    ) {
      continue;
    }

    const existing = map.get(inc.id);
    if (!existing) {
      const incRev = getNumericRevision(inc) || 1;
      map.set(inc.id, {
        ...inc,
        revision: incRev,
        updatedAt: inc.updatedAt || new Date().toISOString()
      });
      continue;
    }

    const cmp = compareEntityVersion(existing, inc);

    if (cmp < 0) {
      continue; // Stale incoming
    }

    if (cmp === 0) {
      continue; // Idempotent no-op
    }

    // GPS protection for Buildings
    let finalLat = existing.latitude;
    let finalLng = existing.longitude;
    let finalLocationSource = existing.locationSource;
    let finalLocationStatus = existing.locationStatus;
    let finalLocationUpdatedAt = existing.locationUpdatedAt;

    const incomingHasCoords = typeof inc.latitude === 'number' && !isNaN(inc.latitude) && typeof inc.longitude === 'number' && !isNaN(inc.longitude);
    const existingHasCoords = typeof existing.latitude === 'number' && !isNaN(existing.latitude) && typeof existing.longitude === 'number' && !isNaN(existing.longitude);

    if (incomingHasCoords) {
      finalLat = Number(inc.latitude.toFixed(6));
      finalLng = Number(inc.longitude.toFixed(6));
      finalLocationSource = inc.locationSource || 'MANUAL_ENTRY';
      finalLocationStatus = 'GPS_CONFIGURED';
      finalLocationUpdatedAt = inc.locationUpdatedAt || new Date().toISOString();
    } else if (!existingHasCoords && inc.latitude === null) {
      finalLat = null;
      finalLng = null;
      finalLocationSource = 'NONE';
      finalLocationStatus = 'LOCATION_NOT_CONFIGURED';
      finalLocationUpdatedAt = null;
    }

    const existingRev = getNumericRevision(existing) || 1;
    const incRev = getNumericRevision(inc);
    const nextRev = incRev !== null && incRev > existingRev ? incRev : existingRev + 1;

    map.set(inc.id, {
      ...existing,
      ...inc,
      latitude: finalLat,
      longitude: finalLng,
      locationSource: finalLocationSource,
      locationStatus: finalLocationStatus,
      locationUpdatedAt: finalLocationUpdatedAt,
      revision: nextRev,
      updatedAt: inc.updatedAt || new Date().toISOString()
    });
  }

  return Array.from(map.values());
}

export function mergeTickets(existingTickets: any[], incomingTickets: any[], auditLogs: any[] = []): any[] {
  if (!Array.isArray(incomingTickets) || incomingTickets.length === 0) {
    return existingTickets;
  }

  const TERMINAL_STATUSES = ['RESOLVED', 'VERIFIED', 'CLOSED'];
  const map = new Map<string, any>(existingTickets.map(t => [t.id || t.ticketNumber, t]));

  for (const inc of incomingTickets) {
    const key = inc.id || inc.ticketNumber;
    if (!key) continue;

    // Check if ticket was tombstoned / deleted
    if (
      runtimeStoreManager.isTombstoned('Ticket', inc.id) ||
      (inc.ticketNumber && runtimeStoreManager.isTombstoned('Ticket', inc.ticketNumber))
    ) {
      continue;
    }

    const wasDeleted = auditLogs.some(
      a => a.action === 'TICKET_DELETED' && (a.entityId === inc.ticketNumber || a.entityId === inc.id)
    );
    if (wasDeleted) {
      continue;
    }

    const existing = map.get(key);
    if (!existing) {
      const incRev = getNumericRevision(inc) || 1;
      map.set(key, {
        ...inc,
        revision: incRev,
        updatedAt: inc.updatedAt || new Date().toISOString()
      });
      continue;
    }

    const cmp = compareEntityVersion(existing, inc);

    if (cmp < 0) {
      continue; // Stale incoming
    }

    if (cmp === 0) {
      continue; // Idempotent no-op
    }

    const existingIsTerminal = TERMINAL_STATUSES.includes(existing.status);
    const incomingIsTerminal = TERMINAL_STATUSES.includes(inc.status);

    const existingRev = getNumericRevision(existing) || 1;
    const incRev = getNumericRevision(inc);
    const nextRev = incRev !== null && incRev > existingRev ? incRev : existingRev + 1;

    if (existingIsTerminal && !incomingIsTerminal) {
      // Protect terminal status from rollback
      map.set(key, {
        ...inc,
        ...existing,
        status: existing.status,
        resolvedAt: existing.resolvedAt,
        resolvedBy: existing.resolvedBy,
        rootCause: existing.rootCause,
        resolutionSummary: existing.resolutionSummary,
        verifiedAt: existing.verifiedAt,
        closedAt: existing.closedAt,
        revision: nextRev,
        updatedAt: existing.updatedAt || new Date().toISOString()
      });
    } else {
      map.set(key, {
        ...existing,
        ...inc,
        revision: nextRev,
        updatedAt: inc.updatedAt || new Date().toISOString()
      });
    }
  }

  return Array.from(map.values());
}

export function mergeGenericCollection(
  entityType: any,
  existingItems: any[],
  incomingItems: any[]
): any[] {
  if (!Array.isArray(incomingItems) || incomingItems.length === 0) {
    return existingItems;
  }

  const map = new Map<string, any>(existingItems.map(item => [item.id, item]));

  for (const inc of incomingItems) {
    if (!inc || !inc.id) continue;

    if (runtimeStoreManager.isTombstoned(entityType, inc.id)) {
      continue;
    }

    const existing = map.get(inc.id);
    if (!existing) {
      const incRev = getNumericRevision(inc) || 1;
      map.set(inc.id, {
        ...inc,
        revision: incRev,
        updatedAt: inc.updatedAt || new Date().toISOString()
      });
      continue;
    }

    const cmp = compareEntityVersion(existing, inc);

    if (cmp < 0) {
      continue; // Stale incoming
    }

    if (cmp === 0) {
      continue; // Idempotent no-op
    }

    const existingRev = getNumericRevision(existing) || 1;
    const incRev = getNumericRevision(inc);
    const nextRev = incRev !== null && incRev > existingRev ? incRev : existingRev + 1;

    map.set(inc.id, {
      ...existing,
      ...inc,
      revision: nextRev,
      updatedAt: inc.updatedAt || new Date().toISOString()
    });
  }

  return Array.from(map.values());
}

export function mergeFleetSyncPayload(store: RuntimeStoreData, payload: any): void {
  const {
    eventId,
    syncEventId,
    machines,
    buildings,
    floors,
    locations,
    tickets,
    spareParts,
    categories,
    suppliers,
    technicians,
    partRequests,
    transactions,
    users,
    settings,
    auditLogs
  } = payload;

  const currentEventId = eventId || syncEventId;
  if (currentEventId && Array.isArray(store.processedSyncEventIds)) {
    if (store.processedSyncEventIds.includes(currentEventId)) {
      console.log(`[SyncEngine] Event ID ${currentEventId} already processed. Skipping duplicate delivery.`);
      return;
    }
    store.processedSyncEventIds.push(currentEventId);
    if (store.processedSyncEventIds.length > 500) {
      store.processedSyncEventIds = store.processedSyncEventIds.slice(-500);
    }
  }

  if (Array.isArray(machines)) {
    store.machines = mergeMachines(store.machines || [], machines);
  }

  if (Array.isArray(buildings)) {
    store.buildings = mergeBuildings(store.buildings || [], buildings);
  }

  if (Array.isArray(floors)) {
    store.floors = mergeGenericCollection('Floor', store.floors || [], floors);
  }

  if (Array.isArray(locations)) {
    store.locations = mergeGenericCollection('Location', store.locations || [], locations);
  }

  if (Array.isArray(tickets)) {
    store.tickets = mergeTickets(store.tickets || [], tickets, store.auditLogs || []);
  }

  if (Array.isArray(spareParts)) {
    store.spareParts = mergeGenericCollection('SparePart', store.spareParts || [], spareParts);
  }

  if (Array.isArray(categories)) {
    store.categories = mergeGenericCollection('Category', store.categories || [], categories);
  }

  if (Array.isArray(suppliers)) {
    store.suppliers = mergeGenericCollection('Supplier', store.suppliers || [], suppliers);
  }

  if (Array.isArray(technicians)) {
    store.technicians = mergeGenericCollection('Technician', store.technicians || [], technicians);
  }

  if (Array.isArray(partRequests)) {
    store.partRequests = mergeGenericCollection('PartRequest', store.partRequests || [], partRequests);
  }

  if (Array.isArray(transactions)) {
    store.transactions = mergeGenericCollection('Transaction', store.transactions || [], transactions);
  }

  if (Array.isArray(users)) {
    store.users = mergeGenericCollection('User', store.users || [], users);
  }

  if (settings && typeof settings === 'object') {
    store.settings = { ...(store.settings || {}), ...settings };
  }

  if (Array.isArray(auditLogs)) {
    const existingLogs = store.auditLogs || [];
    const logIds = new Set(existingLogs.map((l: any) => l.id));
    const newLogs = auditLogs.filter((l: any) => l && l.id && !logIds.has(l.id));
    store.auditLogs = [...newLogs, ...existingLogs].slice(0, 500);
  }
}

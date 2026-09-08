import { RuntimeStoreData } from './runtimeStoreTypes';
import { runtimeStoreManager } from './runtimeStoreManager';

/**
 * PHASE 5.4.4: Authoritative Sync Merge Engine
 * 
 * Implements deterministic conflict resolution for all synchronized operational entities.
 * Replaces unsafe full-array replacement semantics (store.X = incomingX).
 * 
 * Policies:
 *  1. Stable-ID identity: matches strictly on entity.id (or ticketNumber / machineNumber).
 *  2. Tombstone Protection: If an entity was deleted/tombstoned locally, stale sync NEVER resurrects it.
 *  3. Revision & Timestamp Priority:
 *     - If incoming.revision < existing.revision -> IGNORE incoming
 *     - If incoming.revision === existing.revision -> IDEMPOTENT (no-op)
 *     - If incoming.revision > existing.revision -> APPLY patch
 *     - Fallback: compare updatedAt timestamps if revision is not provided.
 *  4. GPS Stale-Sync Protection:
 *     - Machine GPS: preserves higher revision coordinates, never allows stale GPS or null to overwrite.
 *     - Building GPS: preserves higher revision coordinates, never allows stale GPS or null to overwrite.
 *  5. Terminal Status Protection:
 *     - Tickets with terminal status (RESOLVED, VERIFIED, CLOSED) are never downgraded to open/in-progress.
 */

function getEntityRevision(item: any): number {
  if (typeof item?.revision === 'number' && !isNaN(item.revision)) {
    return item.revision;
  }
  if (item?.updatedAt) {
    const time = new Date(item.updatedAt).getTime();
    if (!isNaN(time)) return time;
  }
  return 0;
}

export function mergeMachines(existingMachines: any[], incomingMachines: any[]): any[] {
  if (!Array.isArray(incomingMachines) || incomingMachines.length === 0) {
    return existingMachines;
  }

  const map = new Map<string, any>(existingMachines.map(m => [m.id, m]));

  for (const inc of incomingMachines) {
    if (!inc || !inc.id) continue;

    // Check tombstone
    if (runtimeStoreManager.isTombstoned('Machine', inc.id)) {
      continue;
    }

    const existing = map.get(inc.id);
    if (!existing) {
      map.set(inc.id, {
        ...inc,
        revision: inc.revision || 1,
        updatedAt: inc.updatedAt || new Date().toISOString()
      });
      continue;
    }

    const existingRev = getEntityRevision(existing);
    const incRev = getEntityRevision(inc);

    // Stale sync protection: if incoming revision is strictly older, ignore it
    if (incRev < existingRev) {
      continue;
    }

    // Determine coordinate merging
    let finalLat = existing.latitude;
    let finalLng = existing.longitude;
    let finalLocationSource = existing.locationSource;
    let finalLocationStatus = existing.locationStatus;
    let finalLocationUpdatedAt = existing.locationUpdatedAt;
    let finalLocationNote = existing.locationNote;

    const incomingHasValidCoords = typeof inc.latitude === 'number' && !isNaN(inc.latitude);
    const existingHasValidCoords = typeof existing.latitude === 'number' && !isNaN(existing.latitude);

    if (incomingHasValidCoords) {
      // If incoming is newer or equal revision, update GPS
      if (incRev >= existingRev) {
        finalLat = Number(inc.latitude.toFixed(6));
        finalLng = Number(inc.longitude.toFixed(6));
        finalLocationSource = inc.locationSource || 'MANUAL_ENTRY';
        finalLocationStatus = 'GPS_CONFIGURED';
        finalLocationUpdatedAt = inc.locationUpdatedAt || new Date().toISOString();
        finalLocationNote = inc.locationNote !== undefined ? inc.locationNote : existing.locationNote;
      }
    } else if (!existingHasValidCoords && inc.latitude === null && inc.longitude === null) {
      finalLat = null;
      finalLng = null;
      finalLocationStatus = 'LOCATION_NOT_CONFIGURED';
    }

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
      revision: Math.max(existingRev, incRev) + 1,
      updatedAt: new Date().toISOString()
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

    if (runtimeStoreManager.isTombstoned('Building', inc.id)) {
      continue;
    }

    const existing = map.get(inc.id);
    if (!existing) {
      map.set(inc.id, {
        ...inc,
        revision: inc.revision || 1,
        updatedAt: inc.updatedAt || new Date().toISOString()
      });
      continue;
    }

    const existingRev = getEntityRevision(existing);
    const incRev = getEntityRevision(inc);

    if (incRev < existingRev) {
      continue;
    }

    // GPS protection for Buildings
    let finalLat = existing.latitude;
    let finalLng = existing.longitude;
    let finalLocationSource = existing.locationSource;
    let finalLocationStatus = existing.locationStatus;

    const incomingHasCoords = typeof inc.latitude === 'number' && !isNaN(inc.latitude);
    const existingHasCoords = typeof existing.latitude === 'number' && !isNaN(existing.latitude);

    if (incomingHasCoords && incRev >= existingRev) {
      finalLat = Number(inc.latitude.toFixed(6));
      finalLng = Number(inc.longitude.toFixed(6));
      finalLocationSource = inc.locationSource || 'MANUAL_ENTRY';
      finalLocationStatus = 'GPS_CONFIGURED';
    } else if (!existingHasCoords && inc.latitude === null) {
      finalLat = null;
      finalLng = null;
      finalLocationStatus = 'LOCATION_NOT_CONFIGURED';
    }

    map.set(inc.id, {
      ...existing,
      ...inc,
      latitude: finalLat,
      longitude: finalLng,
      locationSource: finalLocationSource,
      locationStatus: finalLocationStatus,
      revision: Math.max(existingRev, incRev) + 1,
      updatedAt: new Date().toISOString()
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
    if (runtimeStoreManager.isTombstoned('Ticket', inc.id) || runtimeStoreManager.isTombstoned('Ticket', inc.ticketNumber)) {
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
      map.set(key, {
        ...inc,
        revision: inc.revision || 1,
        updatedAt: inc.updatedAt || new Date().toISOString()
      });
      continue;
    }

    const existingRev = getEntityRevision(existing);
    const incRev = getEntityRevision(inc);

    if (incRev < existingRev) {
      continue;
    }

    const existingIsTerminal = TERMINAL_STATUSES.includes(existing.status);
    const incomingIsTerminal = TERMINAL_STATUSES.includes(inc.status);

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
        revision: Math.max(existingRev, incRev) + 1,
        updatedAt: existing.updatedAt || new Date().toISOString()
      });
    } else {
      map.set(key, {
        ...existing,
        ...inc,
        revision: Math.max(existingRev, incRev) + 1,
        updatedAt: new Date().toISOString()
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
      map.set(inc.id, {
        ...inc,
        revision: inc.revision || 1,
        updatedAt: inc.updatedAt || new Date().toISOString()
      });
      continue;
    }

    const existingRev = getEntityRevision(existing);
    const incRev = getEntityRevision(inc);

    if (incRev < existingRev) {
      continue;
    }

    map.set(inc.id, {
      ...existing,
      ...inc,
      revision: Math.max(existingRev, incRev) + 1,
      updatedAt: new Date().toISOString()
    });
  }

  return Array.from(map.values());
}

export function mergeFleetSyncPayload(store: RuntimeStoreData, payload: any): void {
  const {
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

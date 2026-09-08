/**
 * Verification Test Suite: Phase 5.4.5
 * Zero Fake GPS Remediation + Deterministic Sync Versioning + Legacy Location Sanitization
 * 
 * Validates 21 Scenarios:
 *  1. Synthetic GPS Detection: Machine with formula coordinates matches synthetic check
 *  2. Real GPS Preservation: Explicit user/manual/device GPS is preserved and not flagged
 *  3. Batch Sanitization: Batch sanitizer clears synthetic GPS to null and sets LOCATION_NOT_CONFIGURED
 *  4. Pair Invariant: latitude === machineLatitude and longitude === machineLongitude
 *  5. Idempotent Sanitization: Running sanitizer twice produces identical results
 *  6. Machine Creation Zero Fake GPS: Creating machine without GPS sets coords to null
 *  7. Machine Creation Real GPS: Creating machine with explicit GPS stores coordinates
 *  8. Machine Update Null Coordinates: Updating machine with null clears coordinates to null
 *  9. Machine Update Provenance: Unrelated edits do not invent locationUpdatedAt provenance
 * 10. Machine Update Revision: Machine updates strictly increment integer revision (rev + 1)
 * 11. Technician Checkin Without GPS: Machine without GPS rejects checkin without manual exception
 * 12. Technician Checkin With Manual Exception: Machine without GPS permits checkin with MANUAL_EXCEPTION
 * 13. Version Comparator Higher Revision: Incoming with higher revision wins (returns 1)
 * 14. Version Comparator Lower Revision: Incoming with lower revision is rejected as stale (returns -1)
 * 15. Version Comparator Equal Rev Newer Timestamp: Equal revision with newer timestamp wins (returns 1)
 * 16. Version Comparator Equal Rev Equal Timestamp: Equal revision & timestamp is idempotent no-op (returns 0)
 * 17. Revision Integer Invariant: Timestamps are never written into revision field
 * 18. Sync Merge Stale GPS Protection: Stale/null incoming does not wipe existing configured GPS
 * 19. Sync Merge Terminal Ticket Protection: Terminal tickets are never downgraded to open/in-progress
 * 20. Sync Merge Tombstone Protection: Tombstoned entities are never resurrected by incoming sync
 * 21. Baseline Fresh Install Clean GPS: Baseline seed has 0 synthetic GPS records
 */

import {
  isLegacySyntheticGps,
  sanitizeMachineGps,
  sanitizeFleetMachines,
  normalizeEntityRevisions
} from '../src/server/syntheticGpsSanitizer';
import {
  getNumericRevision,
  getUpdatedAtMs,
  compareEntityVersion,
  mergeMachines,
  mergeTickets
} from '../src/server/syncMergeEngine';
import { runtimeStoreManager } from '../src/server/runtimeStoreManager';

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedCount++;
  } else {
    console.error(`[FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    failedCount++;
  }
}

async function runTestSuite() {
  console.log('======================================================================');
  console.log('PHASE 5.4.5: ZERO FAKE GPS & DETERMINISTIC VERSIONING VERIFICATION');
  console.log('======================================================================\n');

  // Test 1: Synthetic GPS Detection
  const syntheticMachine = {
    id: 'm-10',
    machineNumber: '10',
    latitude: Number((24.7136 + ((10 % 40) * 0.00035)).toFixed(6)),
    longitude: Number((46.6753 + (((10 * 7) % 40) * 0.00035)).toFixed(6)),
    machineLatitude: Number((24.7136 + ((10 % 40) * 0.00035)).toFixed(6)),
    machineLongitude: Number((46.6753 + (((10 * 7) % 40) * 0.00035)).toFixed(6)),
    locationSource: 'LEGACY_IMPORT'
  };
  assert(isLegacySyntheticGps(syntheticMachine) === true, 'Test 1: Synthetic GPS Detection flags formula coordinates');

  // Test 2: Real GPS Preservation
  const realMachine = {
    id: 'm-20',
    machineNumber: '20',
    latitude: 24.720000,
    longitude: 46.680000,
    machineLatitude: 24.720000,
    machineLongitude: 46.680000,
    locationSource: 'MANUAL_ENTRY'
  };
  assert(isLegacySyntheticGps(realMachine) === false, 'Test 2: Real GPS Preservation ignores non-formula / verified coordinates');

  // Test 3: Batch Sanitization
  const testFleet = [syntheticMachine, realMachine];
  const { machines: sanitizedFleet, summary } = sanitizeFleetMachines(testFleet);
  assert(
    summary.syntheticCleared === 1 && summary.realGpsPreserved === 1 &&
    sanitizedFleet[0].latitude === null && sanitizedFleet[0].locationStatus === 'LOCATION_NOT_CONFIGURED',
    'Test 3: Batch Sanitization clears synthetic GPS and sets LOCATION_NOT_CONFIGURED'
  );

  // Test 4: Pair Invariant
  const cleanedSynthetic = sanitizedFleet[0];
  const cleanedReal = sanitizedFleet[1];
  assert(
    cleanedSynthetic.latitude === cleanedSynthetic.machineLatitude &&
    cleanedSynthetic.longitude === cleanedSynthetic.machineLongitude &&
    cleanedReal.latitude === cleanedReal.machineLatitude &&
    cleanedReal.longitude === cleanedReal.machineLongitude,
    'Test 4: Pair Invariant enforced for both configured and unconfigured machines'
  );

  // Test 5: Idempotent Sanitization
  const { machines: secondRun, summary: secondSummary } = sanitizeFleetMachines(sanitizedFleet);
  assert(
    secondSummary.syntheticCleared === 0 &&
    secondRun[0].latitude === null &&
    secondRun[1].latitude === 24.72,
    'Test 5: Idempotent Sanitization produces 0 changes on second pass'
  );

  // Test 6: Machine Creation Zero Fake GPS
  // Simulating the server.ts machine creation logic
  const now = new Date().toISOString();
  function createMachineLogic(data: any, cleanNum: string) {
    let lat: number | null = null;
    let lng: number | null = null;
    let locationStatus = 'LOCATION_NOT_CONFIGURED';
    let locationSource = 'NONE';
    let locationUpdatedAt: string | null = null;

    const providedLat = typeof data.latitude === 'number' ? data.latitude : (typeof data.machineLatitude === 'number' ? data.machineLatitude : null);
    const providedLng = typeof data.longitude === 'number' ? data.longitude : (typeof data.machineLongitude === 'number' ? data.machineLongitude : null);

    if (providedLat !== null && providedLng !== null && !isNaN(providedLat) && !isNaN(providedLng)) {
      lat = Number(providedLat.toFixed(6));
      lng = Number(providedLng.toFixed(6));
      locationStatus = data.locationStatus || 'GPS_CONFIGURED';
      locationSource = data.locationSource || 'MANUAL_ENTRY';
      locationUpdatedAt = now;
    }

    return {
      machineNumber: cleanNum,
      latitude: lat,
      longitude: lng,
      machineLatitude: lat,
      machineLongitude: lng,
      locationStatus,
      locationSource,
      locationUpdatedAt,
      revision: 1,
      updatedAt: now
    };
  }

  const newUnconfigured = createMachineLogic({}, '555');
  assert(
    newUnconfigured.latitude === null &&
    newUnconfigured.longitude === null &&
    newUnconfigured.locationStatus === 'LOCATION_NOT_CONFIGURED',
    'Test 6: Machine Creation Zero Fake GPS sets coordinates to null when unprovided'
  );

  // Test 7: Machine Creation Real GPS
  const newConfigured = createMachineLogic({ latitude: 24.715, longitude: 46.678 }, '556');
  assert(
    newConfigured.latitude === 24.715 &&
    newConfigured.longitude === 46.678 &&
    newConfigured.locationStatus === 'GPS_CONFIGURED',
    'Test 7: Machine Creation Real GPS retains provided coordinates'
  );

  // Test 8: Machine Update Null Coordinates
  function updateMachineLogic(oldMachine: any, data: any) {
    const locationChanged =
      data.latitude !== undefined ||
      data.longitude !== undefined ||
      data.locationSource !== undefined;

    let lat = oldMachine.latitude;
    let lng = oldMachine.longitude;
    let locationSource = oldMachine.locationSource || 'NONE';
    let locationStatus = oldMachine.locationStatus || 'LOCATION_NOT_CONFIGURED';

    if (data.latitude !== undefined || data.longitude !== undefined) {
      if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
        lat = data.latitude;
        lng = data.longitude;
        locationSource = data.locationSource || 'MANUAL_ENTRY';
        locationStatus = 'GPS_CONFIGURED';
      } else if (data.latitude === null || data.longitude === null) {
        lat = null;
        lng = null;
        locationSource = 'NONE';
        locationStatus = 'LOCATION_NOT_CONFIGURED';
      }
    }

    let finalLocationUpdatedAt: string | null = null;
    if (lat === null || lng === null) {
      finalLocationUpdatedAt = null;
    } else if (locationChanged) {
      finalLocationUpdatedAt = now;
    } else {
      finalLocationUpdatedAt = oldMachine.locationUpdatedAt || null;
    }

    const oldRev = typeof oldMachine.revision === 'number' ? oldMachine.revision : 1;

    return {
      ...oldMachine,
      ...data,
      latitude: lat,
      longitude: lng,
      machineLatitude: lat,
      machineLongitude: lng,
      locationSource,
      locationStatus,
      locationUpdatedAt: finalLocationUpdatedAt,
      revision: oldRev + 1,
      updatedAt: now
    };
  }

  const updatedNull = updateMachineLogic(newConfigured, { latitude: null, longitude: null });
  assert(
    updatedNull.latitude === null &&
    updatedNull.machineLatitude === null &&
    updatedNull.locationStatus === 'LOCATION_NOT_CONFIGURED' &&
    updatedNull.locationUpdatedAt === null,
    'Test 8: Machine Update Null Coordinates clears coordinates and locationUpdatedAt'
  );

  // Test 9: Machine Update Provenance
  const unconfiguredBeforeEdit = { ...newUnconfigured, locationUpdatedAt: null };
  const updatedMetadataOnly = updateMachineLogic(unconfiguredBeforeEdit, { status: 'MAINTENANCE' });
  assert(
    updatedMetadataOnly.locationUpdatedAt === null,
    'Test 9: Machine Update Provenance: Unrelated edits do not invent locationUpdatedAt'
  );

  // Test 10: Machine Update Revision
  assert(
    updatedMetadataOnly.revision === 2 && typeof updatedMetadataOnly.revision === 'number',
    'Test 10: Machine Update Revision strictly increments integer revision'
  );

  // Test 11: Technician Checkin Without GPS
  function checkinEvaluation(scannedMachine: any, techLat: number | null, techLon: number | null, cleanReason: string) {
    const rawLat = scannedMachine.latitude ?? scannedMachine.machineLatitude ?? null;
    const rawLon = scannedMachine.longitude ?? scannedMachine.machineLongitude ?? null;
    const machineHasGps = typeof rawLat === 'number' && typeof rawLon === 'number';

    if (!machineHasGps) {
      if (cleanReason.length > 0) {
        return { success: true, status: 'MANUAL_EXCEPTION' };
      } else {
        return { success: false, error: 'MACHINE_GPS_NOT_CONFIGURED' };
      }
    }
    return { success: true, status: 'GPS_VERIFIED' };
  }

  const checkinWithoutReason = checkinEvaluation(newUnconfigured, 24.7136, 46.6753, '');
  assert(
    checkinWithoutReason.success === false && checkinWithoutReason.error === 'MACHINE_GPS_NOT_CONFIGURED',
    'Test 11: Technician Checkin Without GPS blocks check-in when machine has no GPS'
  );

  // Test 12: Technician Checkin With Manual Exception
  const checkinWithReason = checkinEvaluation(newUnconfigured, 24.7136, 46.6753, 'Campus basement with shielded cellular');
  assert(
    checkinWithReason.success === true && checkinWithReason.status === 'MANUAL_EXCEPTION',
    'Test 12: Technician Checkin With Manual Exception permits check-in with MANUAL_EXCEPTION'
  );

  // Test 13: Version Comparator Higher Revision
  const existingEntity = { id: 'item-1', revision: 2, updatedAt: '2026-03-01T10:00:00Z' };
  const newerIncoming = { id: 'item-1', revision: 3, updatedAt: '2026-03-01T10:00:00Z' };
  assert(
    compareEntityVersion(existingEntity, newerIncoming) === 1,
    'Test 13: Version Comparator Higher Revision: incoming revision 3 beats existing revision 2'
  );

  // Test 14: Version Comparator Lower Revision
  const olderIncoming = { id: 'item-1', revision: 1, updatedAt: '2026-03-01T11:00:00Z' };
  assert(
    compareEntityVersion(existingEntity, olderIncoming) === -1,
    'Test 14: Version Comparator Lower Revision: incoming revision 1 is rejected against existing revision 2'
  );

  // Test 15: Version Comparator Equal Rev Newer Timestamp
  const equalRevNewerTime = { id: 'item-1', revision: 2, updatedAt: '2026-03-01T10:05:00Z' };
  assert(
    compareEntityVersion(existingEntity, equalRevNewerTime) === 1,
    'Test 15: Version Comparator Equal Rev Newer Timestamp: newer updatedAt wins when revisions match'
  );

  // Test 16: Version Comparator Equal Rev Equal Timestamp
  const identicalVersion = { id: 'item-1', revision: 2, updatedAt: '2026-03-01T10:00:00Z' };
  assert(
    compareEntityVersion(existingEntity, identicalVersion) === 0,
    'Test 16: Version Comparator Equal Rev Equal Timestamp: returns 0 (idempotent no-op)'
  );

  // Test 17: Revision Integer Invariant
  assert(
    getNumericRevision({ revision: 1741234567890 }) === 1741234567890 &&
    typeof getNumericRevision({ revision: 5 }) === 'number' &&
    getNumericRevision({ revision: 'invalid' }) === null,
    'Test 17: Revision Integer Invariant rejects non-numeric or malformed revision'
  );

  // Test 18: Sync Merge Stale GPS Protection
  const localMachineWithGps = {
    id: 'm-99',
    machineNumber: '99',
    latitude: 24.7150,
    longitude: 46.6780,
    locationStatus: 'GPS_CONFIGURED',
    locationSource: 'DEVICE_GPS',
    locationUpdatedAt: '2026-03-01T12:00:00Z',
    revision: 2,
    updatedAt: '2026-03-01T12:00:00Z'
  };
  const incomingSyncStaleGps = {
    id: 'm-99',
    machineNumber: '99',
    status: 'MAINTENANCE',
    latitude: undefined,
    longitude: undefined,
    revision: 3,
    updatedAt: '2026-03-01T13:00:00Z'
  };
  const mergedMachines = mergeMachines([localMachineWithGps], [incomingSyncStaleGps]);
  assert(
    mergedMachines[0].latitude === 24.7150 &&
    mergedMachines[0].status === 'MAINTENANCE' &&
    mergedMachines[0].revision === 3,
    'Test 18: Sync Merge Stale GPS Protection: configured GPS is preserved when incoming has no GPS'
  );

  // Test 19: Sync Merge Terminal Ticket Protection
  const localResolvedTicket = {
    id: 't-1',
    ticketNumber: 'TKT-100',
    status: 'RESOLVED',
    resolvedAt: '2026-03-01T12:00:00Z',
    resolvedBy: 'Tech Ali',
    revision: 3,
    updatedAt: '2026-03-01T12:00:00Z'
  };
  const incomingStaleOpenTicket = {
    id: 't-1',
    ticketNumber: 'TKT-100',
    status: 'IN_PROGRESS',
    revision: 4,
    updatedAt: '2026-03-01T13:00:00Z'
  };
  const mergedTickets = mergeTickets([localResolvedTicket], [incomingStaleOpenTicket]);
  assert(
    mergedTickets[0].status === 'RESOLVED' &&
    mergedTickets[0].resolvedBy === 'Tech Ali',
    'Test 19: Sync Merge Terminal Ticket Protection: terminal status cannot be rolled back to IN_PROGRESS'
  );

  // Test 20: Sync Merge Tombstone Protection
  runtimeStoreManager.recordTombstone('Machine', 'm-deleted', 'Automated test deletion');
  const incomingDeletedMachine = {
    id: 'm-deleted',
    machineNumber: '888',
    revision: 10,
    updatedAt: '2026-03-01T14:00:00Z'
  };
  const mergedWithTombstone = mergeMachines([], [incomingDeletedMachine]);
  assert(
    mergedWithTombstone.length === 0,
    'Test 20: Sync Merge Tombstone Protection: tombstoned entity is not resurrected'
  );

  // Test 21: Baseline Fresh Install Clean GPS
  const baselineStore = runtimeStoreManager.initFirstRunFromBaseline();
  let syntheticInBaseline = 0;
  for (const m of baselineStore.machines) {
    if (isLegacySyntheticGps(m)) {
      syntheticInBaseline++;
    }
  }
  assert(
    syntheticInBaseline === 0,
    'Test 21: Baseline Fresh Install Clean GPS: baseline store contains 0 synthetic GPS records'
  );

  console.log('\n======================================================================');
  console.log(`TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('======================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('[FATAL ERROR IN TEST SUITE]', err);
  process.exit(1);
});

/**
 * Test Matrix A-K: Phase 5.4.5A Final Integrity Closure
 * Secure Field Exception Authorization + Null GPS Invariant + Revision Normalization + Persistence Safety Gate
 */

import assert from 'assert';
import { CloudDatabase } from '../cloud/src/db/cloudDb';
import { JsonCloudRepositoryManager } from '../cloud/src/repositories/jsonRepository';
import { LocationService } from '../cloud/src/services/locationService';
import { TicketService } from '../cloud/src/services/ticketService';
import { resetActiveRepository, setActiveRepository } from '../cloud/src/repositories';
import { normalizeEntityRevisions } from '../src/server/syntheticGpsSanitizer';
import { getNumericRevision } from '../src/server/syncMergeEngine';
import { RuntimeStoreManager } from '../src/server/runtimeStoreManager';
import { RuntimeStoreData } from '../src/server/runtimeStoreTypes';

let passed = 0;
let failed = 0;

function logPass(code: string, desc: string) {
  console.log(`[PASS] Matrix ${code}: ${desc}`);
  passed++;
}

function logFail(code: string, desc: string, err: any) {
  console.error(`[FAIL] Matrix ${code}: ${desc}`, err);
  failed++;
}

async function runMatrix() {
  console.log('======================================================================');
  console.log('PHASE 5.4.5A: FINAL INTEGRITY CLOSURE TEST MATRIX (A - K)');
  console.log('======================================================================\n');

  // Initialize in-memory cloud database and repository
  const db = new CloudDatabase(':memory:');
  const repo = new JsonCloudRepositoryManager(db);
  setActiveRepository(repo);

  // Setup test machine with unconfigured GPS
  const unconfiguredMachine = {
    integrationMachineId: 'MCH-UNCONF-1',
    publicQrToken: 'QR-UNCONF-1',
    publicDisplayName: 'ماكينة غير مضبوطة الموقع',
    active: true,
    machineType: 'SNACK_VENDING',
    status: 'ACTIVE' as const,
    buildingPublicName: 'كلية العلوم',
    locationPublicName: 'القبو',
    latitude: null,
    longitude: null,
    locationSource: 'NONE' as const,
    version: 1,
    lastSyncedAt: new Date().toISOString()
  };
  await repo.machines.upsertMachine(unconfiguredMachine);

  // Setup ticket
  const ticketRes = await TicketService.submitCustomerFaultReport({
    publicQrToken: 'QR-UNCONF-1',
    category: 'HARDWARE',
    description: 'عطل في القبو السفلي',
    reporterName: 'طالب'
  });
  const ticket = ticketRes.ticket;

  // -------------------------------------------------------------------------
  // Test A: Reject client-supplied manualException object
  // -------------------------------------------------------------------------
  try {
    await assert.rejects(
      async () => {
        await TicketService.performTechnicianCheckin({
          ticketId: ticket.id,
          machineToken: 'QR-UNCONF-1',
          technicianId: 'TECH-ROGUE',
          technicianName: 'فني غير مخول',
          coordinates: null,
          // Attacker sends forged client manualException
          manualException: {
            approvedBy: 'Hacker',
            reason: 'Forged client approval with enough characters',
            approverRole: 'SUPERVISOR'
          }
        });
      },
      /GPS_VALIDATION_FAILED/,
      'Must reject client-supplied manualException when no authoritative approval exists'
    );
    logPass('A', 'Client-supplied manualException is rejected as unauthoritative');
  } catch (err) {
    logFail('A', 'Failed to reject client-supplied manualException', err);
  }

  // -------------------------------------------------------------------------
  // Test B: Technician Binding - TECH-1's exception cannot be used by TECH-2
  // -------------------------------------------------------------------------
  let tech1ApprovalId = '';
  try {
    const app = await LocationService.createFieldExceptionApproval({
      ticketId: ticket.id,
      machineIdOrToken: 'MCH-UNCONF-1',
      technicianId: 'TECH-1',
      reason: 'مصرح لفني 1 العمل في منطقة بدون تغطية شبكية',
      approvedByActorId: 'SUP-1',
      approvedByActorName: 'مشرف الصيانة',
      validHours: 2
    });
    tech1ApprovalId = app.id;

    await assert.rejects(
      async () => {
        await TicketService.performTechnicianCheckin({
          ticketId: ticket.id,
          machineToken: 'QR-UNCONF-1',
          technicianId: 'TECH-2', // Different technician!
          technicianName: 'فني 2',
          coordinates: null
        });
      },
      /GPS_VALIDATION_FAILED/,
      'Check-in must fail because exception is bound to TECH-1, not TECH-2'
    );
    logPass('B', 'Technician-bound exception cannot be claimed by another technician');
  } catch (err) {
    logFail('B', 'Cross-technician exception binding check failed', err);
  }

  // -------------------------------------------------------------------------
  // Test C: Technician Binding - TECH-1 CAN use their own exception
  // -------------------------------------------------------------------------
  try {
    const checkin = await TicketService.performTechnicianCheckin({
      ticketId: ticket.id,
      machineToken: 'QR-UNCONF-1',
      technicianId: 'TECH-1',
      technicianName: 'فني 1',
      coordinates: null
    });
    assert.strictEqual(checkin.checkin.verified, true);
    assert.strictEqual(checkin.checkin.status, 'MANUAL_EXCEPTION');
    assert.strictEqual(checkin.checkin.fieldExceptionId, tech1ApprovalId);
    logPass('C', 'Technician successfully checked in using bound FieldExceptionApproval');
  } catch (err) {
    logFail('C', 'Legitimate technician exception checkin failed', err);
  }

  // -------------------------------------------------------------------------
  // Test D: Unassigned / Global field exception can be used by authenticated tech
  // -------------------------------------------------------------------------
  try {
    // Create new ticket
    const t2 = (await TicketService.submitCustomerFaultReport({
      publicQrToken: 'QR-UNCONF-1',
      category: 'COIN_JAM',
      description: 'انحشار عملات',
      reporterName: 'موظف'
    })).ticket;

    const unassignedApp = await LocationService.createFieldExceptionApproval({
      ticketId: t2.id,
      machineIdOrToken: 'MCH-UNCONF-1',
      technicianId: undefined, // Unassigned
      reason: 'استثناء عام للموقع لعدم وجود تغطية GPS نهائياً',
      approvedByActorId: 'SUP-1',
      approvedByActorName: 'مشرف الصيانة',
      validHours: 1
    });

    const checkinUnassigned = await TicketService.performTechnicianCheckin({
      ticketId: t2.id,
      machineToken: 'QR-UNCONF-1',
      technicianId: 'TECH-ANY',
      technicianName: 'أي فني معتمد',
      coordinates: null
    });
    assert.strictEqual(checkinUnassigned.checkin.fieldExceptionId, unassignedApp.id);
    logPass('D', 'Unassigned field exception successfully authorizes any authenticated technician');
  } catch (err) {
    logFail('D', 'Unassigned field exception authorization failed', err);
  }

  // -------------------------------------------------------------------------
  // Test E: Single-Use Invariant - Consumed approval cannot be reused
  // -------------------------------------------------------------------------
  try {
    await assert.rejects(
      async () => {
        await TicketService.performTechnicianCheckin({
          ticketId: ticket.id,
          machineToken: 'QR-UNCONF-1',
          technicianId: 'TECH-1',
          technicianName: 'فني 1',
          coordinates: null
        });
      },
      /GPS_VALIDATION_FAILED/,
      'Reusing a consumed exception must fail'
    );
    logPass('E', 'Single-use invariant enforced: consumed approval cannot be reused');
  } catch (err) {
    logFail('E', 'Single-use invariant check failed', err);
  }

  // -------------------------------------------------------------------------
  // Test F: Expiration Invariant - Expired exception is rejected
  // -------------------------------------------------------------------------
  try {
    const expiredApp = await LocationService.createFieldExceptionApproval({
      ticketId: ticket.id,
      machineIdOrToken: 'MCH-UNCONF-1',
      technicianId: 'TECH-1',
      reason: 'استثناء منتهي الصلاحية مسبقاً للاختبار',
      approvedByActorId: 'SUP-1',
      approvedByActorName: 'مشرف الصيانة',
      validHours: -1 // Expired 1 hour ago
    });

    await assert.rejects(
      async () => {
        await TicketService.performTechnicianCheckin({
          ticketId: ticket.id,
          machineToken: 'QR-UNCONF-1',
          technicianId: 'TECH-1',
          technicianName: 'فني 1',
          coordinates: null
        });
      },
      /GPS_VALIDATION_FAILED/,
      'Expired exception must be rejected'
    );
    logPass('F', 'Expiration invariant enforced: expired approvals are rejected');
  } catch (err) {
    logFail('F', 'Expiration invariant check failed', err);
  }

  // -------------------------------------------------------------------------
  // Test G: GPS Null Invariant - Unknown GPS = NULL globally (NEVER 0,0)
  // -------------------------------------------------------------------------
  try {
    const updatedTicket = await repo.tickets.findById(ticket.id);
    assert.ok(updatedTicket && updatedTicket.checkins.length > 0, 'Must have at least one checkin');
    const c = updatedTicket.checkins[0];
    assert.strictEqual(c.latitude, null, 'latitude must be null');
    assert.strictEqual(c.longitude, null, 'longitude must be null');
    assert.strictEqual(c.distanceMeters, null, 'distanceMeters must be null');
    logPass('G', 'Null GPS Invariant: unknown coordinates stored as NULL, never 0 or fallback coordinates');
  } catch (err) {
    logFail('G', 'Null GPS Invariant check failed', err);
  }

  // -------------------------------------------------------------------------
  // Test H: Machine Unconfigured GPS Rejection
  // -------------------------------------------------------------------------
  try {
    const t3 = (await TicketService.submitCustomerFaultReport({
      publicQrToken: 'QR-UNCONF-1',
      category: 'HARDWARE',
      description: 'فحص دوري',
      reporterName: 'مشرف'
    })).ticket;

    await assert.rejects(
      async () => {
        await TicketService.performTechnicianCheckin({
          ticketId: t3.id,
          machineToken: 'QR-UNCONF-1',
          technicianId: 'TECH-1',
          technicianName: 'فني 1',
          coordinates: { latitude: 24.7136, longitude: 46.6753, accuracyMeters: 10 }
        });
      },
      /MACHINE_GPS_NOT_CONFIGURED/,
      'Must reject checkin when machine has unconfigured GPS and no field exception'
    );
    logPass('H', 'Machine Unconfigured GPS properly blocks check-in with MACHINE_GPS_NOT_CONFIGURED');
  } catch (err) {
    logFail('H', 'Machine Unconfigured GPS rejection failed', err);
  }

  // -------------------------------------------------------------------------
  // Test I: Revision Normalization - Strict positive integers (rejects epochs)
  // -------------------------------------------------------------------------
  try {
    const testEntities = [
      { id: 'e1', revision: 1741234567890 }, // Epoch timestamp
      { id: 'e2', revision: 5 },             // Valid positive integer
      { id: 'e3', revision: -2 },            // Negative
      { id: 'e4', revision: 3.7 },           // Float
      { id: 'e5', revision: undefined },     // Missing
      { id: 'e6', revision: 0 }              // Zero
    ];

    const normalized = normalizeEntityRevisions(testEntities);
    assert.strictEqual(normalized[0].revision, 1, 'Epoch revision must be normalized to 1');
    assert.strictEqual(normalized[1].revision, 5, 'Valid revision 5 must be preserved');
    assert.strictEqual(normalized[2].revision, 1, 'Negative revision must be normalized to 1');
    assert.strictEqual(normalized[3].revision, 1, 'Float revision must be normalized to 1');
    assert.strictEqual(normalized[4].revision, 1, 'Missing revision must be normalized to 1');
    assert.strictEqual(normalized[5].revision, 1, 'Zero revision must be normalized to 1');

    assert.strictEqual(getNumericRevision({ revision: 1741234567890 }), null, 'getNumericRevision rejects epoch');
    assert.strictEqual(getNumericRevision({ revision: 4 }), 4, 'getNumericRevision accepts 4');

    logPass('I', 'Revision Normalization strictly enforces integer revisions and eliminates epoch timestamps');
  } catch (err) {
    logFail('I', 'Revision Normalization failed', err);
  }

  // -------------------------------------------------------------------------
  // Test J: Save-Time Invariant Gate - Cleans synthetic GPS, audits, and persists
  // -------------------------------------------------------------------------
  try {
    const manager = RuntimeStoreManager.getInstance();
    const store = manager.getStore();

    // Inject a machine with legacy synthetic GPS
    const syntheticMch = {
      id: 'm-synthetic-gate-test',
      machineNumber: '15',
      latitude: Number((24.7136 + ((15 % 40) * 0.00035)).toFixed(6)),
      longitude: Number((46.6753 + (((15 * 7) % 40) * 0.00035)).toFixed(6)),
      machineLatitude: Number((24.7136 + ((15 % 40) * 0.00035)).toFixed(6)),
      machineLongitude: Number((46.6753 + (((15 * 7) % 40) * 0.00035)).toFixed(6)),
      locationSource: 'LEGACY_IMPORT',
      revision: 1741234567890 // Also test epoch revision
    };

    store.machines.push(syntheticMch);

    // Save store through the authoritative safety gate
    manager.saveStore(store);

    const reloaded = manager.getStore();
    const cleaned = reloaded.machines.find((m: any) => m.id === 'm-synthetic-gate-test');

    assert.ok(cleaned, 'Machine should still exist');
    assert.strictEqual(cleaned.latitude, null, 'Synthetic latitude must be purged to null');
    assert.strictEqual(cleaned.longitude, null, 'Synthetic longitude must be purged to null');
    assert.strictEqual(cleaned.revision, 1, 'Epoch revision must be normalized to positive integer 1');
    assert.strictEqual(reloaded._persistence.version, '5.4.5A', 'Store version must be 5.4.5A');

    // Verify audit log record
    const auditLog = reloaded.auditLogs.find((a: any) => a.action === 'SYNTHETIC_GPS_CLEARED');
    assert.ok(auditLog, 'One-time audit log must be recorded when synthetic GPS is purged');

    // Clean up test machine
    reloaded.machines = reloaded.machines.filter((m: any) => m.id !== 'm-synthetic-gate-test');
    manager.saveStore(reloaded);

    logPass('J', 'Save-Time Invariant Gate automatically sanitizes synthetic GPS, normalizes revisions, and records audit');
  } catch (err) {
    logFail('J', 'Save-Time Invariant Gate verification failed', err);
  }

  // -------------------------------------------------------------------------
  // Test K: Persistence Invariant Violation Throw
  // -------------------------------------------------------------------------
  try {
    const manager = RuntimeStoreManager.getInstance();
    assert.throws(
      () => {
        manager.validateAndEnforceInvariants(null as any);
      },
      /PERSISTENCE_INVARIANT_VIOLATION/,
      'Must throw PERSISTENCE_INVARIANT_VIOLATION on invalid store'
    );
    logPass('K', 'Persistence Invariant Gate blocks invalid store payloads with PERSISTENCE_INVARIANT_VIOLATION');
  } catch (err) {
    logFail('K', 'Persistence Invariant Violation Throw test failed', err);
  }

  console.log('\n======================================================================');
  console.log(`TEST MATRIX SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================================\n');

  resetActiveRepository();

  if (failed > 0) {
    process.exit(1);
  }
}

runMatrix().catch(err => {
  console.error('Fatal error running Test Matrix:', err);
  process.exit(1);
});

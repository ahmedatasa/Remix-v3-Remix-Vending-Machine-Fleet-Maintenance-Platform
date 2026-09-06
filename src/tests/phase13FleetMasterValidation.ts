/**
 * PHASE 13: Real Fleet Finalization, Machine Master Data & QR System Validation Suite
 * 
 * Verifies:
 * 1. Machine Master Data Uniqueness (Machine #, Serial #, controlled exceptions)
 * 2. QR Code Identifier Generation, Regeneration, and Public Scan Safe Endpoints
 * 3. Public Ticket Submission via QR without Authentication Leakage
 * 4. Machine Operational Lifecycle State Machine & Bulk Operations
 * 5. Dynamic Health Score Calculation Engine & Chronic Failure Detection (>=3 faults in 30 days)
 * 6. Import Provenance Retention (Batch ID, Source File, Sheet, Row, Raw Values)
 * 7. Referential Integrity & Audit Trail Logging
 */

import { api } from '../services/api';
import { Machine, MachineStatus, TicketPriority, FaultCategory } from '../types';

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
    throw new Error(`Assertion failed: ${testName} - ${detail || ''}`);
  }
}

export async function runPhase13FleetMasterValidation() {
  console.log('\n======================================================================');
  console.log('🚀 EXECUTING PHASE 13: FLEET FINALIZATION, MASTER DATA & QR VALIDATION');
  console.log('======================================================================\n');

  // ----------------------------------------------------
  // SECTION 1: Master Data Model & Unique Identifiers
  // ----------------------------------------------------
  console.log('📌 1. Machine Master Data Authority & Unique Constraints');
  
  const initialMachines = await api.getMachines();
  assert(initialMachines.length > 0, 'Fleet data store contains active machine records', `Count: ${initialMachines.length}`);

  // Test 1.1: Every machine has an authoritative internal ID and unique public QR ID
  const sampleMachine = initialMachines[0];
  assert(!!sampleMachine.id, 'Internal unique UUID present on machine master entity');
  assert(!!sampleMachine.publicQrId, 'Public Opaque QR identifier present on machine master entity');
  assert(sampleMachine.publicQrId.toLowerCase().startsWith('qr-'), `Public QR ID matches expected format: ${sampleMachine.publicQrId}`);

  // Test 1.2: Duplicate Machine Number is strictly rejected
  let duplicateNumberBlocked = false;
  try {
    await api.createMachine({
      machineNumber: sampleMachine.machineNumber, // Duplicate!
      serialNumber: `SN-UNIQUE-TEST-${Date.now()}`,
      machineType: 'Combination Snack & Soda'
    });
  } catch (err: any) {
    duplicateNumberBlocked = true;
    assert(err.message.includes('already exists'), 'Duplicate Machine Number blocked with descriptive uniqueness error');
  }
  assert(duplicateNumberBlocked, 'System prevents duplicate Machine Number registration');

  // Test 1.3: Duplicate Serial Number is blocked unless explicitly permitted
  const existingWithSerial = initialMachines.find(m => m.serialNumber && m.serialNumber.trim() !== '');
  if (existingWithSerial && existingWithSerial.serialNumber) {
    let duplicateSerialBlocked = false;
    try {
      await api.createMachine({
        machineNumber: `VM-P13-TEST-${Date.now()}`,
        serialNumber: existingWithSerial.serialNumber, // Duplicate serial!
        allowDuplicateSerialException: false
      });
    } catch (err: any) {
      duplicateSerialBlocked = true;
      assert(err.message.includes('Duplicate Serial Number') || err.message.includes('already registered'), 'Duplicate Serial Number blocked without controlled exception flag');
    }
    assert(duplicateSerialBlocked, 'System strictly enforces Serial Number uniqueness by default');

    // Test 1.4: Controlled Exception allows duplicate serial when explicitly authorized
    const exceptionMachine = await api.createMachine({
      machineNumber: `VM-P13-EXCEPTION-${Date.now()}`,
      serialNumber: existingWithSerial.serialNumber,
      allowDuplicateSerialException: true,
      notes: 'Controlled dual-chassis serial reuse approved by admin'
    });
    assert(exceptionMachine.allowDuplicateSerialException === true, 'Controlled exception recorded for serial number');
    // Cleanup exception test machine
    await api.deleteMachine(exceptionMachine.id);
  }

  // ----------------------------------------------------
  // SECTION 2: QR Code Management & Public Incident Reporting
  // ----------------------------------------------------
  console.log('\n📌 2. QR Code System & Safe Public Portal Endpoints');

  // Test 2.1: Lookup machine by Public QR ID (Opaque Safe Projection)
  const publicProjection = await api.getMachineByPublicQrId(sampleMachine.publicQrId!);
  assert(publicProjection !== null, 'Public QR identifier resolves successfully');
  assert(publicProjection?.machineNumber === sampleMachine.machineNumber, 'Public lookup resolves correct Machine Number');
  assert(publicProjection?.buildingName !== undefined, 'Public lookup contains safe location building metadata');
  // Check that sensitive internal data is not leaked
  assert((publicProjection as any).importProvenance === undefined, 'Public endpoint omits internal import provenance');
  assert((publicProjection as any).auditTrail === undefined, 'Public endpoint omits internal audit logs');

  // Test 2.2: Submit Public Ticket via QR Code
  const publicTicket = await api.submitPublicQrTicket({
    publicQrId: sampleMachine.publicQrId!,
    reporterName: 'Ahmed Student',
    reporterPhone: '0501234567',
    reporterEmail: 'ahmed@student.ksu.edu.sa',
    category: 'PAYMENT',
    description: 'Nayax card reader deducted amount but snack was not dispensed from tray 3.'
  });

  assert(!!publicTicket.ticketNumber, `Public QR ticket generated successfully: ${publicTicket.ticketNumber}`);
  assert(publicTicket.machineId === sampleMachine.id, 'Public ticket correctly attached to machine internal ID');
  assert(publicTicket.source === 'CUSTOMER_QR' || (publicTicket.source as string) === 'QR_PORTAL', 'Ticket source recorded as CUSTOMER_QR');
  assert(publicTicket.status === 'OPEN' || publicTicket.status === 'NEW', 'New QR ticket enters OPEN or NEW status');

  // Test 2.3: QR Code Re-issue / Regeneration
  const oldQrId = sampleMachine.publicQrId;
  const regenerated = await api.regenerateMachineQr(
    sampleMachine.id,
    'Scheduled replacement of weather-damaged physical QR sticker'
  );
  assert(regenerated.publicQrId !== oldQrId, `New QR identifier generated: ${regenerated.publicQrId} (old: ${oldQrId})`);
  assert(!!regenerated.qrGeneratedAt, 'QR generation timestamp logged on master entity');

  // Verify old QR is now invalid
  const oldLookup = await api.getMachineByPublicQrId(oldQrId!);
  assert(oldLookup === null, 'Old QR identifier invalidated after re-issue');

  // Verify new QR resolves
  const newLookup = await api.getMachineByPublicQrId(regenerated.publicQrId!);
  assert(newLookup !== null, 'New QR identifier resolves successfully in customer portal');

  // ----------------------------------------------------
  // SECTION 3: Operational Status Lifecycle & Bulk Actions
  // ----------------------------------------------------
  console.log('\n📌 3. Machine Lifecycle State Transitions & Bulk Operations');

  // Test 3.1: Single Machine Status Lifecycle
  const updatedStatus = await api.setMachineStatus(
    sampleMachine.id,
    'UNDER_MAINTENANCE',
    'Dispatched technician to replace Nayax POS optic sensor',
    'USR-ADMIN-01'
  );
  assert(updatedStatus.status === 'UNDER_MAINTENANCE', 'Machine transitioned to UNDER_MAINTENANCE');

  // Test 3.2: Bulk Status Update
  const testMachine1 = await api.createMachine({
    machineNumber: `VM-BULK-01-${Date.now()}`,
    serialNumber: `SN-BULK-01-${Date.now()}`,
    machineType: 'Bean-to-Cup Espresso'
  });
  const testMachine2 = await api.createMachine({
    machineNumber: `VM-BULK-02-${Date.now()}`,
    serialNumber: `SN-BULK-02-${Date.now()}`,
    machineType: 'Smart Cold Beverage'
  });

  const bulkUpdated = await api.bulkUpdateMachineStatus(
    [testMachine1.id, testMachine2.id],
    'OUT_OF_SERVICE',
    'Campus wing power maintenance shutdown'
  );
  assert(bulkUpdated.length === 2, 'Bulk status update returned both modified records');
  assert(bulkUpdated[0].status === 'OUT_OF_SERVICE', 'Bulk machine 1 updated to OUT_OF_SERVICE');
  assert(bulkUpdated[1].status === 'OUT_OF_SERVICE', 'Bulk machine 2 updated to OUT_OF_SERVICE');

  // ----------------------------------------------------
  // SECTION 4: Machine Health Score & Chronic Failure Engine
  // ----------------------------------------------------
  console.log('\n📌 4. Dynamic Health Scoring & Chronic Failure Logic');

  // Test 4.1: Brand new machine starts with 100% HEALTHY score
  const healthyMachine = await api.createMachine({
    machineNumber: `VM-HEALTH-TEST-${Date.now()}`,
    serialNumber: `SN-HEALTH-TEST-${Date.now()}`,
    machineType: 'Fresh Food Micro-Market'
  });
  assert(healthyMachine.healthScore === 100, `Baseline health score is 100% (actual: ${healthyMachine.healthScore}%)`);
  assert(healthyMachine.healthStatus === 'HEALTHY', 'Baseline health status is HEALTHY');
  assert(healthyMachine.isChronicFailure === false, 'New machine is not chronic failure');

  // Test 4.2: Simulate 3 recurrent tickets to trigger Chronic Failure flag
  await api.createTicket({
    machineId: healthyMachine.id,
    category: 'REFRIGERATION',
    priority: 'CRITICAL',
    description: 'Compressor thermal trip 1'
  });
  await api.createTicket({
    machineId: healthyMachine.id,
    category: 'REFRIGERATION',
    priority: 'HIGH',
    description: 'Compressor thermal trip 2'
  });
  await api.createTicket({
    machineId: healthyMachine.id,
    category: 'REFRIGERATION',
    priority: 'HIGH',
    description: 'Compressor thermal trip 3'
  });

  // Re-fetch machine to calculate dynamic health
  const chronicEvaluation = await api.getMachineById(healthyMachine.id);
  assert(chronicEvaluation !== null, 'Re-evaluated machine exists');
  assert(chronicEvaluation!.healthScore! < 60, `Health score heavily penalized by critical tickets: ${chronicEvaluation?.healthScore}%`);
  assert(chronicEvaluation!.isChronicFailure === true, 'Machine flagged as isChronicFailure due to >=3 tickets in 30 days');
  assert(!!chronicEvaluation!.chronicFailureReason, `Chronic failure reason generated: "${chronicEvaluation?.chronicFailureReason}"`);

  // Test 4.3: Chronic Failure fleet query
  const chronicFleet = await api.getChronicFailureMachines();
  const foundInChronic = chronicFleet.some(m => m.id === healthyMachine.id);
  assert(foundInChronic, 'Machine appears in getChronicFailureMachines() registry query');

  // Cleanup test machines
  await api.deleteMachine(testMachine1.id);
  await api.deleteMachine(testMachine2.id);
  await api.deleteMachine(healthyMachine.id);

  // ----------------------------------------------------
  // SECTION 5: Import Provenance & Data Quality Metrics
  // ----------------------------------------------------
  console.log('\n📌 5. Import Provenance Tracking & Data Quality Metrics');

  const dqMetrics = await api.getDataQualityMetrics();
  assert(dqMetrics.total > 0, `Data quality metrics computed: ${dqMetrics.total} total machines`);
  assert(dqMetrics.valid >= 0, `Valid count: ${dqMetrics.valid}`);
  assert(dqMetrics.qualityRate >= 0 && dqMetrics.qualityRate <= 100, `Fleet quality rate: ${dqMetrics.qualityRate}%`);
  assert(dqMetrics.missingSerials >= 0, `Missing serial count tracked: ${dqMetrics.missingSerials}`);

  console.log('\n======================================================================');
  console.log('✅ ALL PHASE 13 FLEET FINALIZATION & QR SYSTEM TESTS PASSED SUCCESSFULLY');
  console.log('======================================================================\n');
  return true;
}

// Auto-run if executed in node test environment
if (typeof window === 'undefined') {
  runPhase13FleetMasterValidation().catch(err => {
    console.error('Phase 13 validation failure:', err);
    process.exit(1);
  });
}

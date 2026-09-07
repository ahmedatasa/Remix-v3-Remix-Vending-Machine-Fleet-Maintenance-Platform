import assert from 'assert';
import { CloudDatabase } from '../cloud/src/db/cloudDb';
import { JsonCloudRepositoryManager } from '../cloud/src/repositories/jsonRepository';
import { LocationService } from '../cloud/src/services/locationService';
import { TicketService } from '../cloud/src/services/ticketService';
import { GpsService } from '../cloud/src/services/gpsService';
import { resetActiveRepository, setActiveRepository } from '../cloud/src/repositories';

async function runPhase54Verification() {
  console.log('================================================================');
  console.log('🧪 PHASE 5.4 VERIFICATION: Location Management & Secure Field Exceptions');
  console.log('================================================================\n');

  // Initialize in-memory test database and repo
  const db = new CloudDatabase(':memory:');
  const repo = new JsonCloudRepositoryManager(db);
  setActiveRepository(repo);

  // Setup test machine
  console.log('🔹 Test 1: Setting up test machine in fleet...');
  const testMachine = {
    integrationMachineId: 'KSU-MCH-001',
    publicQrToken: 'QR-KSU-001',
    publicDisplayName: 'ماكينة كلية الهندسة 01',
    active: true,
    machineType: 'SNACK_VENDING',
    status: 'ACTIVE' as const,
    buildingPublicName: 'كلية الهندسة',
    locationPublicName: 'الدور الأرضي - المدخل الرئيسي',
    latitude: 24.7136,
    longitude: 46.6753,
    locationSource: 'MANUAL_ENTRY' as const,
    locationNote: 'موقع معتمد مسبقاً',
    version: 1,
    lastSyncedAt: new Date().toISOString()
  };
  await repo.machines.upsertMachine(testMachine);
  const fetchedMachine = await repo.machines.findByIntegrationId('KSU-MCH-001');
  assert.ok(fetchedMachine, 'Machine should exist in repository');
  assert.strictEqual(fetchedMachine.latitude, 24.7136);
  assert.strictEqual(fetchedMachine.locationSource, 'MANUAL_ENTRY');
  console.log('   ✓ Machine created with initial coordinates and source MANUAL_ENTRY.\n');

  // Test 2: Distance calculation in GpsService
  console.log('🔹 Test 2: Verifying Haversine distance calculation in GpsService...');
  // Point A and Point B separated by known distance (e.g., identical points = 0m)
  const distZero = GpsService.calculateDistanceMeters(24.7136, 46.6753, 24.7136, 46.6753);
  assert.strictEqual(distZero, 0, 'Identical coordinates must have 0m distance');
  
  // ~111m per 0.001 degree latitude
  const distShort = GpsService.calculateDistanceMeters(24.7136, 46.6753, 24.7146, 46.6753);
  assert.ok(distShort >= 100 && distShort <= 120, `Distance should be ~111m, got ${distShort}m`);
  console.log(`   ✓ Distance calculation accurate (${distShort}m).\n`);

  // Test 3: Location Proposal Submission by Technician
  console.log('🔹 Test 3: Technician submitting location proposal...');
  const proposal = await LocationService.submitProposal({
    machineTokenOrId: 'QR-KSU-001',
    latitude: 24.7150,
    longitude: 46.6760,
    accuracyMeters: 12,
    technicianId: 'TECH-101',
    technicianName: 'فهد المهندس',
    ticketId: 'TCK-999',
    clientIp: '192.168.1.50'
  });

  assert.ok(proposal.id.startsWith('prop-'), 'Proposal ID must start with prop-');
  assert.strictEqual(proposal.status, 'PENDING');
  assert.strictEqual(proposal.integrationMachineId, 'KSU-MCH-001');
  assert.strictEqual(proposal.latitude, 24.7150);
  assert.strictEqual(proposal.longitude, 46.6760);
  assert.strictEqual(proposal.accuracyMeters, 12);
  console.log(`   ✓ Proposal submitted: ${proposal.id} (Status: ${proposal.status}).\n`);

  // Test 4: List Pending Proposals
  console.log('🔹 Test 4: Manager querying pending proposals...');
  const pending = await LocationService.listPendingProposals();
  assert.strictEqual(pending.length, 1);
  assert.strictEqual(pending[0].id, proposal.id);
  console.log(`   ✓ Retrieved ${pending.length} pending proposal(s).\n`);

  // Test 5: Validation rules on proposal coordinates
  console.log('🔹 Test 5: Rejecting invalid coordinates (out of range)...');
  await assert.rejects(
    async () => {
      await LocationService.submitProposal({
        machineTokenOrId: 'QR-KSU-001',
        latitude: 105.0, // Invalid latitude
        longitude: 46.6760,
        accuracyMeters: 10,
        technicianId: 'TECH-101',
        technicianName: 'فهد المهندس'
      });
    },
    /INVALID_LATITUDE/,
    'Should reject latitude > 90'
  );
  console.log('   ✓ Rejected invalid latitude appropriately.\n');

  // Test 6: Manager Approves Proposal -> Machine coordinates updated
  console.log('🔹 Test 6: Manager approving proposal...');
  const approveResult = await LocationService.approveProposal({
    proposalId: proposal.id,
    approverId: 'MGR-001',
    approverName: 'أحمد المشرف',
    clientIp: '10.0.0.1'
  });

  assert.strictEqual(approveResult.proposal.status, 'APPROVED');
  assert.strictEqual(approveResult.proposal.approvedByActorId, 'MGR-001');
  assert.strictEqual(approveResult.machine.latitude, 24.7150);
  assert.strictEqual(approveResult.machine.longitude, 46.6760);
  assert.strictEqual(approveResult.machine.locationSource, 'TECHNICIAN_PROPOSAL_APPROVED');

  // Verify in repo
  const updatedMachine = await repo.machines.findByIntegrationId('KSU-MCH-001');
  assert.strictEqual(updatedMachine?.latitude, 24.7150);
  assert.strictEqual(updatedMachine?.locationSource, 'TECHNICIAN_PROPOSAL_APPROVED');
  assert.strictEqual(updatedMachine?.locationUpdatedByActorId, 'MGR-001');
  console.log('   ✓ Machine coordinates updated to proposed location with source TECHNICIAN_PROPOSAL_APPROVED.\n');

  // Test 7: Manual Location Update and Clear
  console.log('🔹 Test 7: Manual location update and clear by management...');
  const manualMachine = await LocationService.updateLocationManually({
    machineIdOrToken: 'KSU-MCH-001',
    latitude: 24.7200,
    longitude: 46.6800,
    locationSource: 'MAP_PICKER',
    locationNote: 'تحديد دقيق عبر الخريطة السحابية',
    actorId: 'ADMIN-1',
    actorName: 'مدير الصيانة'
  });
  assert.strictEqual(manualMachine.latitude, 24.7200);
  assert.strictEqual(manualMachine.locationSource, 'MAP_PICKER');
  assert.strictEqual(manualMachine.locationNote, 'تحديد دقيق عبر الخريطة السحابية');

  const clearedMachine = await LocationService.clearLocation({
    machineIdOrToken: 'KSU-MCH-001',
    actorId: 'ADMIN-1',
    actorName: 'مدير الصيانة'
  });
  assert.strictEqual(clearedMachine.latitude, null);
  assert.strictEqual(clearedMachine.longitude, null);
  assert.strictEqual(clearedMachine.locationSource, 'NONE');
  console.log('   ✓ Manual location update and clear functioning properly.\n');

  // Test 8: Secure Field Exception Flow during Technician Check-In
  console.log('🔹 Test 8: Secure Field Exception Approval flow...');
  // Create ticket
  const ticketRes = await TicketService.submitCustomerFaultReport({
    publicQrToken: 'QR-KSU-001',
    category: 'COIN_JAM',
    description: 'الماكينة عالقة بالعملات المعدنية بالدور السفلي',
    reporterName: 'طالب جامعي'
  });
  const ticket = ticketRes.ticket;

  // Attempt check-in without coordinates or exception (machine has no coordinates right now)
  console.log('   Sub-test 8a: Attempting check-in with no machine coordinates and no exception...');
  await assert.rejects(
    async () => {
      await TicketService.performTechnicianCheckin({
        ticketId: ticket.id,
        machineToken: 'QR-KSU-001',
        technicianId: 'TECH-101',
        technicianName: 'فهد المهندس',
        coordinates: { latitude: 24.7200, longitude: 46.6800, accuracyMeters: 10 }
      });
    },
    /GPS_VALIDATION_FAILED/,
    'Check-in must fail when machine coordinates are unconfigured'
  );
  console.log('   ✓ Check-in failed as expected (machine coordinates missing).\n');

  // Supervisor creates a FieldExceptionApproval
  console.log('   Sub-test 8b: Supervisor issues FieldExceptionApproval...');
  const exceptionApproval = await LocationService.createFieldExceptionApproval({
    ticketId: ticket.id,
    machineIdOrToken: 'KSU-MCH-001',
    technicianId: 'TECH-101',
    reason: 'الماكينة في القبو السفلي المعزول ومعدومة التغطية اللاسلكية والـ GPS',
    approvedByActorId: 'SUP-99',
    approvedByActorName: 'مشرف الصيانة الميدانية',
    validHours: 2
  });

  assert.ok(exceptionApproval.id.startsWith('fld-exp-'));
  assert.strictEqual(exceptionApproval.status, 'APPROVED');
  assert.strictEqual(exceptionApproval.ticketId, ticket.id);
  console.log(`   ✓ Field exception created: ${exceptionApproval.id} (Valid for 2 hours).\n`);

  // Technician checks in now -> should succeed using the active exception!
  console.log('   Sub-test 8c: Technician checks in with active FieldExceptionApproval...');
  const checkinRes = await TicketService.performTechnicianCheckin({
    ticketId: ticket.id,
    machineToken: 'QR-KSU-001',
    technicianId: 'TECH-101',
    technicianName: 'فهد المهندس',
    coordinates: null
  });

  assert.ok(checkinRes.checkin.verified, 'Check-in must be verified');
  assert.strictEqual(checkinRes.checkin.status, 'MANUAL_EXCEPTION');
  assert.strictEqual(checkinRes.checkin.fieldExceptionId, exceptionApproval.id);
  assert.strictEqual(checkinRes.ticket.status, 'IN_PROGRESS');
  console.log('   ✓ Check-in successfully authorized via FieldExceptionApproval!\n');

  // Verify exception was marked as USED
  console.log('   Sub-test 8d: Verifying FieldExceptionApproval is consumed (single-use)...');
  const consumed = await repo.fieldExceptions.findById(exceptionApproval.id);
  assert.strictEqual(consumed?.status, 'USED');
  assert.ok(consumed?.usedAt, 'usedAt must be set');

  // Second check-in without GPS should now FAIL because exception was already consumed
  await assert.rejects(
    async () => {
      await TicketService.performTechnicianCheckin({
        ticketId: ticket.id,
        machineToken: 'QR-KSU-001',
        technicianId: 'TECH-101',
        technicianName: 'فهد المهندس',
        coordinates: null
      });
    },
    /GPS_VALIDATION_FAILED/,
    'Subsequent check-in must fail because exception has already been consumed'
  );
  console.log('   ✓ Single-use guarantee verified: Used exception cannot be reused.\n');

  // Test 9: Verify sync events were generated
  console.log('🔹 Test 9: Verifying sync events in audit buffer...');
  const { events: syncEvents } = await repo.syncEvents.getEventsAfter(0, 100);
  const eventTypes = syncEvents.map(e => e.eventType);
  assert.ok(eventTypes.includes('MACHINE_LOCATION_PROPOSED'), 'Must have MACHINE_LOCATION_PROPOSED event');
  assert.ok(eventTypes.includes('MACHINE_LOCATION_APPROVED'), 'Must have MACHINE_LOCATION_APPROVED event');
  assert.ok(eventTypes.includes('MACHINE_LOCATION_MANUALLY_UPDATED'), 'Must have MACHINE_LOCATION_MANUALLY_UPDATED event');
  assert.ok(eventTypes.includes('MACHINE_LOCATION_CLEARED'), 'Must have MACHINE_LOCATION_CLEARED event');
  assert.ok(eventTypes.includes('FIELD_EXCEPTION_APPROVED'), 'Must have FIELD_EXCEPTION_APPROVED event');
  assert.ok(eventTypes.includes('FIELD_EXCEPTION_USED'), 'Must have FIELD_EXCEPTION_USED event');
  console.log(`   ✓ All required sync events generated (${syncEvents.length} events logged).\n`);

  console.log('================================================================');
  console.log('🎉 ALL PHASE 5.4 TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================\n');

  resetActiveRepository();
}

runPhase54Verification().catch(err => {
  console.error('❌ VERIFICATION FAILED:', err);
  process.exit(1);
});

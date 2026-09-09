import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  resolveRuntimeDataDir,
  resolveRuntimeDataPath,
  resolveBackupsDir,
  resolveBaselineDataPath
} from '../src/server/runtimePathResolver';
import { RuntimeStoreManager } from '../src/server/runtimeStoreManager';
import {
  mergeMachines,
  mergeBuildings,
  mergeTickets,
  mergeFleetSyncPayload
} from '../src/server/syncMergeEngine';

async function runTestSuite() {
  console.log('======================================================================');
  console.log('PHASE 5.4.4: AUTHORITATIVE PERSISTENCE INTEGRITY VERIFICATION SUITE');
  console.log('======================================================================');

  let passedAssertions = 0;
  let totalAssertions = 0;

  function assert(condition: boolean, message: string) {
    totalAssertions++;
    if (condition) {
      passedAssertions++;
      console.log(`  [PASS] #${totalAssertions}: ${message}`);
    } else {
      console.error(`  [FAIL] #${totalAssertions}: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // Use an isolated temporary sandbox directory for test isolation
  const testSandboxDir = path.join(os.tmpdir(), `vending-test-persistence-${Date.now()}`);
  fs.mkdirSync(testSandboxDir, { recursive: true });
  process.env.VENDING_DATA_DIR = testSandboxDir;

  try {
    // ------------------------------------------------------------------
    // TEST 1: Path Resolver Correctness & Environment Override
    // ------------------------------------------------------------------
    console.log('\n--- TEST 1: Path Resolver & Directory Isolation ---');
    const runtimeDir = resolveRuntimeDataDir();
    const runtimePath = resolveRuntimeDataPath();
    const backupsDir = resolveBackupsDir();

    assert(runtimeDir === testSandboxDir, 'resolveRuntimeDataDir respects VENDING_DATA_DIR override');
    assert(runtimePath === path.join(testSandboxDir, 'fleet_runtime_data.json'), 'resolveRuntimeDataPath points to fleet_runtime_data.json in durable dir');
    assert(fs.existsSync(backupsDir), 'resolveBackupsDir creates backups directory');
    assert(!runtimePath.includes('fleet_data.json'), 'Runtime path does NOT target legacy tracked fleet_data.json');

    // ------------------------------------------------------------------
    // TEST 2: First-Run Seeding from Baseline (Isolation of Dynamic Collections)
    // ------------------------------------------------------------------
    console.log('\n--- TEST 2: First-Run Baseline Seeding & Dynamic Isolation ---');
    RuntimeStoreManager.resetInstance();
    const manager = RuntimeStoreManager.getInstance();
    const initialStore = manager.initFirstRunFromBaseline();

    assert(initialStore.initialized === true, 'Store marked as initialized');
    assert(initialStore.machines.length === 189, `189 machines seeded from baseline (got ${initialStore.machines.length})`);
    assert(initialStore.buildings.length === 32, `32 buildings seeded from baseline (got ${initialStore.buildings.length})`);
    assert(initialStore.locations.length === 55, `55 locations seeded from baseline (got ${initialStore.locations.length})`);
    assert(initialStore.tickets.length === 0, 'Dynamic tickets start empty on fresh baseline seeding');
    assert(initialStore.partRequests.length === 0, 'Dynamic partRequests start empty on fresh baseline seeding');
    assert(initialStore.transactions.length === 0, 'Dynamic transactions start empty on fresh baseline seeding');
    assert(initialStore._persistence.schemaVersion >= 3, 'Schema version is >= 3');
    assert(fs.existsSync(runtimePath), 'Authoritative runtime file created on disk');

    // ------------------------------------------------------------------
    // TEST 3: Runtime Mutation Persistence & Baseline Immunity on Restart
    // ------------------------------------------------------------------
    console.log('\n--- TEST 3: Runtime Mutation & Baseline Immunity Across Restart ---');
    // Add a real dynamic operational ticket to runtime store
    const testTicket = {
      id: 'tck-test-544-01',
      ticketNumber: 'TCK-2026-9999',
      machineId: initialStore.machines[0].id,
      machineNumber: initialStore.machines[0].machineNumber,
      title: 'Phase 5.4.4 Test Ticket',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      revision: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    initialStore.tickets.push(testTicket);

    // Update GPS coordinates for machine 0
    const originalMachineId = initialStore.machines[0].id;
    initialStore.machines[0].latitude = 24.725812;
    initialStore.machines[0].longitude = 46.623491;
    initialStore.machines[0].locationStatus = 'GPS_CONFIGURED';
    initialStore.machines[0].revision = 10;
    initialStore.machines[0].updatedAt = new Date().toISOString();

    manager.saveStore(initialStore);

    // Simulate complete process crash / restart by resetting singleton
    RuntimeStoreManager.resetInstance();
    const restartedManager = RuntimeStoreManager.getInstance();
    const restartedStore = restartedManager.load();

    assert(restartedStore.tickets.length === 1, 'Dynamic operational ticket survived restart');
    assert(restartedStore.tickets[0].ticketNumber === 'TCK-2026-9999', 'Ticket attributes preserved intact');
    const reloadedMachine = restartedStore.machines.find((m: any) => m.id === originalMachineId);
    assert(reloadedMachine?.latitude === 24.725812, 'Machine GPS latitude preserved across restart');
    assert(reloadedMachine?.longitude === 46.623491, 'Machine GPS longitude preserved across restart');
    assert(reloadedMachine?.locationStatus === 'GPS_CONFIGURED', 'Machine GPS status preserved');

    // Verify master baseline file was NOT touched or modified
    const baselineRaw = fs.readFileSync(resolveBaselineDataPath(), 'utf8');
    const baselineParsed = JSON.parse(baselineRaw);
    assert(baselineParsed.tickets.length === 0, 'Baseline file remains clean with 0 dynamic tickets');

    // ------------------------------------------------------------------
    // TEST 4: Stale-Sync GPS Conflict Resolution
    // ------------------------------------------------------------------
    console.log('\n--- TEST 4: Stale-Sync GPS Conflict Resolution ---');
    // Machine has revision 10 with coordinates (24.725812, 46.623491)
    // Stale sync comes with revision 5 and coordinates (24.700000, 46.600000)
    const staleSyncMachine = {
      id: originalMachineId,
      latitude: 24.700000,
      longitude: 46.600000,
      revision: 5,
      locationNote: 'Stale mobile GPS'
    };

    const mergedAfterStale = mergeMachines(restartedStore.machines, [staleSyncMachine]);
    const testedMachine = mergedAfterStale.find((m: any) => m.id === originalMachineId);
    assert(testedMachine.latitude === 24.725812, 'Stale lower-revision GPS did NOT overwrite higher-revision GPS');
    assert(testedMachine.longitude === 46.623491, 'Stale lower-revision GPS did NOT overwrite longitude');

    // Null GPS overwrite protection
    const nullSyncMachine = {
      id: originalMachineId,
      latitude: null,
      longitude: null,
      revision: 15
    };
    const mergedAfterNull = mergeMachines(restartedStore.machines, [nullSyncMachine]);
    const testedMachineNull = mergedAfterNull.find((m: any) => m.id === originalMachineId);
    assert(testedMachineNull.latitude === 24.725812, 'Null GPS in sync payload did NOT wipe valid configured GPS');

    // Newer revision GPS update works
    const newerSyncMachine = {
      id: originalMachineId,
      latitude: 24.730000,
      longitude: 46.630000,
      revision: 12,
      locationSource: 'MOBILE_TECH_GPS'
    };
    const mergedAfterNewer = mergeMachines(restartedStore.machines, [newerSyncMachine]);
    const testedMachineNewer = mergedAfterNewer.find((m: any) => m.id === originalMachineId);
    assert(testedMachineNewer.latitude === 24.730000, 'Valid newer revision GPS correctly updated machine coordinates');

    // ------------------------------------------------------------------
    // TEST 5: Terminal Ticket Downgrade Protection & Resurrection Prevention
    // ------------------------------------------------------------------
    console.log('\n--- TEST 5: Terminal Ticket Protection & Resurrection Prevention ---');
    // Set ticket to RESOLVED
    const activeTicket = restartedStore.tickets[0];
    activeTicket.status = 'RESOLVED';
    activeTicket.resolvedAt = new Date().toISOString();
    activeTicket.resolvedBy = 'Eng. Ahmed';
    activeTicket.resolutionSummary = 'Replaced power board';
    activeTicket.revision = 5;

    // Incoming stale sync has status = 'IN_PROGRESS'
    const staleTicketIncoming = {
      id: activeTicket.id,
      ticketNumber: activeTicket.ticketNumber,
      status: 'IN_PROGRESS',
      revision: 3
    };
    const mergedTickets = mergeTickets(restartedStore.tickets, [staleTicketIncoming]);
    const verifiedTicket = mergedTickets.find((t: any) => t.id === activeTicket.id);
    assert(verifiedTicket.status === 'RESOLVED', 'Terminal status RESOLVED is protected from downgrade to IN_PROGRESS');
    assert(verifiedTicket.resolvedBy === 'Eng. Ahmed', 'Resolution details preserved during stale sync');

    // ------------------------------------------------------------------
    // TEST 6: Persistent Tombstones on Entity Deletion
    // ------------------------------------------------------------------
    console.log('\n--- TEST 6: Persistent Tombstones & Deleted Entity Protection ---');
    // Delete ticket and record tombstone
    restartedManager.recordTombstone('Ticket', activeTicket.id, 'Admin', 'Deleted during verification');
    restartedStore.tickets = restartedStore.tickets.filter((t: any) => t.id !== activeTicket.id);
    restartedManager.saveStore(restartedStore);

    assert(restartedManager.isTombstoned('Ticket', activeTicket.id), 'Tombstone recorded in manager');

    // Incoming sync attempts to re-add the deleted ticket
    const resurrectedTickets = mergeTickets(restartedStore.tickets, [activeTicket]);
    assert(!resurrectedTickets.some((t: any) => t.id === activeTicket.id), 'Deleted ticket with tombstone was NOT resurrected by sync');

    // Machine deletion tombstone
    restartedManager.recordTombstone('Machine', 'm-deleted-test', 'Admin', 'Test machine deletion');
    const incomingDeletedMachine = [{ id: 'm-deleted-test', machineNumber: 'MC-DEL-01' }];
    const mergedMachinesTombstone = mergeMachines(restartedStore.machines, incomingDeletedMachine);
    assert(!mergedMachinesTombstone.some((m: any) => m.id === 'm-deleted-test'), 'Deleted machine with tombstone was NOT resurrected');

    // ------------------------------------------------------------------
    // TEST 7: Building GPS Protection
    // ------------------------------------------------------------------
    console.log('\n--- TEST 7: Building GPS Stale-Sync Protection ---');
    const building = restartedStore.buildings[0];
    building.latitude = 24.711111;
    building.longitude = 46.611111;
    building.revision = 6;

    const staleBuildingSync = {
      id: building.id,
      latitude: 24.700000,
      longitude: 46.600000,
      revision: 2
    };
    const mergedBuildings = mergeBuildings(restartedStore.buildings, [staleBuildingSync]);
    const testedBuilding = mergedBuildings.find((b: any) => b.id === building.id);
    assert(testedBuilding.latitude === 24.711111, 'Building GPS protected from stale lower-revision overwrite');

    // ------------------------------------------------------------------
    // TEST 8: Full Sync Payload Merge (No Blind Array Replacement)
    // ------------------------------------------------------------------
    console.log('\n--- TEST 8: Safe Sync Payload Merge Engine ---');
    const syncPayload = {
      machines: [
        { id: restartedStore.machines[1].id, notes: 'Updated notes via sync', revision: 2 }
      ],
      buildings: [
        { id: restartedStore.buildings[1].id, notes: 'Building updated via sync', revision: 2 }
      ],
      settings: { criticalSla: 3 }
    };

    mergeFleetSyncPayload(restartedStore, syncPayload);
    assert(restartedStore.machines.length === 189, 'Machine fleet count preserved at 189 machines');
    assert(restartedStore.buildings.length === 32, 'Building count preserved at 32 buildings');
    assert(restartedStore.settings.criticalSla === 3, 'Settings updated cleanly');

    // ------------------------------------------------------------------
    // TEST 9: Atomic Write & Backup Creation
    // ------------------------------------------------------------------
    console.log('\n--- TEST 9: Atomic Write & Automated Backup ---');
    const backupPath = restartedManager.createBackup('test-verification');
    assert(fs.existsSync(backupPath), 'Timestamped backup file created on disk');
    const backupRaw = fs.readFileSync(backupPath, 'utf8');
    const backupJson = JSON.parse(backupRaw);
    assert(backupJson.machines.length === 189, 'Backup contains complete fleet state (189 machines)');

    // ------------------------------------------------------------------
    // TEST 10: One-Time Legacy Migration Engine
    // ------------------------------------------------------------------
    console.log('\n--- TEST 10: Legacy Migration Engine ---');
    let migrationSandboxDir: string | null = null;
    try {
      migrationSandboxDir = path.join(os.tmpdir(), `vending-test-migration-${Date.now()}`);
      fs.mkdirSync(migrationSandboxDir, { recursive: true });
      process.env.VENDING_DATA_DIR = migrationSandboxDir;

      RuntimeStoreManager.resetInstance();
      const migrationManager = RuntimeStoreManager.getInstance();

      // Call migrateLegacyStore
      const migrationResult = migrationManager.migrateLegacyStore();
      assert(migrationResult.migrated === true, 'Legacy migration executed successfully');
      assert(migrationResult.status === 'COMPLETE', 'Migration status is COMPLETE');
      assert(fs.existsSync(migrationManager.getRuntimeDataPath()), 'Migrated fleet_runtime_data.json created');

      const migratedStore = migrationManager.load();
      assert(migratedStore.machines.length === 189, `189 machines migrated from legacy data (got ${migratedStore.machines.length})`);
      const legacyExpectedTickets = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'fleet_data.json'), 'utf8')).tickets?.length || 15;
      assert(migratedStore.tickets.length === legacyExpectedTickets, `All ${legacyExpectedTickets} operational tickets migrated from legacy data (got ${migratedStore.tickets.length})`);
      assert(migratedStore._persistence.legacyMigrationCompletedAt !== null, 'legacyMigrationCompletedAt recorded in metadata');
      assert(migratedStore._persistence.schemaVersion >= 3, 'Migrated schema version upgraded to >= 3');

      // Re-running migration is idempotent and skipped
      const secondMigration = migrationManager.migrateLegacyStore();
      assert(secondMigration.migrated === false, 'Subsequent migration skipped because runtime store is already initialized');
      assert(secondMigration.status === 'SKIPPED_ALREADY_INITIALIZED', 'Idempotent migration status SKIPPED_ALREADY_INITIALIZED');
    } finally {
      if (migrationSandboxDir) {
        try {
          fs.rmSync(migrationSandboxDir, { recursive: true, force: true });
        } catch {}
      }
    }

    console.log('\n======================================================================');
    console.log(`ALL ASSERTIONS PASSED: ${passedAssertions} / ${totalAssertions} assertions verified`);
    console.log('PHASE 5.4.4 AUTHORITATIVE PERSISTENCE INTEGRITY FULLY CONFIRMED');
    console.log('======================================================================\n');
  } finally {
    // Cleanup temporary test sandboxes
    try {
      fs.rmSync(testSandboxDir, { recursive: true, force: true });
    } catch {}
    delete process.env.VENDING_DATA_DIR;
  }
}

runTestSuite().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});

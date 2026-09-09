import fs from 'fs';
import path from 'path';
import os from 'os';
import assert from 'assert';
import { RuntimeStoreManager } from '../src/server/runtimeStoreManager';

async function runTestSuite() {
  console.log('======================================================================');
  console.log('PHASE 5.4.5C: AUDIT & DIAGNOSTICS CLOSURE VERIFICATION');
  console.log('======================================================================');

  let passed = 0;
  let total = 0;

  function logPass(code: string, message: string) {
    total++;
    passed++;
    console.log(`  [PASS] [${code}] #${total}: ${message}`);
  }

  // Record initial hashes of protected data to guarantee test isolation
  const trackedFleetDataPath = path.join(process.cwd(), 'fleet_data.json');
  const initialFleetData = fs.readFileSync(trackedFleetDataPath, 'utf8');
  const trackedCloudDataPath = path.join(process.cwd(), 'cloud_data.json');
  const initialCloudData = fs.readFileSync(trackedCloudDataPath, 'utf8');

  // Test sandbox 1: 189 synthetic GPS legacy fleet fixture
  const sandbox1 = path.join(os.tmpdir(), `vending-phase545c-test1-${Date.now()}`);
  fs.mkdirSync(sandbox1, { recursive: true });

  // Test sandbox 2: Zero synthetic GPS migration fixture
  const sandbox2 = path.join(os.tmpdir(), `vending-phase545c-test2-${Date.now()}`);
  fs.mkdirSync(sandbox2, { recursive: true });

  try {
    // =========================================================================
    // Create 189-machine synthetic legacy fixture for Sandbox 1
    // Matches campus formula coordinates:
    //   lat = round6(24.7136 + ((num % 40) * 0.00035))
    //   lng = round6(46.6753 + (((num * 7) % 40) * 0.00035))
    // =========================================================================
    const syntheticFixturePath = path.join(sandbox1, 'legacy_synthetic_fleet.json');
    const syntheticMachines = Array.from({ length: 189 }, (_, i) => {
      const num = i + 1;
      const machineNumber = String(num);
      const lat = Number((24.7136 + ((num % 40) * 0.00035)).toFixed(6));
      const lng = Number((46.6753 + (((num * 7) % 40) * 0.00035)).toFixed(6));
      return {
        id: `mch-synth-${num}`,
        machineNumber,
        serialNumber: `SN-${1000 + num}`,
        machineType: 'Standard Vending Machine',
        latitude: lat,
        longitude: lng,
        machineLatitude: lat,
        machineLongitude: lng,
        locationSource: 'LEGACY_IMPORT',
        locationStatus: 'GPS_CONFIGURED',
        revision: 1
      };
    });

    const legacySyntheticData = {
      machines: syntheticMachines,
      buildings: [],
      floors: [],
      locations: [],
      tickets: [],
      technicians: [],
      auditLogs: []
    };
    fs.writeFileSync(syntheticFixturePath, JSON.stringify(legacySyntheticData, null, 2), 'utf8');

    // =========================================================================
    // TEST A: Migration clearing synthetic GPS creates exactly ONE audit event
    // =========================================================================
    console.log('\n--- TEST A: Migration Clearing Synthetic GPS ---');
    process.env.VENDING_DATA_DIR = sandbox1;
    process.env.VENDING_LEGACY_DATA_PATH = syntheticFixturePath;

    RuntimeStoreManager.resetInstance();
    const manager1 = RuntimeStoreManager.getInstance();

    const migrationRes1 = manager1.migrateLegacyStore();
    assert.strictEqual(migrationRes1.migrated, true, 'Migration must execute successfully');
    assert.strictEqual(migrationRes1.status, 'COMPLETE', 'Migration status must be COMPLETE');

    const store1 = manager1.load();
    assert.strictEqual(store1.machines.length, 189, 'Store must contain 189 machines');

    // Check that all 189 machines have NULL GPS
    const nonNullGps = store1.machines.filter((m: any) => m.latitude !== null || m.longitude !== null);
    assert.strictEqual(nonNullGps.length, 0, 'All 189 machines must have NULL GPS after sanitization');

    // Audit log check: exactly ONE SYNTHETIC_GPS_CLEARED event
    const gpsAudits = (store1.auditLogs || []).filter((a: any) => a.action === 'SYNTHETIC_GPS_CLEARED');
    assert.strictEqual(gpsAudits.length, 1, 'Exactly ONE SYNTHETIC_GPS_CLEARED batch audit event must be persisted');

    const auditEvent = gpsAudits[0];
    assert.strictEqual(auditEvent.category, 'INTEGRITY_AUDIT', 'Audit category must be INTEGRITY_AUDIT');
    assert.strictEqual(auditEvent.action, 'SYNTHETIC_GPS_CLEARED', 'Audit action must be SYNTHETIC_GPS_CLEARED');
    assert.strictEqual(auditEvent.actorType, 'SYSTEM', 'Audit actorType must be SYSTEM');
    assert.ok(['FLEET', 'SYSTEM'].includes(auditEvent.entity || auditEvent.entityType), 'Audit entity must be FLEET or SYSTEM');
    assert.strictEqual(auditEvent.result, 'SUCCESS', 'Audit result must be SUCCESS');

    // Verify audit details payload
    assert.ok(auditEvent.details, 'Audit must have details object');
    assert.strictEqual(auditEvent.details.syntheticCleared, 189, 'details.syntheticCleared must be 189');
    assert.strictEqual(auditEvent.details.realGpsPreserved, 0, 'details.realGpsPreserved must be 0');
    assert.strictEqual(auditEvent.details.schemaVersion, 4, 'details.schemaVersion must be 4');
    assert.strictEqual(auditEvent.details.migrationSource, path.basename(syntheticFixturePath), 'details.migrationSource must match filename');
    assert.ok(auditEvent.details.timestamp, 'details.timestamp must exist');

    logPass('A', 'Legacy migration clearing 189 synthetic GPS coordinates creates exactly ONE batch audit event');

    // =========================================================================
    // TEST B: Restart does not create a second audit
    // =========================================================================
    console.log('\n--- TEST B: Restart Idempotency (Zero Duplicate Audits) ---');
    RuntimeStoreManager.resetInstance();
    const managerRestart = RuntimeStoreManager.getInstance();

    const restartedStore = managerRestart.load();
    const restartGpsAudits = (restartedStore.auditLogs || []).filter((a: any) => a.action === 'SYNTHETIC_GPS_CLEARED');
    assert.strictEqual(restartGpsAudits.length, 1, 'Restart must NOT create a second audit event (count remains 1)');

    logPass('B', 'Restart maintains exactly one audit event without duplication');

    // =========================================================================
    // TEST C: saveStore does not create a duplicate audit
    // =========================================================================
    console.log('\n--- TEST C: saveStore Idempotency (Zero Duplicate Audits) ---');
    managerRestart.saveStore(restartedStore);

    // Reload from disk to verify persisted state
    RuntimeStoreManager.resetInstance();
    const managerAfterSave = RuntimeStoreManager.getInstance();
    const savedStore = managerAfterSave.load();

    const savedGpsAudits = (savedStore.auditLogs || []).filter((a: any) => a.action === 'SYNTHETIC_GPS_CLEARED');
    assert.strictEqual(savedGpsAudits.length, 1, 'saveStore must NOT create a duplicate audit event (count remains 1)');

    logPass('C', 'saveStore maintains exactly one audit event without duplication');

    // =========================================================================
    // TEST D: Migration with zero synthetic GPS creates NO sanitization audit
    // =========================================================================
    console.log('\n--- TEST D: Zero Synthetic GPS Migration Creates No Audit ---');
    process.env.VENDING_DATA_DIR = sandbox2;

    // Create an isolated legacy fixture with 0 synthetic GPS
    const cleanLegacyFixturePath = path.join(sandbox2, 'clean_legacy_fleet.json');
    const cleanLegacyData = {
      machines: [
        {
          id: 'm-clean-1',
          machineNumber: '1',
          latitude: null,
          longitude: null,
          machineLatitude: null,
          machineLongitude: null,
          revision: 1
        },
        {
          id: 'm-clean-2',
          machineNumber: '2',
          // Legitimate coordinates that do not match formula
          latitude: 24.500000,
          longitude: 46.500000,
          machineLatitude: 24.500000,
          machineLongitude: 46.500000,
          locationSource: 'MANUAL_ENTRY',
          revision: 1
        }
      ],
      buildings: [],
      floors: [],
      locations: [],
      tickets: [],
      technicians: [],
      auditLogs: []
    };
    fs.writeFileSync(cleanLegacyFixturePath, JSON.stringify(cleanLegacyData, null, 2), 'utf8');
    process.env.VENDING_LEGACY_DATA_PATH = cleanLegacyFixturePath;

    RuntimeStoreManager.resetInstance();
    const cleanManager = RuntimeStoreManager.getInstance();

    const cleanMigrationRes = cleanManager.migrateLegacyStore();
    assert.strictEqual(cleanMigrationRes.migrated, true, 'Clean migration executes');

    const cleanStore = cleanManager.load();
    const cleanGpsAudits = (cleanStore.auditLogs || []).filter((a: any) => a.action === 'SYNTHETIC_GPS_CLEARED');
    assert.strictEqual(cleanGpsAudits.length, 0, 'Zero synthetic GPS migration must create ZERO sanitization audits');

    logPass('D', 'Migration with zero synthetic GPS creates no sanitization audit');

    // =========================================================================
    // TEST E: Startup diagnostics report actual runtime metadata schema/version
    // =========================================================================
    console.log('\n--- TEST E: Startup Diagnostics Metadata Reporting ---');
    // Capture stdout logs during load()
    const originalLog = console.log;
    const capturedLogs: string[] = [];
    console.log = (...args: any[]) => {
      capturedLogs.push(args.map(a => String(a)).join(' '));
      originalLog(...args);
    };

    try {
      RuntimeStoreManager.resetInstance();
      process.env.VENDING_DATA_DIR = sandbox1; // Points to sandbox1 with schemaVersion 4 and version 5.4.5A
      process.env.VENDING_LEGACY_DATA_PATH = syntheticFixturePath;
      const diagManager = RuntimeStoreManager.getInstance();
      diagManager.load();
    } finally {
      console.log = originalLog;
    }

    const allLogOutput = capturedLogs.join('\n');
    assert.ok(
      allLogOutput.includes('Schema version:         4'),
      'Startup diagnostics must print "Schema version:         4"'
    );
    assert.ok(
      allLogOutput.includes('Persistence version:    5.4.5A'),
      'Startup diagnostics must print "Persistence version:    5.4.5A"'
    );
    assert.ok(
      !allLogOutput.includes('Schema version:         3'),
      'Startup diagnostics must NOT contain obsolete "Schema version:         3"'
    );
    assert.ok(
      !allLogOutput.includes('PHASE 5.4.4: AUTHORITATIVE RUNTIME STORE INITIALIZED'),
      'Startup diagnostics must NOT contain obsolete hardcoded "PHASE 5.4.4"'
    );

    logPass('E', 'Startup diagnostics dynamically report actual metadata schemaVersion=4 and version=5.4.5A');

    // Verify protected tracked fleet_data.json and cloud_data.json were not mutated
    const finalFleetData = fs.readFileSync(trackedFleetDataPath, 'utf8');
    assert.strictEqual(finalFleetData, initialFleetData, 'Authoritative fleet_data.json must be byte-for-byte identical');
    const finalCloudData = fs.readFileSync(trackedCloudDataPath, 'utf8');
    assert.strictEqual(finalCloudData, initialCloudData, 'Authoritative cloud_data.json must be byte-for-byte identical');

    console.log('\n======================================================================');
    console.log(`ALL ASSERTIONS PASSED: ${passed} / ${total} tests verified`);
    console.log('PHASE 5.4.5C AUDIT & DIAGNOSTICS INTEGRITY FULLY CONFIRMED');
    console.log('======================================================================\n');
  } finally {
    // Cleanup temporary sandboxes
    try {
      fs.rmSync(sandbox1, { recursive: true, force: true });
    } catch {}
    try {
      fs.rmSync(sandbox2, { recursive: true, force: true });
    } catch {}
    delete process.env.VENDING_DATA_DIR;
    delete process.env.VENDING_LEGACY_DATA_PATH;
    RuntimeStoreManager.resetInstance();
  }
}

runTestSuite().catch(err => {
  console.error('Phase 5.4.5C test suite failed:', err);
  process.exit(1);
});

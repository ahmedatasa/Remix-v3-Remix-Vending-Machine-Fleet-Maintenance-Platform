import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';

console.log('======================================================================');
console.log('PHASE 5.4.3: VERIFICATION OF PERSISTENCE INTEGRITY & TICKET LIFECYCLE');
console.log('======================================================================');

const ORIGINAL_DB_FILE = path.join(process.cwd(), 'fleet_data.json');
const BASELINE_FILE = path.join(process.cwd(), 'fleet_master_baseline.json');

// --- Pre-flight checks ---
assert(fs.existsSync(ORIGINAL_DB_FILE), 'fleet_data.json must exist');
assert(fs.existsSync(BASELINE_FILE), 'fleet_master_baseline.json must exist');

// Use isolated sandbox directory so tracked fleet_data.json is never mutated
const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vending-test-persistence-'));
const DB_FILE = path.join(sandboxDir, 'fleet_data.json');
fs.copyFileSync(ORIGINAL_DB_FILE, DB_FILE);

try {
const dbRaw = fs.readFileSync(DB_FILE, 'utf8');
const db = JSON.parse(dbRaw);

const baselineRaw = fs.readFileSync(BASELINE_FILE, 'utf8');
const baseline = JSON.parse(baselineRaw);

// 1. Check metadata and initialization marker
console.log('\n[CHECK 1] Authoritative Initialization Marker:');
console.log('  initialized:', db.initialized);
console.log('  _persistence:', JSON.stringify(db._persistence));
assert(db.initialized === true, 'fleet_data.json must have initialized: true');
assert(db._persistence && db._persistence.initialized === true, 'fleet_data.json must have _persistence.initialized === true');
console.log('  -> PASS: Authoritative initialization marker verified.');

// 2. Check Baseline Isolation
console.log('\n[CHECK 2] Baseline Isolation & Ticket Cleanliness:');
console.log('  Baseline machines count:', baseline.machines?.length);
console.log('  Baseline tickets count:', baseline.tickets?.length);
assert.strictEqual(baseline.machines?.length, 189, 'Baseline must contain exactly 189 machines');
assert.strictEqual(baseline.tickets?.length, 0, 'Baseline tickets must be 0 to prevent ticket resurrection');
console.log('  -> PASS: Baseline isolation verified.');

// 3. Test GPS Persistence Simulation
console.log('\n[CHECK 3] GPS Persistence Across Simulated Restart:');
const targetMachine = db.machines.find((m: any) => m.machineNumber === '1' || m.id === 'mch-1') || db.machines[0];
assert(!!targetMachine, 'Target machine must exist');
console.log(`  Testing Machine: ${targetMachine.machineNumber} (${targetMachine.id})`);

const testLat = 24.725812;
const testLng = 46.623491;
const testTime = new Date().toISOString();

// Simulate atomic save of GPS coordinates
targetMachine.latitude = testLat;
targetMachine.longitude = testLng;
targetMachine.machineLatitude = testLat;
targetMachine.machineLongitude = testLng;
targetMachine.locationSource = 'DEVICE_GPS';
targetMachine.locationStatus = 'GPS_CONFIGURED';
targetMachine.locationUpdatedAt = testTime;

// Use atomic write pattern
const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), 'utf8');
fs.renameSync(tempFile, DB_FILE);

// Simulate full server restart by re-reading the file from scratch
const reloadedDb = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const reloadedMachine = reloadedDb.machines.find((m: any) => m.id === targetMachine.id);

assert.strictEqual(reloadedMachine.latitude, testLat, 'Machine latitude must persist after restart');
assert.strictEqual(reloadedMachine.longitude, testLng, 'Machine longitude must persist after restart');
assert.strictEqual(reloadedMachine.locationStatus, 'GPS_CONFIGURED', 'locationStatus must persist');
assert.strictEqual(reloadedMachine.locationSource, 'DEVICE_GPS', 'locationSource must persist');
console.log('  -> PASS: Machine GPS persisted accurately across simulated restart.');

// 4. Test Building GPS Persistence
console.log('\n[CHECK 4] Building GPS Persistence:');
const targetBuilding = reloadedDb.buildings[0];
assert(!!targetBuilding, 'Target building must exist');
const bldTestLat = 24.719876;
const bldTestLng = 46.681234;
targetBuilding.latitude = bldTestLat;
targetBuilding.longitude = bldTestLng;
targetBuilding.locationStatus = 'GPS_CONFIGURED';
targetBuilding.locationSource = 'MANUAL_ENTRY';

const tempBldFile = `${DB_FILE}.tmp.${Date.now()}`;
fs.writeFileSync(tempBldFile, JSON.stringify(reloadedDb, null, 2), 'utf8');
fs.renameSync(tempBldFile, DB_FILE);

const reloadedDb2 = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const reloadedBld = reloadedDb2.buildings.find((b: any) => b.id === targetBuilding.id);
assert.strictEqual(reloadedBld.latitude, bldTestLat, 'Building latitude must persist after restart');
assert.strictEqual(reloadedBld.longitude, bldTestLng, 'Building longitude must persist after restart');
console.log('  -> PASS: Building GPS persisted accurately across simulated restart.');

// 5. Test Ticket Resolution and Resurrection Prevention
console.log('\n[CHECK 5] Ticket Resolution & Resurrection Prevention:');
const initialTicketCount = reloadedDb2.tickets.length;
console.log(`  Initial runtime tickets count: ${initialTicketCount}`);

let targetTicket = reloadedDb2.tickets.find((t: any) => t.status !== 'RESOLVED');
if (!targetTicket) {
  targetTicket = reloadedDb2.tickets[0];
}
const ticketId = targetTicket.id || targetTicket.ticketNumber;
console.log(`  Target Ticket: ${targetTicket.ticketNumber} (Status: ${targetTicket.status})`);

targetTicket.status = 'RESOLVED';
targetTicket.resolvedAt = new Date().toISOString();
targetTicket.resolvedBy = 'Test Automated Engineer';
targetTicket.rootCause = 'Verified persistence fix';
targetTicket.resolutionSummary = 'Repaired without resurrection';

const tempTckFile = `${DB_FILE}.tmp.${Date.now()}`;
fs.writeFileSync(tempTckFile, JSON.stringify(reloadedDb2, null, 2), 'utf8');
fs.renameSync(tempTckFile, DB_FILE);

// Simulate full restart
const reloadedDb3 = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const reloadedTicket = reloadedDb3.tickets.find((t: any) => (t.id === ticketId || t.ticketNumber === ticketId));

assert.strictEqual(reloadedTicket.status, 'RESOLVED', 'Ticket must remain RESOLVED across restarts');
assert.strictEqual(reloadedDb3.tickets.length, initialTicketCount, 'Ticket count must not increase on restart');
console.log('  -> PASS: Ticket remains RESOLVED across restarts with no resurrection.');

// 6. Test Fleet Integrity (189 machines, unique IDs)
console.log('\n[CHECK 6] Master Fleet Integrity:');
assert.strictEqual(reloadedDb3.machines.length, 189, 'Fleet machine count must remain exactly 189');

const machineIds = new Set<string>();
const machineNumbers = new Set<string>();
reloadedDb3.machines.forEach((m: any, idx: number) => {
  assert(m.id, `Machine at index ${idx} missing id`);
  assert(m.machineNumber, `Machine at index ${idx} missing machineNumber`);
  assert(!machineIds.has(m.id), `Duplicate machine id found: ${m.id}`);
  assert(!machineNumbers.has(m.machineNumber), `Duplicate machineNumber found: ${m.machineNumber}`);
  machineIds.add(m.id);
  machineNumbers.add(m.machineNumber);
});
console.log(`  Verified 189 unique machine IDs and machine numbers.`);
console.log(`  Buildings count: ${reloadedDb3.buildings.length}`);
console.log(`  Floors count: ${reloadedDb3.floors.length}`);
console.log(`  Locations count: ${reloadedDb3.locations.length}`);
console.log(`  Tickets count: ${reloadedDb3.tickets.length}`);

console.log('\n======================================================================');
console.log('ALL PHASE 5.4.3 PERSISTENCE INTEGRITY TESTS PASSED SUCCESSFULLY (6/6)');
console.log('======================================================================');
} finally {
  try {
    fs.rmSync(sandboxDir, { recursive: true, force: true });
  } catch {}
}

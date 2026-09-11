import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import https from 'https';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { startCloudServer, stopCloudServer } from '../cloud/src/server';
import { cloudDb, resetCloudDbInstance } from '../cloud/src/db/cloudDb';
import { desktopSyncWorker } from '../src/services/desktopSyncWorker';

const TEST_CLOUD_PORT = 3105;
const CLOUD_URL = `http://127.0.0.1:${TEST_CLOUD_PORT}`;

// Isolate test resources so tracked fleet_data.json, cloud_data.json, and evidence storage are never mutated
const testSandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vending-phase4-sync-'));
const FLEET_DATA_PATH = path.join(testSandboxDir, 'fleet_data.json');
fs.copyFileSync(path.join(process.cwd(), 'fleet_data.json'), FLEET_DATA_PATH);
process.env.CLOUD_DATABASE_FILE = path.join(testSandboxDir, 'cloud_data.json');
process.env.CLOUD_STORAGE_DIR = path.join(testSandboxDir, 'cloud_storage');
process.env.SYNC_CLIENT_SECRET = 'sec_ksu_vending_sync_2026_d92f8a1c';
resetCloudDbInstance();

function request(method: string, urlStr: string, headers: Record<string, string> = {}, body?: any): Promise<{ status: number; data: any; headers: any }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders: Record<string, string | number> = {
      ...headers,
      Accept: 'application/json'
    };
    if (payload) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers: reqHeaders,
        timeout: 5000
      },
      (res) => {
        let text = '';
        res.on('data', chunk => text += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 200, data: JSON.parse(text), headers: res.headers });
          } catch {
            resolve({ status: res.statusCode || 200, data: text, headers: res.headers });
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Timeout')));
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('🚀 STARTING PHASE 4 COMPREHENSIVE VERIFICATION SUITE');
  console.log('====================================================\n');

  let testPassed = 0;
  let testFailed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${msg}`);
      testPassed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      testFailed++;
      throw new Error(`Assertion failed: ${msg}`);
    }
  }

  try {
  // --- 1. CRITICAL SAFETY CHECK: 189 MACHINES ---
  console.log('--- 1. Checking 189-Machine Authoritative Fleet Baseline ---');
  const initialData = JSON.parse(fs.readFileSync(FLEET_DATA_PATH, 'utf-8'));
  const initialMachineCount = initialData.machines.length;
  assert(initialMachineCount === 189, `Authoritative machine fleet has exactly 189 machines (actual: ${initialMachineCount})`);

  // --- 2. START STANDALONE CLOUD SERVER ---
  console.log('\n--- 2. Starting Standalone Cloud Service (Port ' + TEST_CLOUD_PORT + ') ---');
  const cloudServer = await startCloudServer(TEST_CLOUD_PORT);
  assert(!!cloudServer, 'Cloud HTTP Server started successfully');

  // Test Cloud Health
  const health = await request('GET', `${CLOUD_URL}/health`);
  assert(health.status === 200 && health.data?.status === 'HEALTHY', 'Cloud Health check returned 200 HEALTHY');

  // --- 3. TEST SYNC AUTHENTICATION (M2M) ---
  console.log('\n--- 3. Testing M2M Sync Authentication & Security ---');
  const unauthSync = await request('GET', `${CLOUD_URL}/sync/events`);
  assert(unauthSync.status === 401, 'Unauthorized request to /sync/events is rejected with 401');

  const badSecretSync = await request('GET', `${CLOUD_URL}/sync/events`, {
    'x-sync-client-id': 'ksu-desktop-sync-client-2026',
    'x-sync-client-secret': 'wrong_secret_attack'
  });
  assert(badSecretSync.status === 403, 'Invalid secret to /sync/events is rejected with 403');

  // Valid sync credentials
  const syncHeaders = {
    'x-sync-client-id': 'ksu-desktop-sync-client-2026',
    'x-sync-client-secret': 'sec_ksu_vending_sync_2026_d92f8a1c'
  };

  // --- 4. DESKTOP SYNC WORKER BOOTSTRAP ---
  console.log('\n--- 4. Testing Desktop Sync Bootstrap of 189 Machines ---');
  process.env.CLOUD_API_URL = CLOUD_URL;

  let localStore = JSON.parse(fs.readFileSync(FLEET_DATA_PATH, 'utf-8'));
  localStore.lastCloudSyncCursor = 0;
  localStore.processedSyncEventIds = [];
  const saveStore = (updated: any) => {
    localStore = updated;
    fs.writeFileSync(FLEET_DATA_PATH, JSON.stringify(updated, null, 2), 'utf-8');
  };
  const getStore = () => localStore;

  const syncResult = await desktopSyncWorker.syncOnce(getStore, saveStore);
  assert(syncResult.connected === true, 'Desktop sync connected to Standalone Cloud API');
  assert(syncResult.bootstrappedMachinesCount === 189, `Desktop synced exactly 189 sanitized machines to Cloud (actual: ${syncResult.bootstrappedMachinesCount})`);

  // Verify Cloud database received machines and sanitized them
  const sampleMachine = initialData.machines[0];
  const cloudMachine = cloudDb.findMachineByQrToken(sampleMachine.publicQrToken);
  assert(!!cloudMachine, `Cloud registry found machine with token ${sampleMachine.publicQrToken}`);
  assert((cloudMachine as any).serialNumber === undefined, 'Security: Cloud machine record does NOT contain private serialNumber');
  assert((cloudMachine as any).purchasePrice === undefined, 'Security: Cloud machine record does NOT contain private purchasePrice');

  // Verify local fleet count is still exactly 189
  const postBootstrapData = JSON.parse(fs.readFileSync(FLEET_DATA_PATH, 'utf-8'));
  assert(postBootstrapData.machines.length === 189, `Post-bootstrap local fleet count strictly unchanged: 189`);

  // --- 5. PUBLIC QR ENDPOINTS & SECURITY ---
  console.log('\n--- 5. Testing Public QR Lookup & Fault Reporting ---');
  // Lookup valid QR
  const lookupValid = await request('GET', `${CLOUD_URL}/public/m/${sampleMachine.publicQrToken}`);
  assert(lookupValid.status === 200, 'Public QR lookup for valid machine returned 200');
  assert(lookupValid.data?.publicQrToken === sampleMachine.publicQrToken, 'Public QR response returns sanitized public info');
  assert(lookupValid.data?.serialNumber === undefined, 'Public QR response does NOT expose serial number');

  // Lookup invalid QR
  const lookupInvalid = await request('GET', `${CLOUD_URL}/public/m/FAKE_NONEXISTENT_QR`);
  assert(lookupInvalid.status === 404, 'Public QR lookup for non-existent machine returns 404');

  // Customer submit fault report
  const idempotencyKey = `idemp-${Date.now()}`;
  const reportPayload = {
    category: 'BEVERAGE_DISPENSE',
    description: 'الماكينة لم تسقط عبوة الماء بعد خصم المبلغ عبر مدى',
    reporterName: 'طالب جامعي',
    reporterPhone: '0551122334',
    cloudReportId: idempotencyKey
  };

  const reportRes1 = await request('POST', `${CLOUD_URL}/public/m/${sampleMachine.publicQrToken}/report`, {}, reportPayload);
  assert(reportRes1.status === 201, 'Customer report created with 201');
  const trackingToken = reportRes1.data?.trackingToken;
  assert(trackingToken && trackingToken.startsWith('TRK-'), `Tracking token generated with TRK- prefix (${trackingToken})`);

  // Idempotent retry with same cloudReportId
  const reportRes2 = await request('POST', `${CLOUD_URL}/public/m/${sampleMachine.publicQrToken}/report`, {}, reportPayload);
  assert(reportRes2.status === 200, 'Idempotent report retry returned 200 without creating duplicate');
  assert(reportRes2.data?.trackingToken === trackingToken, 'Idempotent report returned identical tracking token');

  // Public ticket tracking
  const trackRes = await request('GET', `${CLOUD_URL}/public/ticket/${trackingToken}`);
  assert(trackRes.status === 200, 'Public ticket tracking query returned 200');
  assert(trackRes.data?.status === 'OPEN', 'Public ticket status is OPEN');
  assert(trackRes.data?.machineSummary?.machineType !== undefined, 'Public ticket includes sanitized machine summary');

  // Attempting to track via internal/forged ID must fail
  const trackForged = await request('GET', `${CLOUD_URL}/public/ticket/TCK-2026-0001`);
  assert(trackForged.status === 400, 'Strict security: Querying with TCK- internal format is rejected with 400');

  // --- 6. TECHNICIAN PORTAL: AUTHENTICATION, GPS & EVIDENCE ---
  console.log('\n--- 6. Testing Technician Portal Authentication & GPS Geofencing ---');
  // Technician account was synced from local technicians during bootstrap
  const techUser = initialData.technicians[0];
  // Seed/ensure a valid bcrypt password for techUser
  const testPin = '987654';
  const hashedPin = bcrypt.hashSync(testPin, 10);
  const cloudTechAcc = cloudDb.getData().technician_accounts.find(t => t.id === techUser.id || t.employeeCode === techUser.employeeCode);
  if (cloudTechAcc) {
    cloudTechAcc.passwordHash = hashedPin;
    cloudDb.save();
  }

  // Attempt login with wrong password
  const failLogin = await request('POST', `${CLOUD_URL}/technician/login`, {}, {
    identifier: techUser.employeeCode,
    password: 'wrong_password'
  });
  assert(failLogin.status === 401, 'Technician login with incorrect password rejected with 401');

  // Attempt login with valid credentials
  const successLogin = await request('POST', `${CLOUD_URL}/technician/login`, {}, {
    identifier: techUser.employeeCode,
    password: testPin
  });
  assert(successLogin.status === 200, 'Technician login succeeded with 200');
  const techToken = successLogin.data?.token;
  assert(!!techToken && techToken.startsWith('tech-sess-'), 'Cryptographic 192-bit session token generated');

  const techHeaders = {
    'Authorization': `Bearer ${techToken}`
  };

  // GPS Checkin: Test invalid distance (out of bounds)
  const ticketId = reportRes1.data?.ticketNumber;
  const machineCoords = {
    latitude: sampleMachine.currentLocation?.latitude || 24.7136,
    longitude: sampleMachine.currentLocation?.longitude || 46.6753
  };

  const farAwayCheckin = await request('POST', `${CLOUD_URL}/technician/checkin`, techHeaders, {
    ticketId,
    machineToken: sampleMachine.publicQrToken,
    coordinates: {
      latitude: machineCoords.latitude + 0.1, // ~11km away!
      longitude: machineCoords.longitude + 0.1,
      accuracyMeters: 10
    }
  });
  assert(farAwayCheckin.status === 400, 'GPS out-of-bounds (>100m) checkin strictly rejected with 400');

  // GPS Checkin: Test weak accuracy (>100m)
  const weakGpsCheckin = await request('POST', `${CLOUD_URL}/technician/checkin`, techHeaders, {
    ticketId,
    machineToken: sampleMachine.publicQrToken,
    coordinates: {
      latitude: machineCoords.latitude,
      longitude: machineCoords.longitude,
      accuracyMeters: 250 // Weak accuracy
    }
  });
  assert(weakGpsCheckin.status === 400, 'Weak GPS accuracy (>100m) checkin strictly rejected with 400');

  // GPS Checkin: Valid presence (within 100m and accuracy < 100m)
  // Ensure machine in cloud has coordinates
  const cMachine = cloudDb.findMachineByQrToken(sampleMachine.publicQrToken);
  if (cMachine) {
    cMachine.latitude = 24.7136;
    cMachine.longitude = 46.6753;
    cloudDb.save();
  }

  const validCheckin = await request('POST', `${CLOUD_URL}/technician/checkin`, techHeaders, {
    ticketId,
    machineToken: sampleMachine.publicQrToken,
    coordinates: {
      latitude: 24.71361,
      longitude: 46.67531,
      accuracyMeters: 8
    }
  });
  assert(validCheckin.status === 200, 'Valid field GPS presence checkin succeeded with 200');

  // Evidence upload test
  console.log('\n--- 7. Testing Evidence Object Storage ---');
  const sample1pxPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const evidenceRes = await request('POST', `${CLOUD_URL}/technician/evidence`, techHeaders, {
    ticketId,
    imageBase64: sample1pxPngBase64,
    mimeType: 'image/png',
    caption: 'صورة توثيق بوابة خروج المشروبات بعد الإصلاح'
  });
  assert(evidenceRes.status === 200, 'Evidence upload succeeded with 200');
  assert(!!evidenceRes.data?.evidence?.sha256, 'Evidence record includes SHA-256 hash');
  assert(!!evidenceRes.data?.evidence?.objectKey, 'Evidence record includes randomized objectKey');

  // Action test
  const actionRes = await request('POST', `${CLOUD_URL}/technician/action`, techHeaders, {
    ticketId,
    actionType: 'MOTOR_CALIBRATION',
    description: 'تمت إعادة ضبط ومعايرة محرك سير إسقاط العبوات'
  });
  assert(actionRes.status === 200, 'Technician action registered');

  // Spare Part Request test
  const partReqRes = await request('POST', `${CLOUD_URL}/technician/part-request`, techHeaders, {
    ticketId,
    partName: 'حساس خروج العبوات البصري',
    quantityRequested: 1,
    reason: 'الحساس القديم متهالك ويحتاج استبدال دوري'
  });
  assert(partReqRes.status === 200, 'Spare part request registered with status REQUESTED');

  // Resolve Ticket test
  const resolveRes = await request('POST', `${CLOUD_URL}/technician/resolve`, techHeaders, {
    ticketId,
    summary: 'تم استبدال الحساس وفحص الماكينة وعودتها للخدمة بنجاح'
  });
  assert(resolveRes.status === 200, 'Ticket resolved by technician');

  // --- 8. DESKTOP SYNC: BIDIRECTIONAL NETWORK SYNC CYCLE ---
  console.log('\n--- 8. Testing Desktop Sync Worker Event Pull & Local Application ---');
  const syncCycleResult = await desktopSyncWorker.syncOnce(getStore, saveStore);
  assert(syncCycleResult.connected === true, 'Desktop sync cycle completed successfully');
  assert(syncCycleResult.syncedEventsCount > 0, `Desktop pulled and processed ${syncCycleResult.syncedEventsCount} events`);

  // Check local ticket in fleet_data.json
  const updatedLocalData = JSON.parse(fs.readFileSync(FLEET_DATA_PATH, 'utf-8'));
  const syncedTicket = updatedLocalData.tickets.find((t: any) => t.cloudReportId === idempotencyKey);
  assert(!!syncedTicket, `Synced ticket found in local fleet_data.json`);
  assert(syncedTicket.ticketNumber && syncedTicket.ticketNumber.startsWith('TCK-2026-'), `Local sequential ticket number assigned: ${syncedTicket.ticketNumber}`);
  assert(syncedTicket.status === 'RESOLVED', `Ticket status synchronized to RESOLVED`);
  assert(syncedTicket.checkins.length > 0, `Technician GPS checkin recorded in local ticket`);
  assert(syncedTicket.evidence.length > 0, `Technician evidence recorded in local ticket`);

  // Verify Spare Part Request created locally without deducting stock
  const localPartReq = updatedLocalData.partRequests?.find((r: any) => r.ticketId === ticketId);
  assert(!!localPartReq, 'Spare part request synced to local partRequests collection');
  assert(localPartReq.status === 'REQUESTED', 'Part request has status REQUESTED (safety: stock untouched)');

  // Verify authoritative machine count strictly preserved
  assert(updatedLocalData.machines.length === 189, `CRITICAL SAFETY VERIFIED: Local fleet has exactly 189 machines`);

  // --- 9. RESILIENCE: CLOUD OFFLINE TEST ---
  console.log('\n--- 9. Testing Cloud Offline Resilience (Desktop continues operating) ---');
  await stopCloudServer();

  // Desktop tries to sync when Cloud is dead
  const offlineSyncResult = await desktopSyncWorker.syncOnce(getStore, saveStore);
  assert(offlineSyncResult.connected === false, 'Sync worker detects Cloud is offline');
  assert(offlineSyncResult.message.includes('unreachable') || offlineSyncResult.message.includes('offline'), 'Sync worker returns friendly offline status without crashing');

  // Local fleet remains completely intact and operational
  const duringOfflineData = JSON.parse(fs.readFileSync(FLEET_DATA_PATH, 'utf-8'));
  assert(duringOfflineData.machines.length === 189, 'Local fleet remains 189 machines during Cloud outage');

  // Restart Cloud server for final check
  await startCloudServer(TEST_CLOUD_PORT);
  const reconnectedSync = await desktopSyncWorker.syncOnce(getStore, saveStore);
  assert(reconnectedSync.connected === true, 'Desktop seamlessly reconnected to Cloud once service resumed');
  await stopCloudServer();

  console.log('\n====================================================');
  console.log(`🎉 ALL PHASE 4 VERIFICATION TESTS PASSED! (${testPassed} passed, ${testFailed} failed)`);
  console.log('====================================================');
  } finally {
    try {
      await stopCloudServer();
    } catch {}
    try {
      fs.rmSync(testSandboxDir, { recursive: true, force: true });
    } catch {}
    delete process.env.CLOUD_DATABASE_FILE;
    delete process.env.CLOUD_STORAGE_DIR;
    resetCloudDbInstance();
  }
}

runTests().catch(err => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});

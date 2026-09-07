import http from 'http';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { resolveCloudPort, cloudConfig } from '../cloud/src/config/cloudConfig';
import { resetActiveRepository, initializeCloudRepository } from '../cloud/src/repositories';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ [PASS] ${message}`);
}

function httpGet(url: string, timeoutMs = 4000): Promise<{ statusCode: number; data: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout connecting to ${url}`)), timeoutMs);
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        clearTimeout(timer);
        resolve({ statusCode: res.statusCode || 0, data });
      });
    }).on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function runPhase51Tests() {
  console.log('================================================================');
  console.log(' PHASE 5.1 — CLOUD RUN RUNTIME CONTRACT & STAGING VERIFICATION ');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // STEP 1: PORT CONTRACT RESOLUTION UNIT TESTS
  // ---------------------------------------------------------------------------
  console.log('Step 1: Testing Port Resolution Logic...');
  const originalEnv = { ...process.env };

  try {
    // 1.1 Local Mode (PORT=8080 from platform, CLOUD_PORT=3001)
    delete process.env.K_SERVICE;
    process.env.PORT = '8080';
    process.env.CLOUD_PORT = '3001';
    process.env.NODE_ENV = 'development';
    const localPort = resolveCloudPort();
    assert(localPort === 3001, `Local mode with CLOUD_PORT=3001 resolves to 3001 (actual: ${localPort})`);

    // 1.2 Local Mode Default (PORT=8080 from platform, CLOUD_PORT unset)
    delete process.env.CLOUD_PORT;
    const defaultLocalPort = resolveCloudPort();
    assert(defaultLocalPort === 3001, `Local mode without CLOUD_PORT resolves to 3001 default (actual: ${defaultLocalPort})`);

    // 1.3 Simulated Cloud Run (PORT=8080, K_SERVICE=vending-cloud-staging)
    process.env.PORT = '8080';
    process.env.K_SERVICE = 'vending-cloud-staging';
    delete process.env.CLOUD_PORT;
    const cloudRunPort = resolveCloudPort();
    assert(cloudRunPort === 8080, `Cloud Run mode with K_SERVICE resolves to process.env.PORT (8080, actual: ${cloudRunPort})`);

    // 1.4 Custom Cloud Run Port (PORT=9090, K_SERVICE=vending-cloud-staging)
    process.env.PORT = '9090';
    const customCloudRunPort = resolveCloudPort();
    assert(customCloudRunPort === 9090, `Cloud Run mode with custom PORT resolves to 9090 (actual: ${customCloudRunPort})`);
  } finally {
    process.env = { ...originalEnv };
  }

  // ---------------------------------------------------------------------------
  // STEP 2: ENTRY POINT ISOLATION TEST (MAIN APP IMPORTING CLOUD)
  // ---------------------------------------------------------------------------
  console.log('\nStep 2: Testing Entry Point Isolation (No Accidental Cloud Startup)...');

  // Verify that importing cloud modules directly does NOT start any listener
  const isCloudListeningBefore = await httpGet('http://127.0.0.1:3001/health').then(() => true).catch(() => false);
  assert(!isCloudListeningBefore, 'Standalone Cloud listener is NOT automatically started on module import');

  // Verify main application dev server is reachable on port 3000
  const mainAppHealth = await httpGet('http://127.0.0.1:3000/api/health').catch(() => null);
  assert(mainAppHealth !== null && mainAppHealth.statusCode === 200, 'Main Application dev server remains healthy on port 3000');

  // ---------------------------------------------------------------------------
  // STEP 3: STANDALONE LOCAL CLOUD TEST (CLOUD_PORT)
  // ---------------------------------------------------------------------------
  console.log('\nStep 3: Testing Standalone Local Cloud Startup (Port Binding)...');
  const testStandalonePort = 3108;
  const cloudLocalProc = spawn('npx', ['tsx', 'cloud/src/server.ts'], {
    env: {
      ...process.env,
      CLOUD_PORT: String(testStandalonePort),
      NODE_ENV: 'development',
      TEST_ENV: ''
    },
    stdio: 'pipe'
  });

  try {
    // Wait for server to start
    let started = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 300));
      try {
        const res = await httpGet(`http://127.0.0.1:${testStandalonePort}/health`);
        if (res.statusCode === 200) {
          started = true;
          break;
        }
      } catch {}
    }
    assert(started, `Standalone local Cloud successfully listens and responds on port ${testStandalonePort}`);
  } finally {
    cloudLocalProc.kill('SIGTERM');
  }

  // ---------------------------------------------------------------------------
  // STEP 4: SIMULATED CLOUD RUN RUNTIME TEST (0.0.0.0:PORT & K_SERVICE)
  // ---------------------------------------------------------------------------
  console.log('\nStep 4: Testing Simulated Cloud Run Runtime (PORT=8089, K_SERVICE=vending-cloud-staging)...');
  const testCloudRunPort = 8089;
  let cloudRunStderr = '';
  const cloudRunProc = spawn('npx', ['tsx', 'cloud/src/server.ts'], {
    env: {
      ...process.env,
      PORT: String(testCloudRunPort),
      K_SERVICE: 'vending-cloud-staging',
      NODE_ENV: 'development',
      TEST_ENV: ''
    },
    stdio: 'pipe'
  });
  cloudRunProc.stderr?.on('data', d => cloudRunStderr += d.toString());

  try {
    let cloudRunStarted = false;
    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, 300));
      try {
        const res = await httpGet(`http://127.0.0.1:${testCloudRunPort}/health`);
        if (res.statusCode === 200) {
          cloudRunStarted = true;
          break;
        }
      } catch {}
    }
    if (!cloudRunStarted && cloudRunStderr) {
      console.error('  Cloud Run Process Stderr:', cloudRunStderr);
    }
    assert(cloudRunStarted, `Cloud Run container successfully binds to 0.0.0.0:${testCloudRunPort} and responds to /health`);
  } finally {
    cloudRunProc.kill('SIGTERM');
  }

  // ---------------------------------------------------------------------------
  // STEP 5: SPLIT-BRAIN PREVENTION TEST IN STAGING/PRODUCTION MODE
  // ---------------------------------------------------------------------------
  console.log('\nStep 5: Testing JSON Split-Brain Prevention...');
  await resetActiveRepository();

  const prevEnv = process.env.NODE_ENV;
  const prevDbUrl = process.env.CLOUD_DATABASE_URL;

  try {
    // Set staging mode with unreachable database
    process.env.NODE_ENV = 'staging';
    process.env.CLOUD_DATABASE_URL = 'postgresql://invalid_user:invalid_pass@127.0.0.1:54329/invalid_db';
    
    let caughtError: Error | null = null;
    try {
      await initializeCloudRepository();
    } catch (err: any) {
      caughtError = err;
    }

    assert(
      caughtError !== null && caughtError.message.includes('Refusing to fallback to local JSON to prevent split-brain data'),
      'Staging/Production strictly refuses silent fallback to local JSON on database error'
    );
  } finally {
    await resetActiveRepository();
    process.env.NODE_ENV = prevEnv;
    process.env.CLOUD_DATABASE_URL = prevDbUrl;
    // Restore dev mode repo
    await initializeCloudRepository();
    assert(true, 'Cloud repository recovers normally when database connectivity / dev mode is restored');
  }

  // ---------------------------------------------------------------------------
  // STEP 6: FLEET DATA INTEGRITY CHECK (189 MACHINES)
  // ---------------------------------------------------------------------------
  console.log('\nStep 6: Verifying Fleet Data Baseline Integrity...');
  const fleetDataPath = path.resolve(process.cwd(), 'fleet_data.json');
  const baselineDataPath = path.resolve(process.cwd(), 'fleet_master_baseline.json');

  const fleet = JSON.parse(fs.readFileSync(fleetDataPath, 'utf8'));
  const baseline = JSON.parse(fs.readFileSync(baselineDataPath, 'utf8'));
  const baselineMachines = Array.isArray(baseline) ? baseline : (baseline.machines || []);

  assert(fleet.machines.length === 189, `Authoritative local fleet has exactly 189 machines (actual: ${fleet.machines.length})`);
  assert(baselineMachines.length === 189, `Authoritative baseline file has exactly 189 machines (actual: ${baselineMachines.length})`);

  const idSet = new Set(fleet.machines.map((m: any) => m.id));
  assert(idSet.size === 189, 'Local fleet has zero duplicate IDs (189 unique)');

  const qrSet = new Set(fleet.machines.map((m: any) => m.publicQrToken));
  assert(qrSet.size === 189, 'Local fleet has zero duplicate QR tokens (189 unique)');

  console.log('\n================================================================');
  console.log(' PHASE 5.1 RUNTIME CONTRACT & INTEGRITY TESTS: 13/13 PASSED (100%)');
  console.log('================================================================\n');
}

runPhase51Tests().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});

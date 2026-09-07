import { spawn, execSync } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

function makeRequest(url: string): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 500, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode || 500, data: body });
        }
      });
    }).on('error', reject);
  });
}

function waitForServer(url: string, maxRetries = 20, delayMs = 250): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await makeRequest(url);
        if (res.status === 200) {
          clearInterval(interval);
          resolve();
          return;
        }
      } catch {}
      if (attempts >= maxRetries) {
        clearInterval(interval);
        reject(new Error(`Timeout waiting for server at ${url}`));
      }
    }, delayMs);
  });
}

async function runVerification() {
  console.log('=== PHASE 5.3.1 VERIFICATION: IMPORT-TIME JSON ISOLATION & SPLIT-BRAIN GUARD ===\n');

  const jsonDbPath = path.join(process.cwd(), 'cloud', 'data', 'cloud_data.json');
  if (fs.existsSync(jsonDbPath)) {
    fs.unlinkSync(jsonDbPath);
  }

  // Step 1: Rebuild dist/cloud-server.cjs exactly as Docker build does
  console.log('[Step 1] Building dist/cloud-server.cjs via esbuild...');
  execSync(
    'npx esbuild cloud/src/server.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/cloud-server.cjs',
    { stdio: 'inherit' }
  );
  if (!fs.existsSync(path.join(process.cwd(), 'dist', 'cloud-server.cjs'))) {
    throw new Error('dist/cloud-server.cjs was not generated!');
  }
  console.log('✓ Bundle successfully built.\n');

  // Step 2: Import-time isolation in staging mode
  console.log('[Step 2] Testing module import under NODE_ENV=staging in a clean Node subprocess...');
  const importCheck = execSync(
    `node -e "
      process.env.NODE_ENV = 'staging';
      const bundle = require('./dist/cloud-server.cjs');
      if (typeof bundle.createCloudApp !== 'function') throw new Error('Bundle failed to export createCloudApp');
      console.log('Import evaluated cleanly without executing JSON initialization.');
    "`,
    { encoding: 'utf8' }
  );
  console.log(importCheck.trim());
  if (fs.existsSync(jsonDbPath)) {
    throw new Error('FAIL: cloud_data.json was created during import-time under NODE_ENV=staging!');
  }
  console.log('✓ Import-time isolation verified: No cloud_data.json created.\n');

  // Step 3: Run bundled CJS server with NODE_ENV=staging
  console.log('[Step 3] Running bundled CJS server with NODE_ENV=staging and CLOUD_DATABASE_URL...');
  const stagingPort = 3891;
  const stagingServer = spawn('node', ['-r', './tests/mock_pg_preload.cjs', 'dist/cloud-server.cjs'], {
    env: {
      ...process.env,
      NODE_ENV: 'staging',
      PORT: stagingPort.toString(),
      CLOUD_DATABASE_URL: 'postgres://mock:mock@localhost:5432/staging_db',
      CLOUD_STORAGE_PROVIDER: 's3'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stagingOutput = '';
  stagingServer.stdout.on('data', (d) => (stagingOutput += d.toString()));
  stagingServer.stderr.on('data', (d) => (stagingOutput += d.toString()));

  try {
    await waitForServer(`http://127.0.0.1:${stagingPort}/health`);
    console.log('✓ Staging server is LIVE.');

    const healthRes = await makeRequest(`http://127.0.0.1:${stagingPort}/health`);
    console.log('GET /health =>', healthRes.data);
    if (healthRes.status !== 200 || healthRes.data.status !== 'HEALTHY') {
      throw new Error('Health check failed under staging');
    }

    const readyRes = await makeRequest(`http://127.0.0.1:${stagingPort}/ready`);
    console.log('GET /ready =>', readyRes.data);
    if (readyRes.status !== 200 || readyRes.data.status !== 'ready' || readyRes.data.persistence !== 'POSTGRES') {
      throw new Error(`Readiness check failed under staging: expected POSTGRES, got ${readyRes.data.persistence}`);
    }

    if (stagingOutput.includes('FATAL_SPLIT_BRAIN_GUARD')) {
      throw new Error('FATAL_SPLIT_BRAIN_GUARD was unexpectedly triggered in staging stdout/stderr!');
    }

    if (fs.existsSync(jsonDbPath)) {
      throw new Error('FAIL: cloud_data.json was created while running in staging mode!');
    }

    console.log('✓ Staging mode verification PASSED: PostgreSQL runtime active, zero JSON side effects.\n');
  } finally {
    stagingServer.kill('SIGTERM');
  }

  // Step 4: Run bundled CJS server with NODE_ENV=production
  console.log('[Step 4] Running bundled CJS server with NODE_ENV=production and CLOUD_DATABASE_URL...');
  const prodPort = 3892;
  const prodServer = spawn('node', ['-r', './tests/mock_pg_preload.cjs', 'dist/cloud-server.cjs'], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: prodPort.toString(),
      CLOUD_DATABASE_URL: 'postgres://mock:mock@localhost:5432/prod_db',
      CLOUD_STORAGE_PROVIDER: 's3'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let prodOutput = '';
  prodServer.stdout.on('data', (d) => (prodOutput += d.toString()));
  prodServer.stderr.on('data', (d) => (prodOutput += d.toString()));

  try {
    await waitForServer(`http://127.0.0.1:${prodPort}/health`);
    console.log('✓ Production server is LIVE.');

    const healthRes = await makeRequest(`http://127.0.0.1:${prodPort}/health`);
    console.log('GET /health =>', healthRes.data);
    if (healthRes.status !== 200 || healthRes.data.status !== 'HEALTHY') {
      throw new Error('Health check failed under production');
    }

    const readyRes = await makeRequest(`http://127.0.0.1:${prodPort}/ready`);
    console.log('GET /ready =>', readyRes.data);
    if (readyRes.status !== 200 || readyRes.data.status !== 'ready' || readyRes.data.persistence !== 'POSTGRES') {
      throw new Error(`Readiness check failed under production: expected POSTGRES, got ${readyRes.data.persistence}`);
    }

    if (prodOutput.includes('FATAL_SPLIT_BRAIN_GUARD')) {
      throw new Error('FATAL_SPLIT_BRAIN_GUARD was unexpectedly triggered in production stdout/stderr!');
    }

    if (fs.existsSync(jsonDbPath)) {
      throw new Error('FAIL: cloud_data.json was created while running in production mode!');
    }

    console.log('✓ Production mode verification PASSED: PostgreSQL runtime active, zero JSON side effects.\n');
  } finally {
    prodServer.kill('SIGTERM');
  }

  // Step 5: Test that Split-Brain Guard strictly blocks prohibited actions in staging
  console.log('[Step 5] Testing that Split-Brain Guard is strictly enforced if JSON is erroneously invoked in staging...');
  const guardCheck = execSync(
    `node -e "
      process.env.NODE_ENV = 'staging';
      const { CloudDatabase, getCloudDb } = require('./dist/cloud-server.cjs');
      let blocked1 = false;
      let blocked2 = false;
      try {
        new CloudDatabase();
      } catch (err) {
        if (err.message.includes('FATAL_SPLIT_BRAIN_GUARD')) blocked1 = true;
      }
      try {
        getCloudDb();
      } catch (err) {
        if (err.message.includes('FATAL_SPLIT_BRAIN_GUARD')) blocked2 = true;
      }
      if (!blocked1 || !blocked2) {
        throw new Error('Failed to enforce FATAL_SPLIT_BRAIN_GUARD on direct access: blocked1=' + blocked1 + ', blocked2=' + blocked2);
      }
      console.log('FATAL_SPLIT_BRAIN_GUARD strictly enforced on illegal access.');
    "`,
    { encoding: 'utf8' }
  );
  console.log(guardCheck.trim());
  console.log('✓ Split-brain guard enforcement PASSED.\n');

  // Step 6: Development JSON mode check
  console.log('[Step 6] Testing development JSON fallback when NODE_ENV=development and no DB URL is set...');
  const devCheck = execSync(
    `node -e "
      process.env.NODE_ENV = 'development';
      delete process.env.CLOUD_DATABASE_URL;
      const { initializeCloudRepository } = require('./dist/cloud-server.cjs');
      initializeCloudRepository().then(repo => {
        if (repo.providerType !== 'JSON_DEV') throw new Error('Expected JSON_DEV, got ' + repo.providerType);
        console.log('Development mode cleanly fell back to JSON_DEV repository.');
      }).catch(err => {
        console.error(err);
        process.exit(1);
      });
    "`,
    { encoding: 'utf8' }
  );
  console.log(devCheck.trim());
  console.log('✓ Development mode verification PASSED.\n');

  // Clean up any test artifact
  if (fs.existsSync(jsonDbPath)) {
    fs.unlinkSync(jsonDbPath);
  }

  console.log('========================================================================');
  console.log('ALL PHASE 5.3.1 IMPORT-TIME ISOLATION TESTS PASSED SUCCESSFULLY!');
  console.log('========================================================================');
}

runVerification().catch((err) => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});

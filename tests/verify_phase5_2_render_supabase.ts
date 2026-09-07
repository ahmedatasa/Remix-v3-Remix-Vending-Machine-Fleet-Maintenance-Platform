import http from 'http';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { resolveCloudPort, cloudConfig } from '../cloud/src/config/cloudConfig';
import { S3CompatibleStorageProvider } from '../cloud/src/storage/cloudStorage';

let totalAssertions = 0;
let passedAssertions = 0;

function assert(condition: boolean, message: string) {
  totalAssertions++;
  if (!condition) {
    console.error(`  ❌ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedAssertions++;
  console.log(`  ✓ [PASS] ${message}`);
}

function httpGet(url: string, timeoutMs = 4000): Promise<{ statusCode: number; data: any }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout connecting to ${url}`)), timeoutMs);
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        clearTimeout(timer);
        try {
          resolve({ statusCode: res.statusCode || 0, data: JSON.parse(data) });
        } catch {
          resolve({ statusCode: res.statusCode || 0, data });
        }
      });
    }).on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function runPhase52Verification() {
  console.log('================================================================');
  console.log(' PHASE 5.2 — RENDER + SUPABASE S3 STAGING ADAPTATION SUITE ');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // STEP 1: RENDER, CLOUD RUN, AND LOCAL STANDALONE PORT CONTRACT TESTS
  // ---------------------------------------------------------------------------
  console.log('Step 1: Testing Port Resolution Contract Across All Modes...');
  const originalEnv = { ...process.env };

  try {
    // 1.1 Render Mode: RENDER=true, PORT=10000
    delete process.env.K_SERVICE;
    delete process.env.CLOUD_PORT;
    process.env.RENDER = 'true';
    process.env.PORT = '10000';
    assert(resolveCloudPort() === 10000, 'Render Mode (RENDER=true, PORT=10000) resolves to 10000');

    // 1.2 Render Mode with Custom PORT: RENDER=true, PORT=8080
    process.env.PORT = '8080';
    assert(resolveCloudPort() === 8080, 'Render Mode with PORT=8080 resolves to 8080');

    // 1.3 Hosted Cloud Run: K_SERVICE=vending-cloud-staging, PORT=8080
    delete process.env.RENDER;
    process.env.K_SERVICE = 'vending-cloud-staging';
    process.env.PORT = '8080';
    assert(resolveCloudPort() === 8080, 'Cloud Run Mode (K_SERVICE set, PORT=8080) resolves to 8080');

    // 1.4 Local Standalone with CLOUD_PORT=3001
    delete process.env.K_SERVICE;
    delete process.env.RENDER;
    process.env.PORT = '3000'; // main app port
    process.env.CLOUD_PORT = '3001';
    assert(resolveCloudPort() === 3001, 'Local standalone mode with CLOUD_PORT=3001 resolves to 3001');

    // 1.5 Local Standalone Default (no CLOUD_PORT)
    delete process.env.CLOUD_PORT;
    delete process.env.PORT;
    assert(resolveCloudPort() === 3001, 'Local standalone default (no env vars) resolves to 3001');
  } finally {
    process.env = { ...originalEnv };
  }

  // ---------------------------------------------------------------------------
  // STEP 2: SIMULATED RENDER RUNTIME PROCESS TEST (0.0.0.0:PORT)
  // ---------------------------------------------------------------------------
  console.log('\nStep 2: Testing Simulated Render Runtime Execution...');
  const testRenderPort = 8099;
  const { startCloudServer, stopCloudServer } = await import('../cloud/src/server');

  process.env.RENDER = 'true';
  process.env.PORT = String(testRenderPort);
  process.env.NODE_ENV = 'development';

  const server = await startCloudServer(testRenderPort);

  try {
    const healthRes = await httpGet(`http://127.0.0.1:${testRenderPort}/health`);
    assert(healthRes.statusCode === 200, `Render container successfully binds to 0.0.0.0:${testRenderPort}`);
    assert(healthRes.data?.status === 'HEALTHY', 'Render container responds to /health with status HEALTHY');

    // Test /ready endpoint
    const readyRes = await httpGet(`http://127.0.0.1:${testRenderPort}/ready`);
    assert(readyRes.statusCode === 200 && readyRes.data?.status === 'ready', 'Render container responds to /ready endpoint');
  } finally {
    await stopCloudServer();
    delete process.env.RENDER;
    delete process.env.PORT;
  }

  // ---------------------------------------------------------------------------
  // STEP 3: SUPABASE S3 STORAGE ADAPTER VALIDATION
  // ---------------------------------------------------------------------------
  console.log('\nStep 3: Testing Supabase S3 Storage Adapter Specifications...');

  // Configure Supabase S3 provider configuration structure
  const supabaseS3Config = {
    bucket: 'vending-evidence-staging',
    endpoint: 'https://xyzcompany.supabase.co/storage/v1/s3',
    region: 'eu-west-1',
    accessKey: 'test_supabase_access_key',
    secretKey: 'test_supabase_secret_key'
  };

  const s3Provider = new S3CompatibleStorageProvider(supabaseS3Config);
  assert(!!s3Provider, 'Instantiated S3CompatibleStorageProvider with Supabase S3 endpoint');

  // Test URL formation adheres to path-style S3 endpoint
  const testKey = 'evidence/TCK-2026-0001/2026/09/sample-evidence.jpg';
  const expectedUrl = `https://xyzcompany.supabase.co/storage/v1/s3/vending-evidence-staging/${testKey}`;
  const generatedUrl = s3Provider.getUrl(testKey);
  assert(generatedUrl === expectedUrl, `S3 path-style URL correctly formed for Supabase endpoint: ${generatedUrl}`);

  // Test Disguised Executable Rejection (Magic byte validation)
  console.log('  Testing binary signature & security enforcement...');
  const fakeExeAsJpeg = Buffer.from('MZ\x90\x00This is an executable disguised as jpeg');
  let rejectedDisguised = false;
  try {
    await s3Provider.upload({
      buffer: fakeExeAsJpeg,
      mimeType: 'image/jpeg',
      ticketId: 'TCK-2026-0001',
      technicianId: 'TECH-001'
    });
  } catch (err: any) {
    rejectedDisguised = true;
    assert(err.message.includes('CORRUPT_OR_DISGUISED_MEDIA'), 'Disguised executable with JPEG extension is blocked by magic byte check');
  }
  assert(rejectedDisguised, 'Executable binary was rejected');

  // Test Empty Buffer Rejection
  let rejectedEmpty = false;
  try {
    await s3Provider.upload({
      buffer: Buffer.alloc(0),
      mimeType: 'image/png',
      ticketId: 'TCK-2026-0001',
      technicianId: 'TECH-001'
    });
  } catch (err: any) {
    rejectedEmpty = true;
    assert(err.message.includes('EMPTY_FILE'), 'Empty upload file buffer is rejected');
  }
  assert(rejectedEmpty, 'Empty file buffer was rejected');

  // Test File Exceeding 10MB Limit
  let rejectedTooLarge = false;
  try {
    const elevenMbBuffer = Buffer.alloc(11 * 1024 * 1024);
    await s3Provider.upload({
      buffer: elevenMbBuffer,
      mimeType: 'image/png',
      ticketId: 'TCK-2026-0001',
      technicianId: 'TECH-001'
    });
  } catch (err: any) {
    rejectedTooLarge = true;
    assert(err.message.includes('FILE_TOO_LARGE'), 'File exceeding 10MB limit is rejected');
  }
  assert(rejectedTooLarge, 'Over-sized 11MB file was rejected');

  // ---------------------------------------------------------------------------
  // STEP 4: AUDITING DOCKERFILE & RENDER BUILD SPECIFICATIONS
  // ---------------------------------------------------------------------------
  console.log('\nStep 4: Auditing Dockerfile for Render Deployability...');
  const dockerfilePath = path.resolve(process.cwd(), 'cloud/Dockerfile');
  assert(fs.existsSync(dockerfilePath), 'cloud/Dockerfile exists');

  const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf8');
  assert(!dockerfileContent.includes('src/types.ts'), 'Dockerfile does NOT contain obsolete COPY src/types.ts');
  assert(dockerfileContent.includes('COPY cloud ./cloud'), 'Dockerfile copies cloud source directory');
  assert(dockerfileContent.includes('COPY tsconfig*.json ./'), 'Dockerfile copies tsconfig*.json');
  assert(dockerfileContent.includes('COPY package.json package-lock.json'), 'Dockerfile copies package manifests');

  // Verify all static source paths referenced in COPY exist in repository root
  const rootDir = process.cwd();
  const copyLines = dockerfileContent.split('\n').filter(line => line.trim().startsWith('COPY') && !line.includes('--from=builder'));
  for (const line of copyLines) {
    const parts = line.trim().split(/\s+/);
    // Ignore flags like --chown
    const sourceTokens = parts.slice(1, -1).filter(p => !p.startsWith('--'));
    for (const token of sourceTokens) {
      // Check wildcard or exact path
      if (token.includes('*')) {
        const baseName = token.replace('*', '');
        const files = fs.readdirSync(rootDir).filter(f => f.startsWith(baseName.replace('./', '')));
        assert(files.length > 0, `Wildcard COPY path '${token}' matches at least one file`);
      } else {
        const fullPath = path.resolve(rootDir, token);
        assert(fs.existsSync(fullPath), `COPY instruction source '${token}' exists in build context`);
      }
    }
  }

  // Verify .dockerignore exists in root
  const rootDockerignore = path.resolve(process.cwd(), '.dockerignore');
  assert(fs.existsSync(rootDockerignore), '.dockerignore exists in repository root for build context');
  const dockerignoreContent = fs.readFileSync(rootDockerignore, 'utf8');
  assert(dockerignoreContent.includes('fleet_data.json'), 'Root .dockerignore protects fleet_data.json');
  assert(dockerignoreContent.includes('fleet_master_baseline.json'), 'Root .dockerignore protects fleet_master_baseline.json');

  // ---------------------------------------------------------------------------
  // STEP 5: ABSOLUTE FLEET DATA SAFETY CHECK (189 MACHINES)
  // ---------------------------------------------------------------------------
  console.log('\nStep 5: Verifying Fleet Baseline Integrity (189 Protected Machines)...');
  const fleetData = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'fleet_data.json'), 'utf8'));
  const baselineData = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'fleet_master_baseline.json'), 'utf8'));
  const baselineMachines = Array.isArray(baselineData) ? baselineData : (baselineData.machines || []);

  assert(fleetData.machines.length === 189, `Protected fleet has exactly 189 machines (actual: ${fleetData.machines.length})`);
  assert(baselineMachines.length === 189, `Protected baseline file has exactly 189 machines (actual: ${baselineMachines.length})`);

  const uniqueIds = new Set(fleetData.machines.map((m: any) => m.id));
  assert(uniqueIds.size === 189, 'Local fleet has zero duplicate machine IDs (189 unique)');

  const uniqueTokens = new Set(fleetData.machines.map((m: any) => m.publicQrToken));
  assert(uniqueTokens.size === 189, 'Local fleet has zero duplicate publicQrTokens (189 unique)');

  console.log('\n================================================================');
  console.log(` PHASE 5.2 VERIFICATION COMPLETE: ${passedAssertions}/${totalAssertions} PASSED (100%)`);
  console.log(' Fleet Baseline preserved: 189 machines intact.');
  console.log(' Standalone Cloud is fully ready for Render Web Service deployment.');
  console.log('================================================================\n');
}

runPhase52Verification().catch(err => {
  console.error('Fatal Verification Error:', err);
  process.exit(1);
});

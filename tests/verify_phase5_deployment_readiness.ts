import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { JsonCloudRepositoryManager } from '../cloud/src/repositories/jsonRepository';
import { S3CompatibleStorageProvider } from '../cloud/src/storage/cloudStorage';
import { cloudDb } from '../cloud/src/db/cloudDb';

async function runPhase5Verification() {
  console.log('================================================================');
  console.log(' PHASE 5 COMPREHENSIVE VERIFICATION & READINESS SUITE');
  console.log('================================================================\n');

  let passedAssertions = 0;
  let totalAssertions = 0;

  function assert(condition: boolean, message: string) {
    totalAssertions++;
    if (condition) {
      console.log(`  ✓ [PASS] ${message}`);
      passedAssertions++;
    } else {
      console.error(`  ✗ [FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 1: Baseline Dataset & Registry Integrity (189 Machines)
  // ---------------------------------------------------------------------------
  console.log('Step 1: Auditing Baseline Fleet & Cloud Data Integrity...');
  const fleetDataRaw = fs.readFileSync(path.resolve(process.cwd(), 'fleet_data.json'), 'utf8');
  const fleetData = JSON.parse(fleetDataRaw);
  const cloudDataRaw = fs.readFileSync(path.resolve(process.cwd(), 'cloud_data.json'), 'utf8');
  const cloudData = JSON.parse(cloudDataRaw);

  const localMachines = Array.isArray(fleetData) ? fleetData : fleetData.machines;
  const cloudMachines = cloudData.cloud_machine_registry || [];

  assert(localMachines.length === 189, `Local fleet must remain exactly 189 machines (found: ${localMachines.length})`);
  assert(cloudMachines.length === 189, `Cloud registry must remain exactly 189 machines (found: ${cloudMachines.length})`);

  // Duplicate checks
  const localIds = new Set(localMachines.map((m: any) => m.id));
  assert(localIds.size === 189, 'Local fleet has zero duplicate IDs');
  const cloudTokens = new Set(cloudMachines.map((m: any) => m.publicQrToken.toUpperCase()));
  assert(cloudTokens.size === 189, 'Cloud registry has zero duplicate publicQrTokens');

  // Baseline comparison
  const baselinePath = path.resolve(process.cwd(), 'fleet_master_baseline.json');
  if (fs.existsSync(baselinePath)) {
    const baselineRaw = fs.readFileSync(baselinePath, 'utf8');
    const baseline = JSON.parse(baselineRaw);
    const baselineMachines = Array.isArray(baseline) ? baseline : (baseline.machines || []);
    assert(baselineMachines.length === 189, `Master baseline file is preserved with 189 machines (found: ${baselineMachines.length})`);
  }

  // ---------------------------------------------------------------------------
  // STEP 2: SQL Migration Files & Constraints
  // ---------------------------------------------------------------------------
  console.log('\nStep 2: Validating PostgreSQL Schema & Migration Files...');
  const migrationPath = path.resolve(process.cwd(), 'cloud/src/db/migrations/001_initial_cloud_schema.sql');
  assert(fs.existsSync(migrationPath), 'SQL migration file 001_initial_cloud_schema.sql exists');

  const sqlContent = fs.readFileSync(migrationPath, 'utf8');
  const requiredTables = [
    'schema_migrations',
    'cloud_machines',
    'cloud_tickets',
    'technician_accounts',
    'technician_sessions',
    'technician_checkins',
    'ticket_actions',
    'ticket_evidence',
    'functional_tests',
    'part_requests',
    'sync_events',
    'idempotency_keys',
    'audit_events'
  ];

  for (const table of requiredTables) {
    assert(sqlContent.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `Migration contains table ${table}`);
  }

  assert(sqlContent.includes('integration_machine_id VARCHAR(128) NOT NULL UNIQUE'), 'cloud_machines enforces UNIQUE integration_machine_id');
  assert(sqlContent.includes('public_qr_token VARCHAR(64) NOT NULL UNIQUE'), 'cloud_machines enforces UNIQUE public_qr_token');
  assert(sqlContent.includes('tracking_token VARCHAR(128) NOT NULL UNIQUE'), 'cloud_tickets enforces UNIQUE tracking_token');
  assert(sqlContent.includes('event_id VARCHAR(128) NOT NULL UNIQUE'), 'sync_events enforces UNIQUE event_id');
  assert(sqlContent.includes('idempotency_key VARCHAR(255) PRIMARY KEY'), 'idempotency_keys enforces PRIMARY KEY');

  // ---------------------------------------------------------------------------
  // STEP 3: Repository Pattern Abstraction
  // ---------------------------------------------------------------------------
  console.log('\nStep 3: Testing Repository Abstraction Layer...');
  const repoManager = new JsonCloudRepositoryManager(cloudDb);
  assert(repoManager.providerType === 'JSON_DEV', 'Repository manager is instantiated');

  const sampleToken = cloudMachines[0].publicQrToken;
  const foundMachine = await repoManager.machines.findByQrToken(sampleToken);
  assert(!!foundMachine, `Repository found machine by QR token: ${sampleToken}`);
  assert(foundMachine?.integrationMachineId === cloudMachines[0].integrationMachineId, 'Repository retrieved correct machine ID');

  const health = await repoManager.checkHealth();
  assert(health.healthy === true, 'Repository health check returns healthy');
  assert(health.details.machineCount === 189, 'Repository reports exactly 189 machines');

  // ---------------------------------------------------------------------------
  // STEP 4: Cloudflare R2 / S3 Object Storage Provider Tests
  // ---------------------------------------------------------------------------
  console.log('\nStep 4: Testing Object Storage Provider & Security Rules...');
  const s3Provider = new S3CompatibleStorageProvider({
    bucket: 'test-bucket',
    region: 'auto'
  });

  // Valid JPEG with correct magic bytes: FF D8 FF
  const validJpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
  const uploadRes = await s3Provider.upload({
    buffer: validJpegBuffer,
    mimeType: 'image/jpeg',
    ticketId: 'TCK-TEST-001',
    technicianId: 'TECH-001'
  });

  assert(!!uploadRes.objectKey, 'Generated valid objectKey for evidence upload');
  assert(uploadRes.objectKey.startsWith('evidence/TCK-TEST-001/'), 'Key adheres to evidence/{ticketId}/{year}/{month}/ format');
  assert(uploadRes.sha256 === crypto.createHash('sha256').update(validJpegBuffer).digest('hex'), 'Calculated correct SHA-256 digest');

  // Disguised executable test (magic bytes do not match declared MIME)
  let rejectedDisguised = false;
  try {
    const disguisedBuffer = Buffer.from([0x4D, 0x5A, 0x90, 0x00]); // MZ executable signature
    await s3Provider.upload({
      buffer: disguisedBuffer,
      mimeType: 'image/jpeg',
      ticketId: 'TCK-TEST-002',
      technicianId: 'TECH-001'
    });
  } catch (err: any) {
    rejectedDisguised = true;
    assert(err.message.includes('CORRUPT_OR_DISGUISED_MEDIA'), 'Disguised executable successfully blocked');
  }
  assert(rejectedDisguised, 'Failed upload with invalid magic numbers was rejected');

  // Unsupported media type test (e.g. text/html)
  let rejectedHtml = false;
  try {
    await s3Provider.upload({
      buffer: Buffer.from('<html>alert(1)</html>'),
      mimeType: 'text/html',
      ticketId: 'TCK-TEST-003',
      technicianId: 'TECH-001'
    });
  } catch (err: any) {
    rejectedHtml = true;
    assert(err.message.includes('UNSUPPORTED_MEDIA_TYPE'), 'Disallowed MIME type HTML was rejected');
  }
  assert(rejectedHtml, 'Upload of unauthorized MIME type was properly rejected');

  // ---------------------------------------------------------------------------
  // STEP 5: Cloud Run Container Readiness
  // ---------------------------------------------------------------------------
  console.log('\nStep 5: Inspecting Dockerfile & Deployment Specifications...');
  const dockerfilePath = path.resolve(process.cwd(), 'cloud/Dockerfile');
  assert(fs.existsSync(dockerfilePath), 'cloud/Dockerfile exists for container deployment');

  const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf8');
  assert(dockerfileContent.includes('FROM node:20-alpine'), 'Dockerfile uses deterministic Node.js alpine base image');
  assert(dockerfileContent.includes('USER node'), 'Dockerfile executes as non-root user');
  assert(dockerfileContent.includes('PORT'), 'Dockerfile supports PORT environment variable');
  assert(dockerfileContent.includes('HEALTHCHECK'), 'Dockerfile defines container HEALTHCHECK');

  const dockerignorePath = path.resolve(process.cwd(), 'cloud/.dockerignore');
  assert(fs.existsSync(dockerignorePath), 'cloud/.dockerignore exists');
  const dockerignoreContent = fs.readFileSync(dockerignorePath, 'utf8');
  assert(dockerignoreContent.includes('fleet_data.json'), '.dockerignore excludes fleet_data.json from container');
  assert(dockerignoreContent.includes('fleet_master_baseline.json'), '.dockerignore excludes fleet_master_baseline.json from container');

  // ---------------------------------------------------------------------------
  // STEP 6: Environment Variables & Documentation
  // ---------------------------------------------------------------------------
  console.log('\nStep 6: Auditing .env.example Documentation...');
  const envExamplePath = path.resolve(process.cwd(), '.env.example');
  const envExampleContent = fs.readFileSync(envExamplePath, 'utf8');

  assert(envExampleContent.includes('CLOUD_DATABASE_URL='), '.env.example documents CLOUD_DATABASE_URL');
  assert(envExampleContent.includes('CLOUD_STORAGE_PROVIDER='), '.env.example documents CLOUD_STORAGE_PROVIDER');
  assert(envExampleContent.includes('CLOUD_STORAGE_ENDPOINT='), '.env.example documents CLOUD_STORAGE_ENDPOINT');
  assert(envExampleContent.includes('CLOUD_SESSION_SECRET='), '.env.example documents CLOUD_SESSION_SECRET');
  assert(envExampleContent.includes('PORT='), '.env.example documents PORT');

  console.log('\n================================================================');
  console.log(` PHASE 5 READINESS COMPLETE: ${passedAssertions}/${totalAssertions} ASSERTIONS PASSED (100%)`);
  console.log(' Fleet Baseline preserved: 189 machines intact.');
  console.log(' Cloud Service is fully prepared for Cloud Run & Supabase/R2 deployment.');
  console.log('================================================================\n');
}

runPhase5Verification().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

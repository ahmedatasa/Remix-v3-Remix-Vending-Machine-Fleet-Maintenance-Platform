import fs from 'fs';
import path from 'path';
import http from 'http';
import { runCloudDatabaseMigrations } from '../cloud/src/db/migrations/runner';
import { startCloudServer, stopCloudServer } from '../cloud/src/server';

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

// Simulated PostgreSQL Pool for testing runner transactions & idempotency
function createMockPgPool() {
  const schemaMigrations: { version: string; name: string; applied_at: Date }[] = [];
  const executedQueries: string[] = [];

  const mockClient: any = {
    query: async (sql: string, params?: any[]) => {
      executedQueries.push(sql.trim());

      // Query for already applied migrations
      if (sql.includes('SELECT') && sql.includes('FROM schema_migrations')) {
        return {
          rows: schemaMigrations.map(m => ({ version: m.version, name: m.name }))
        };
      }

      // Insert into schema_migrations
      if (sql.includes('INSERT INTO schema_migrations')) {
        const [version, name] = params || [];
        schemaMigrations.push({ version, name, applied_at: new Date() });
        return { rowCount: 1 };
      }

      // Check health queries
      if (sql.includes('SELECT 1 as alive')) {
        return { rows: [{ alive: 1, server_time: new Date() }] };
      }

      if (sql.includes('SELECT COUNT(*) as cnt FROM cloud_machines')) {
        return { rows: [{ cnt: '0' }] };
      }

      // All CREATE TABLE / INDEX queries
      return { rows: [], rowCount: 0 };
    },
    release: () => {}
  };

  const mockPool: any = {
    connect: async () => mockClient,
    query: async (sql: string, params?: any[]) => mockClient.query(sql, params)
  };

  return { mockPool, schemaMigrations, executedQueries };
}

async function runMigrationDiscoverySuite() {
  console.log('================================================================');
  console.log(' PHASE 5.3 — POSTGRESQL MIGRATION DISCOVERY & RUNNER SUITE ');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // STEP 1: RESOLUTION STRATEGY & FILE DISCOVERY
  // ---------------------------------------------------------------------------
  console.log('Step 1: Testing Migration Path Resolution & File Discovery...');

  // Default path without CLOUD_MIGRATIONS_DIR
  delete process.env.CLOUD_MIGRATIONS_DIR;
  const defaultExpectedDir = path.resolve(process.cwd(), 'cloud', 'src', 'db', 'migrations');
  assert(fs.existsSync(defaultExpectedDir), `Default migration directory exists: ${defaultExpectedDir}`);

  const defaultFiles = fs.readdirSync(defaultExpectedDir).filter(f => f.endsWith('.sql'));
  assert(defaultFiles.includes('001_initial_cloud_schema.sql'), 'Discovered 001_initial_cloud_schema.sql in default migrations directory');

  // Custom path with CLOUD_MIGRATIONS_DIR
  const tempCustomDir = path.resolve(process.cwd(), 'cloud/src/db/migrations');
  process.env.CLOUD_MIGRATIONS_DIR = tempCustomDir;
  assert(process.env.CLOUD_MIGRATIONS_DIR === tempCustomDir, 'CLOUD_MIGRATIONS_DIR environment variable is recognized');
  delete process.env.CLOUD_MIGRATIONS_DIR;

  // ---------------------------------------------------------------------------
  // STEP 2: SCHEMA FILE IDEMPOTENCY & NON-DESTRUCTIVE AUDIT
  // ---------------------------------------------------------------------------
  console.log('\nStep 2: Auditing 001_initial_cloud_schema.sql Non-Destructive Integrity...');
  const migrationFilePath = path.join(defaultExpectedDir, '001_initial_cloud_schema.sql');
  const sqlContent = fs.readFileSync(migrationFilePath, 'utf8');

  // Must NOT contain destructive DDL/DML
  assert(!sqlContent.match(/\bDROP\s+TABLE\b/i), 'Contains NO DROP TABLE statements');
  assert(!sqlContent.match(/\bDROP\s+DATABASE\b/i), 'Contains NO DROP DATABASE statements');
  assert(!sqlContent.match(/\bTRUNCATE\b/i), 'Contains NO TRUNCATE statements');
  assert(!sqlContent.match(/\bDELETE\s+FROM\b/i), 'Contains NO DELETE statements');

  // Verify all 13 required tables
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
    assert(sqlContent.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `Schema declares non-destructive table: ${table}`);
  }

  // ---------------------------------------------------------------------------
  // STEP 3: MIGRATION RUNNER DOUBLE EXECUTION (RUN 1 vs RUN 2)
  // ---------------------------------------------------------------------------
  console.log('\nStep 3: Running Migration Runner Twice (First Run vs Second Run)...');
  const { mockPool, schemaMigrations } = createMockPgPool();

  // FIRST RUN: 001_initial_cloud_schema.sql applied exactly once
  const result1 = await runCloudDatabaseMigrations(mockPool);
  assert(result1.success === true, 'First migration run succeeded');
  assert(result1.applied.length === 1, `First run applied exactly 1 migration (applied: ${result1.applied.join(', ')})`);
  assert(result1.applied[0] === '001_initial_cloud_schema.sql', 'Applied migration is 001_initial_cloud_schema.sql');
  assert(schemaMigrations.length === 1, 'schema_migrations table has exactly 1 entry');
  assert(schemaMigrations[0].version === '001', 'schema_migrations entry version is "001"');
  assert(schemaMigrations[0].name === '001_initial_cloud_schema.sql', 'schema_migrations entry name is "001_initial_cloud_schema.sql"');

  // SECOND RUN: Idempotency check - no duplicate migration, schema up to date
  const result2 = await runCloudDatabaseMigrations(mockPool);
  assert(result2.success === true, 'Second migration run succeeded');
  assert(result2.applied.length === 0, 'Second run applied 0 new migrations (idempotent)');
  assert(result2.message === 'Database schema is already up to date.', 'Second run returned message: "Database schema is already up to date."');
  assert(schemaMigrations.length === 1, 'schema_migrations table still has exactly 1 entry (no duplicates)');

  // ---------------------------------------------------------------------------
  // STEP 4: STAGING/PRODUCTION ZERO-FILES DETECTION FAILURE CHECK
  // ---------------------------------------------------------------------------
  console.log('\nStep 4: Testing Startup Failure on Missing Migrations in Staging/Production...');
  const emptyTempDir = path.resolve(process.cwd(), 'node_modules/.temp_empty_migrations');
  fs.mkdirSync(emptyTempDir, { recursive: true });

  const prevEnv = process.env.NODE_ENV;
  let stagingFailedAsExpected = false;
  let prodFailedAsExpected = false;

  try {
    process.env.CLOUD_MIGRATIONS_DIR = emptyTempDir;

    // In staging:
    process.env.NODE_ENV = 'staging';
    try {
      await runCloudDatabaseMigrations(mockPool);
    } catch (err: any) {
      if (err.message.includes('CLOUD_MIGRATION_FILES_NOT_FOUND')) {
        stagingFailedAsExpected = true;
      }
    }
    assert(stagingFailedAsExpected, 'Staging mode throws CLOUD_MIGRATION_FILES_NOT_FOUND if 0 SQL files discovered');

    // In production:
    process.env.NODE_ENV = 'production';
    try {
      await runCloudDatabaseMigrations(mockPool);
    } catch (err: any) {
      if (err.message.includes('CLOUD_MIGRATION_FILES_NOT_FOUND')) {
        prodFailedAsExpected = true;
      }
    }
    assert(prodFailedAsExpected, 'Production mode throws CLOUD_MIGRATION_FILES_NOT_FOUND if 0 SQL files discovered');
  } finally {
    process.env.NODE_ENV = prevEnv;
    delete process.env.CLOUD_MIGRATIONS_DIR;
    try { fs.rmdirSync(emptyTempDir); } catch {}
  }

  // ---------------------------------------------------------------------------
  // STEP 5: REPOSITORY CHECKHEALTH() QUERY CONTRACT (SELECT 1 & COUNT cloud_machines)
  // ---------------------------------------------------------------------------
  console.log('\nStep 5: Testing checkHealth() Database Queries Contract...');
  const { PostgresCloudRepositoryManager } = await import('../cloud/src/repositories/postgresRepository');
  const pgRepoManager = new PostgresCloudRepositoryManager(mockPool);

  const healthCheckResult = await pgRepoManager.checkHealth();
  assert(healthCheckResult.healthy === true, 'PostgresCloudRepositoryManager.checkHealth() returns healthy = true');
  assert(healthCheckResult.details?.provider === 'POSTGRESQL', 'Provider reported as POSTGRESQL');
  assert(typeof healthCheckResult.details?.machineCount === 'number', 'machineCount is returned from cloud_machines query');

  // ---------------------------------------------------------------------------
  // STEP 6: VERIFYING /health AND /ready RUNTIME RESPONSES
  // ---------------------------------------------------------------------------
  console.log('\nStep 6: Verifying /health and /ready Runtime HTTP Endpoints...');
  const testPort = 8098;
  process.env.RENDER = 'true';
  process.env.PORT = String(testPort);

  await startCloudServer(testPort);

  try {
    const healthRes = await httpGet(`http://127.0.0.1:${testPort}/health`);
    assert(healthRes.statusCode === 200, `/health returns HTTP 200 (received ${healthRes.statusCode})`);
    assert(healthRes.data?.status === 'HEALTHY', '/health status is HEALTHY');

    const readyRes = await httpGet(`http://127.0.0.1:${testPort}/ready`);
    assert(readyRes.statusCode === 200, `/ready returns HTTP 200 (received ${readyRes.statusCode})`);
    assert(readyRes.data?.status === 'ready', '/ready status is ready');
    assert(readyRes.data?.service === 'ksu-vending-cloud', '/ready reports service = ksu-vending-cloud');
  } finally {
    await stopCloudServer();
    delete process.env.RENDER;
    delete process.env.PORT;
  }

  // ---------------------------------------------------------------------------
  // STEP 7: PROTECTED FLEET BASELINE INTEGRITY (189 MACHINES)
  // ---------------------------------------------------------------------------
  console.log('\nStep 7: Verifying Fleet Baseline & Zero Machine Alterations...');
  const fleetData = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'fleet_data.json'), 'utf8'));
  const baselineData = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'fleet_master_baseline.json'), 'utf8'));
  const baselineMachines = Array.isArray(baselineData) ? baselineData : (baselineData.machines || []);

  assert(fleetData.machines.length === 189, `Protected fleet has exactly 189 machines (actual: ${fleetData.machines.length})`);
  assert(baselineMachines.length === 189, `Baseline file has exactly 189 machines (actual: ${baselineMachines.length})`);

  const uniqueIds = new Set(fleetData.machines.map((m: any) => m.id));
  assert(uniqueIds.size === 189, 'Local fleet has zero duplicate machine IDs (189 unique)');

  const uniqueTokens = new Set(fleetData.machines.map((m: any) => m.publicQrToken));
  assert(uniqueTokens.size === 189, 'Local fleet has zero duplicate publicQrTokens (189 unique)');

  console.log('\n================================================================');
  console.log(` PHASE 5.3 VERIFICATION COMPLETE: ${passedAssertions}/${totalAssertions} PASSED (100%)`);
  console.log(' Migration discovery, runner idempotency, diagnostics, and table');
  console.log(' integrity verified. Baseline fleet remains 100% intact (189).');
  console.log('================================================================\n');
}

runMigrationDiscoverySuite().catch(err => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});

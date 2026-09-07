import { Pool } from 'pg';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { PostgresCloudRepositoryManager } from '../cloud/src/repositories/postgresRepository';
import { ICloudRepositoryManager } from '../cloud/src/repositories/interfaces';
import { TicketService } from '../cloud/src/services/ticketService';
import { AuthService } from '../cloud/src/services/authService';
import { cloudDb } from '../cloud/src/db/cloudDb';

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

/**
 * Creates an in-memory SQL mock Postgres pool implementing pg.Pool query and connect interface.
 * Emulates the exact schema tables:
 * - cloud_machines
 * - cloud_tickets
 * - cloud_checkins
 * - cloud_ticket_actions
 * - cloud_evidence
 * - cloud_functional_tests
 * - cloud_part_requests
 * - technician_accounts
 * - technician_sessions
 * - sync_events
 * - cloud_audit_log
 * - cloud_idempotency_keys
 */
function createMockPostgresPool(): Pool {
  const tables: Record<string, any[]> = {
    cloud_machines: [],
    cloud_tickets: [],
    cloud_checkins: [],
    cloud_ticket_actions: [],
    cloud_evidence: [],
    cloud_functional_tests: [],
    cloud_part_requests: [],
    technician_accounts: [],
    technician_sessions: [],
    sync_events: [],
    cloud_audit_log: [],
    cloud_idempotency_keys: []
  };

  let syncEventAutoIncrement = 1;

  const mockPool: any = {
    query: async (sql: string, params: any[] = []) => {
      const cleanSql = sql.trim();

      // COUNT queries
      if (cleanSql.includes('SELECT COUNT(*) as cnt FROM cloud_machines')) {
        return { rows: [{ cnt: String(tables.cloud_machines.length) }], rowCount: 1 };
      }
      if (cleanSql.includes('SELECT COUNT(*) as cnt FROM cloud_tickets')) {
        return { rows: [{ cnt: String(tables.cloud_tickets.length) }], rowCount: 1 };
      }
      if (cleanSql.includes('SELECT COUNT(*) as cnt FROM technician_accounts')) {
        return { rows: [{ cnt: String(tables.technician_accounts.length) }], rowCount: 1 };
      }
      if (cleanSql.includes('SELECT COUNT(*) as cnt FROM technician_sessions WHERE expires_at > CURRENT_TIMESTAMP')) {
        const now = Date.now();
        const active = tables.technician_sessions.filter(s => new Date(s.expires_at).getTime() > now).length;
        return { rows: [{ cnt: String(active) }], rowCount: 1 };
      }
      if (cleanSql.includes('SELECT COUNT(*) as cnt FROM sync_events WHERE status = \'PENDING\'')) {
        const pending = tables.sync_events.filter(e => e.status === 'PENDING').length;
        return { rows: [{ cnt: String(pending) }], rowCount: 1 };
      }
      if (cleanSql.includes('SELECT COUNT(*) as cnt FROM sync_events')) {
        return { rows: [{ cnt: String(tables.sync_events.length) }], rowCount: 1 };
      }

      // MACHINES
      if (cleanSql.includes('INSERT INTO cloud_machines')) {
        const [
          integration_machine_id,
          public_qr_token,
          machine_type,
          public_display_name,
          building_public_name,
          location_public_name,
          latitude,
          longitude,
          active,
          version
        ] = params;

        const idx = tables.cloud_machines.findIndex(
          m => m.integration_machine_id === integration_machine_id || m.public_qr_token === public_qr_token
        );
        const row = {
          integration_machine_id,
          public_qr_token,
          machine_type,
          public_display_name,
          building_public_name,
          location_public_name,
          latitude,
          longitude,
          active,
          last_synced_at: new Date(),
          version
        };
        if (idx >= 0) {
          tables.cloud_machines[idx] = row;
        } else {
          tables.cloud_machines.push(row);
        }
        return { rows: [row], rowCount: 1 };
      }

      if (cleanSql.includes('SELECT * FROM cloud_machines WHERE UPPER(public_qr_token) = $1')) {
        const token = params[0];
        const match = tables.cloud_machines.filter(m => (m.public_qr_token || '').toUpperCase() === token);
        return { rows: match, rowCount: match.length };
      }

      if (cleanSql.includes('SELECT * FROM cloud_machines WHERE integration_machine_id = $1')) {
        const id = params[0];
        const match = tables.cloud_machines.filter(m => m.integration_machine_id === id);
        return { rows: match, rowCount: match.length };
      }

      // TICKETS
      if (cleanSql.includes('INSERT INTO cloud_tickets')) {
        const [
          id,
          cloud_report_id,
          tracking_token,
          integration_machine_id,
          public_qr_token,
          category,
          description,
          reporter_name,
          reporter_phone,
          reporter_email,
          status,
          sync_status,
          created_at,
          updated_at
        ] = params;
        const row = {
          id,
          cloud_report_id,
          tracking_token,
          integration_machine_id,
          public_qr_token,
          category,
          description,
          reporter_name,
          reporter_phone,
          reporter_email,
          status,
          sync_status,
          created_at: new Date(created_at),
          updated_at: new Date(updated_at),
          resolution_summary: null
        };
        tables.cloud_tickets.push(row);
        return { rows: [row], rowCount: 1 };
      }

      if (cleanSql.includes('SELECT * FROM cloud_tickets WHERE id = $1')) {
        const id = params[0];
        const match = tables.cloud_tickets.filter(t => t.id === id);
        return { rows: match, rowCount: match.length };
      }

      if (cleanSql.includes('SELECT * FROM cloud_tickets WHERE cloud_report_id = $1')) {
        const rptId = params[0];
        const match = tables.cloud_tickets.filter(t => t.cloud_report_id === rptId);
        return { rows: match, rowCount: match.length };
      }

      if (cleanSql.includes('SELECT * FROM cloud_tickets WHERE UPPER(tracking_token) = $1')) {
        const trk = params[0];
        const match = tables.cloud_tickets.filter(t => (t.tracking_token || '').toUpperCase() === trk);
        return { rows: match, rowCount: match.length };
      }

      if (cleanSql.includes('UPDATE cloud_tickets SET status = $1, resolution_summary = $2')) {
        const [status, resolutionSummary, ticketId] = params;
        const ticket = tables.cloud_tickets.find(t => t.id === ticketId);
        if (ticket) {
          ticket.status = status;
          ticket.resolution_summary = resolutionSummary;
          ticket.updated_at = new Date();
        }
        return { rows: [], rowCount: ticket ? 1 : 0 };
      }

      if (cleanSql.includes('UPDATE cloud_tickets SET status = $1, updated_at = CURRENT_TIMESTAMP')) {
        const [status, ticketId] = params;
        const ticket = tables.cloud_tickets.find(t => t.id === ticketId);
        if (ticket) {
          ticket.status = status;
          ticket.updated_at = new Date();
        }
        return { rows: [], rowCount: ticket ? 1 : 0 };
      }

      // SUB-RECORDS: CHECKINS
      if (cleanSql.includes('INSERT INTO technician_checkins') || cleanSql.includes('INSERT INTO cloud_checkins')) {
        const [
          id,
          ticket_id,
          technician_id,
          technician_name,
          latitude,
          longitude,
          accuracy_meters,
          distance_meters,
          verified,
          status,
          manual_exception_json
        ] = params;
        const row = {
          id,
          ticket_id,
          technician_id,
          technician_name,
          created_at: new Date(),
          latitude,
          longitude,
          accuracy_meters,
          distance_meters,
          verified,
          status,
          manual_exception_json
        };
        tables.cloud_checkins.push(row);
        return { rows: [row], rowCount: 1 };
      }

      if (cleanSql.includes('FROM technician_checkins WHERE ticket_id = $1') || cleanSql.includes('FROM cloud_checkins WHERE ticket_id = $1')) {
        const ticketId = params[0];
        const match = tables.cloud_checkins.filter(c => c.ticket_id === ticketId);
        return { rows: match, rowCount: match.length };
      }

      // SUB-RECORDS: ACTIONS
      if (cleanSql.includes('INSERT INTO ticket_actions') || cleanSql.includes('INSERT INTO cloud_ticket_actions')) {
        const [id, ticket_id, technician_id, technician_name, action_type, description] = params;
        const row = {
          id,
          ticket_id,
          technician_id,
          technician_name,
          action_type,
          description,
          created_at: new Date()
        };
        tables.cloud_ticket_actions.push(row);
        return { rows: [row], rowCount: 1 };
      }

      if (cleanSql.includes('FROM ticket_actions WHERE ticket_id = $1') || cleanSql.includes('FROM cloud_ticket_actions WHERE ticket_id = $1')) {
        const ticketId = params[0];
        const match = tables.cloud_ticket_actions.filter(a => a.ticket_id === ticketId);
        return { rows: match, rowCount: match.length };
      }

      // SUB-RECORDS: EVIDENCE
      if (cleanSql.includes('INSERT INTO ticket_evidence') || cleanSql.includes('INSERT INTO cloud_evidence')) {
        const [id, ticket_id, technician_id, technician_name, object_key, url, mime_type, size_bytes, sha256, caption] = params;
        const row = {
          id,
          ticket_id,
          technician_id,
          technician_name,
          object_key,
          url,
          mime_type,
          size_bytes,
          sha256,
          caption,
          created_at: new Date()
        };
        tables.cloud_evidence.push(row);
        return { rows: [row], rowCount: 1 };
      }

      if (cleanSql.includes('FROM ticket_evidence WHERE ticket_id = $1') || cleanSql.includes('FROM cloud_evidence WHERE ticket_id = $1')) {
        const ticketId = params[0];
        const match = tables.cloud_evidence.filter(e => e.ticket_id === ticketId);
        return { rows: match, rowCount: match.length };
      }

      // SUB-RECORDS: FUNCTIONAL TESTS
      if (cleanSql.includes('INSERT INTO functional_tests') || cleanSql.includes('INSERT INTO cloud_functional_tests')) {
        const [id, ticket_id, technician_id, technician_name, test_type, passed, notes] = params;
        const row = {
          id,
          ticket_id,
          technician_id,
          technician_name,
          test_type,
          passed,
          notes,
          created_at: new Date()
        };
        tables.cloud_functional_tests.push(row);
        return { rows: [row], rowCount: 1 };
      }

      if (cleanSql.includes('FROM functional_tests WHERE ticket_id = $1') || cleanSql.includes('FROM cloud_functional_tests WHERE ticket_id = $1')) {
        const ticketId = params[0];
        const match = tables.cloud_functional_tests.filter(t => t.ticket_id === ticketId);
        return { rows: match, rowCount: match.length };
      }

      // SUB-RECORDS: PART REQUESTS
      if (cleanSql.includes('INSERT INTO part_requests') || cleanSql.includes('INSERT INTO cloud_part_requests')) {
        const [id, ticket_id, technician_id, technician_name, part_id, part_name, quantity_requested, reason, status] = params;
        const row = {
          id,
          ticket_id,
          technician_id,
          technician_name,
          part_id,
          part_name,
          quantity_requested,
          reason,
          status,
          created_at: new Date()
        };
        tables.cloud_part_requests.push(row);
        return { rows: [row], rowCount: 1 };
      }

      if (cleanSql.includes('FROM part_requests WHERE ticket_id = $1') || cleanSql.includes('FROM cloud_part_requests WHERE ticket_id = $1')) {
        const ticketId = params[0];
        const match = tables.cloud_part_requests.filter(p => p.ticket_id === ticketId);
        return { rows: match, rowCount: match.length };
      }

      // TECHNICIANS
      if (cleanSql.includes('INSERT INTO technician_accounts')) {
        const [id, employee_code, full_name, email, phone, password_hash, status, specialization] = params;
        const idx = tables.technician_accounts.findIndex(t => t.id === id || t.employee_code === employee_code);
        const row = {
          id,
          employee_code,
          full_name,
          email,
          phone,
          password_hash,
          status,
          specialization,
          created_at: new Date()
        };
        if (idx >= 0) {
          tables.technician_accounts[idx] = row;
        } else {
          tables.technician_accounts.push(row);
        }
        return { rows: [row], rowCount: 1 };
      }

      if (cleanSql.includes('SELECT * FROM technician_accounts WHERE UPPER(employee_code) = $1 OR UPPER(email) = $1 OR id = $2')) {
        const [code, id] = params;
        const match = tables.technician_accounts.filter(
          t => (t.employee_code || '').toUpperCase() === code || (t.email || '').toUpperCase() === code || t.id === id
        );
        return { rows: match, rowCount: match.length };
      }

      if (cleanSql.includes('SELECT * FROM technician_accounts WHERE id = $1')) {
        const id = params[0];
        const match = tables.technician_accounts.filter(t => t.id === id);
        return { rows: match, rowCount: match.length };
      }

      // SESSIONS
      if (cleanSql.includes('INSERT INTO technician_sessions')) {
        const [session_id, token_hash, technician_id, employee_code, full_name, created_at, expires_at] = params;
        const idx = tables.technician_sessions.findIndex(s => s.session_id === session_id);
        const row = {
          session_id,
          token_hash,
          technician_id,
          employee_code,
          full_name,
          created_at: new Date(created_at),
          expires_at: new Date(expires_at)
        };
        if (idx >= 0) {
          tables.technician_sessions[idx] = row;
        } else {
          tables.technician_sessions.push(row);
        }
        return { rows: [row], rowCount: 1 };
      }

      if (cleanSql.includes('SELECT * FROM technician_sessions WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP')) {
        const hash = params[0];
        const now = Date.now();
        const match = tables.technician_sessions.filter(
          s => s.token_hash === hash && new Date(s.expires_at).getTime() > now
        );
        return { rows: match, rowCount: match.length };
      }

      if (cleanSql.includes('DELETE FROM technician_sessions WHERE session_id = $1')) {
        const id = params[0];
        const prevLen = tables.technician_sessions.length;
        tables.technician_sessions = tables.technician_sessions.filter(s => s.session_id !== id);
        return { rows: [], rowCount: prevLen - tables.technician_sessions.length };
      }

      // SYNC EVENTS
      if (cleanSql.includes('INSERT INTO sync_events')) {
        const [event_id, event_type, entity_id, version, payload] = params;
        const cursor = syncEventAutoIncrement++;
        const row = {
          cursor,
          event_id,
          event_type,
          entity_id,
          version,
          payload,
          status: 'PENDING',
          acknowledged_at: null,
          created_at: new Date()
        };
        tables.sync_events.push(row);
        return { rows: [{ cursor, created_at: row.created_at }], rowCount: 1 };
      }

      if (cleanSql.includes('SELECT cursor, event_id, event_type, entity_id, version, payload, status, acknowledged_at, created_at') && cleanSql.includes('FROM sync_events')) {
        const [cursor, limit] = params;
        const match = tables.sync_events
          .filter(e => e.cursor > cursor)
          .sort((a, b) => a.cursor - b.cursor)
          .slice(0, limit);
        return { rows: match, rowCount: match.length };
      }

      if (cleanSql.includes('UPDATE sync_events') && cleanSql.includes('SET status = \'ACKNOWLEDGED\'')) {
        const [eventIds] = params;
        let count = 0;
        for (const e of tables.sync_events) {
          if (eventIds.includes(e.event_id) && e.status !== 'ACKNOWLEDGED') {
            e.status = 'ACKNOWLEDGED';
            e.acknowledged_at = new Date();
            count++;
          }
        }
        return { rows: [], rowCount: count };
      }

      // AUDIT
      if (cleanSql.includes('INSERT INTO cloud_audit_log')) {
        const [id, actor_type, actor_id, actor_name, action, entity, result, details, ip] = params;
        const row = {
          id,
          actor_type,
          actor_id,
          actor_name,
          action,
          entity,
          result,
          details,
          ip,
          created_at: new Date()
        };
        tables.cloud_audit_log.push(row);
        return { rows: [row], rowCount: 1 };
      }

      // IDEMPOTENCY
      if (cleanSql.includes('INSERT INTO idempotency_keys') || cleanSql.includes('INSERT INTO cloud_idempotency_keys')) {
        const [key, response_payload] = params;
        const idx = tables.cloud_idempotency_keys.findIndex(k => k.key === key);
        const row = {
          key,
          idempotency_key: key,
          response_payload,
          created_at: new Date()
        };
        if (idx >= 0) {
          tables.cloud_idempotency_keys[idx] = row;
        } else {
          tables.cloud_idempotency_keys.push(row);
        }
        return { rows: [row], rowCount: 1 };
      }

      if (cleanSql.includes('FROM idempotency_keys WHERE idempotency_key = $1') || cleanSql.includes('SELECT * FROM cloud_idempotency_keys')) {
        const key = params[0];
        const match = tables.cloud_idempotency_keys.filter(k => k.key === key || k.idempotency_key === key);
        return { rows: match, rowCount: match.length };
      }

      return { rows: [], rowCount: 0 };
    },
    release: () => {},
    connect: async () => mockPool
  };

  return mockPool as Pool;
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 VERIFYING PHASE 5.3: POSTGRES REAL RUNTIME PERSISTENCE');
  console.log('======================================================\n');

  // ----------------------------------------------------
  // TEST 1: SPLIT-BRAIN PERSISTENCE GUARDS
  // ----------------------------------------------------
  console.log('--- Test Suite 1: Split-Brain Persistence Guards ---');

  // Save current NODE_ENV
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'staging';

  let caughtCloudDbWrite = false;
  try {
    cloudDb.save();
  } catch (err: any) {
    if (err.message.includes('FATAL_SPLIT_BRAIN_GUARD')) {
      caughtCloudDbWrite = true;
    }
  }
  assert(caughtCloudDbWrite, 'Direct write to cloudDb in staging/production throws FATAL_SPLIT_BRAIN_GUARD');

  // Restore NODE_ENV
  process.env.NODE_ENV = originalNodeEnv;

  // ----------------------------------------------------
  // TEST 2: POSTGRES REPOSITORY MANAGER INITIALIZATION & CONTRACT
  // ----------------------------------------------------
  console.log('\n--- Test Suite 2: PostgresCloudRepositoryManager Contract ---');

  const mockPool = createMockPostgresPool();
  const repo: ICloudRepositoryManager = new PostgresCloudRepositoryManager(mockPool);

  assert(repo.providerType === 'POSTGRES', 'Repository manager reports providerType = POSTGRES');

  // ----------------------------------------------------
  // TEST 3: BOOTSTRAP IDEMPOTENCY (189 MACHINES + 190th TEST)
  // ----------------------------------------------------
  console.log('\n--- Test Suite 3: Bootstrap Machine Registry & Idempotency ---');

  const baselineMachines = Array.from({ length: 189 }, (_, i) => ({
    integrationMachineId: `MCH-${(i + 1).toString().padStart(3, '0')}`,
    publicQrToken: `QR-KSU-${(i + 1).toString().padStart(4, '0')}`,
    machineType: 'SNACK_AND_DRINK',
    publicDisplayName: `ماكينة بيع رقم ${i + 1}`,
    buildingPublicName: `مبنى ${((i % 15) + 1)}`,
    locationPublicName: `الدور الأرضي - الردهة الرئيسية`,
    latitude: 24.7136,
    longitude: 46.6753,
    active: true,
    lastSyncedAt: new Date().toISOString(),
    version: 1
  }));

  // Initial bootstrap
  const firstBootstrap = await repo.machines.bootstrapRegistry(baselineMachines);
  assert(firstBootstrap.total === 189, `First bootstrap persisted exactly 189 machines`);
  const initialCount = await repo.machines.count();
  assert(initialCount === 189, `Postgres repository count returns exactly 189 machines`);

  // Re-run identical bootstrap: must remain 189 (idempotent, no duplicates)
  const secondBootstrap = await repo.machines.bootstrapRegistry(baselineMachines);
  assert(secondBootstrap.total === 189, `Second bootstrap is idempotent (total count remains 189)`);
  const reCount = await repo.machines.count();
  assert(reCount === 189, `Postgres count remains strictly 189 without duplicating machines`);

  // Add 190th machine to verify dynamic increment
  const machine190 = {
    integrationMachineId: 'MCH-190',
    publicQrToken: 'QR-KSU-0190',
    machineType: 'HOT_BEVERAGE',
    publicDisplayName: 'ماكينة بيع رقم 190',
    buildingPublicName: 'مبنى كلية الهندسة',
    locationPublicName: 'البهو الشرقي',
    latitude: 24.7150,
    longitude: 46.6780,
    active: true,
    lastSyncedAt: new Date().toISOString(),
    version: 1
  };
  await repo.machines.bootstrapRegistry([machine190]);
  const countWith190 = await repo.machines.count();
  assert(countWith190 === 190, `Adding 190th machine dynamically increments count to 190`);

  // ----------------------------------------------------
  // TEST 4: TECHNICIAN REGISTRY & AUTHENTICATION IN POSTGRES
  // ----------------------------------------------------
  console.log('\n--- Test Suite 4: Technician Accounts & Authentication in Postgres ---');

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync('SecureTech123!', salt);

  const testTech = {
    id: 'TECH-001',
    employeeCode: 'EMP-1001',
    fullName: 'أحمد فني الصيانة',
    email: 'ahmed.tech@ksu-vending.edu.sa',
    phone: '0555123456',
    passwordHash,
    status: 'ACTIVE' as const,
    specialization: 'ELECTRONICS'
  };

  await repo.technicians.saveTechnician(testTech);
  const techCount = await repo.technicians.count();
  assert(techCount === 1, `Postgres technician count is 1`);

  const lookupByCode = await repo.technicians.findByEmployeeCode('EMP-1001');
  assert(lookupByCode !== null && lookupByCode.fullName === testTech.fullName, `Technician looked up by employeeCode`);

  const lookupByEmail = await repo.technicians.findByEmployeeCode('ahmed.tech@ksu-vending.edu.sa');
  assert(lookupByEmail !== null && lookupByEmail.id === testTech.id, `Technician looked up by email`);

  // Session creation in Postgres
  const rawSessionToken = 'tech-sess-test-token-1234567890';
  const tokenHash = crypto.createHash('sha256').update(rawSessionToken).digest('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString();

  await repo.sessions.createSession({
    sessionId: 'sess-001',
    tokenHash,
    technicianId: testTech.id,
    employeeCode: testTech.employeeCode,
    fullName: testTech.fullName,
    createdAt: now.toISOString(),
    expiresAt
  });

  const activeSessions = await repo.sessions.countActive();
  assert(activeSessions === 1, `Active session counted in Postgres = 1`);

  const foundSession = await repo.sessions.findSessionByTokenHash(tokenHash);
  assert(foundSession !== null && foundSession.employeeCode === 'EMP-1001', `Session retrieved by SHA-256 token hash from Postgres`);

  // ----------------------------------------------------
  // TEST 5: TICKET LIFECYCLE IN POSTGRES
  // ----------------------------------------------------
  console.log('\n--- Test Suite 5: Ticket Lifecycle & Sub-Records in Postgres ---');

  const ticketId = 'cld-tck-test-001';
  const trackingToken = 'TRK-TEST-7788';
  const reportId = 'rpt-test-001';

  const newTicket = {
    id: ticketId,
    cloudReportId: reportId,
    trackingToken,
    integrationMachineId: 'MCH-001',
    publicQrToken: 'QR-KSU-0001',
    category: 'CARD_READER_FAULT',
    description: 'قارئ البطاقات يرفض البطاقات الجامعية',
    reporterName: 'طالب جامعي',
    reporterPhone: '0501112233',
    reporterEmail: 'student@ksu.edu.sa',
    status: 'OPEN' as const,
    syncStatus: 'PENDING' as const,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    checkins: [],
    actions: [],
    evidence: [],
    functionalTests: [],
    partRequests: []
  };

  await repo.tickets.createTicket(newTicket);
  const totalTickets = await repo.tickets.count();
  assert(totalTickets === 1, `Postgres ticket count = 1`);

  const ticketByTrack = await repo.tickets.findByTrackingToken(trackingToken);
  assert(ticketByTrack !== null && ticketByTrack.id === ticketId, `Ticket retrieved by public tracking token TRK-TEST-7788`);

  // Sub-record: Checkin
  await repo.tickets.addCheckin({
    id: 'chk-001',
    ticketId,
    technicianId: testTech.id,
    technicianName: testTech.fullName,
    timestamp: new Date().toISOString(),
    latitude: 24.7136,
    longitude: 46.6753,
    accuracyMeters: 8,
    distanceMeters: 12,
    verified: true,
    status: 'VERIFIED'
  });

  // Sub-record: Action
  await repo.tickets.addAction({
    id: 'act-001',
    ticketId,
    technicianId: testTech.id,
    technicianName: testTech.fullName,
    actionType: 'CLEAN_SENSOR',
    description: 'تنظيف وتحديث برنامج قارئ البطاقات',
    timestamp: new Date().toISOString()
  });

  // Sub-record: Evidence
  await repo.tickets.addEvidence({
    id: 'evi-001',
    ticketId,
    technicianId: testTech.id,
    technicianName: testTech.fullName,
    objectKey: 'evidence/cld-tck-test-001/img1.jpg',
    url: 'https://storage.ksu-vending.edu.sa/evidence/cld-tck-test-001/img1.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 154200,
    sha256: 'abc123sha256',
    caption: 'صورة شاشة القارئ بعد التحديث',
    timestamp: new Date().toISOString()
  });

  // Sub-record: Functional Test
  await repo.tickets.addFunctionalTest({
    id: 'tst-001',
    ticketId,
    technicianId: testTech.id,
    technicianName: testTech.fullName,
    testType: 'CARD_READER_TEST',
    passed: true,
    notes: 'تمت قراءة بطاقة التجربة بنجاح وسحب المبلغ واختبار الصرف',
    timestamp: new Date().toISOString()
  });

  // Sub-record: Part Request
  await repo.tickets.addPartRequest({
    id: 'prq-001',
    ticketId,
    technicianId: testTech.id,
    technicianName: testTech.fullName,
    partId: 'PRT-NFC-02',
    partName: 'NFC Reader Cable',
    quantityRequested: 1,
    reason: 'سلك توصيل احتياطي',
    status: 'REQUESTED',
    timestamp: new Date().toISOString()
  });

  // Ticket status update
  await repo.tickets.updateTicketStatus(ticketId, 'RESOLVED', 'تم إصلاح قارئ البطاقات وتجربته بنجاح');

  // Verify ticket with all sub-records hydrated from Postgres
  const hydrated = await repo.tickets.findById(ticketId);
  assert(hydrated !== null, `Hydrated ticket found in Postgres`);
  assert(hydrated?.status === 'RESOLVED', `Hydrated ticket status = RESOLVED`);
  assert(hydrated?.resolutionSummary === 'تم إصلاح قارئ البطاقات وتجربته بنجاح', `Hydrated resolutionSummary matches`);
  assert(hydrated?.checkins.length === 1, `Hydrated checkins count = 1`);
  assert(hydrated?.actions.length === 1, `Hydrated actions count = 1`);
  assert(hydrated?.evidence.length === 1, `Hydrated evidence count = 1`);
  assert(hydrated?.functionalTests.length === 1, `Hydrated functionalTests count = 1`);
  assert(hydrated?.partRequests.length === 1, `Hydrated partRequests count = 1`);

  // ----------------------------------------------------
  // TEST 6: SYNC EVENTS & ACKNOWLEDGEMENT IN POSTGRES
  // ----------------------------------------------------
  console.log('\n--- Test Suite 6: Sync Events in Postgres ---');

  const evt1 = await repo.syncEvents.pushEvent('CUSTOMER_TICKET_CREATED', ticketId, { ticketId, status: 'OPEN' });
  const evt2 = await repo.syncEvents.pushEvent('TICKET_RESOLVED', ticketId, { ticketId, status: 'RESOLVED' });

  assert(evt1.cursor === 1, `Sync event 1 has cursor 1`);
  assert(evt2.cursor === 2, `Sync event 2 has cursor 2`);

  const pendingEventsCount = await repo.syncEvents.countPending();
  assert(pendingEventsCount === 2, `Pending sync events in Postgres = 2`);

  const pulled = await repo.syncEvents.getEventsAfter(0, 50);
  assert(pulled.events.length === 2, `Desktop worker pull returned 2 events`);

  const ackResult = await repo.syncEvents.acknowledgeEvents([evt1.eventId]);
  assert(ackResult.acknowledgedCount === 1, `Acknowledged 1 event`);

  const pendingAfterAck = await repo.syncEvents.countPending();
  assert(pendingAfterAck === 1, `Pending sync events after ack = 1`);

  // ----------------------------------------------------
  // TEST 7: AUDIT LOGS IN POSTGRES
  // ----------------------------------------------------
  console.log('\n--- Test Suite 7: Audit Logs in Postgres ---');

  await repo.audit.log({
    actorType: 'TECHNICIAN',
    actorId: testTech.id,
    actorName: testTech.fullName,
    action: 'TICKET_RESOLVED',
    entity: 'TICKET',
    result: 'SUCCESS',
    details: { ticketId, status: 'RESOLVED' },
    ip: '10.0.0.1'
  });

  // Verify Idempotency in Postgres
  await repo.idempotency.set('idemp-key-999', { ticketId, trackingToken });
  const cachedIdemp = await repo.idempotency.get('idemp-key-999');
  assert(cachedIdemp !== null && cachedIdemp.ticketId === ticketId, `Idempotency record retrieved from Postgres`);

  console.log('\n======================================================');
  console.log(`🎉 ALL ${passedAssertions} POSTGRES RUNTIME PERSISTENCE TESTS PASSED`);
  console.log('======================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST RUNNER FATAL ERROR:\n', err);
  process.exit(1);
});

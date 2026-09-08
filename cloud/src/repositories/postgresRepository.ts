import { Pool, PoolClient } from 'pg';
import crypto from 'crypto';
import {
  ICloudRepositoryManager,
  ICloudMachineRepository,
  ICloudTicketRepository,
  ITechnicianRepository,
  ISessionRepository,
  ISyncEventRepository,
  IAuditRepository,
  IIdempotencyRepository,
  IMachineLocationProposalRepository,
  IFieldExceptionApprovalRepository
} from './interfaces';
import type {
  SanitizedCloudMachine,
  CloudTicket,
  CloudCheckinRecord,
  CloudActionRecord,
  CloudEvidenceRecord,
  CloudFunctionalTestRecord,
  CloudPartRequestRecord,
  CloudTechnicianAccount,
  CloudTechnicianSession,
  CloudSyncEvent,
  CloudSyncEventType,
  MachineLocationProposal,
  FieldExceptionApproval,
  LocationSource
} from '../db/cloudDb';

function toIsoDate(d: any): string {
  if (!d) return new Date().toISOString();
  if (d instanceof Date) return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function mapMachineRow(r: any): SanitizedCloudMachine {
  return {
    integrationMachineId: r.integration_machine_id,
    publicQrToken: r.public_qr_token,
    machineNumber: r.machine_number,
    model: r.model,
    machineType: r.machine_type,
    publicDisplayName: r.public_display_name,
    buildingPublicName: r.building_public_name,
    locationPublicName: r.location_public_name,
    latitude: r.latitude !== null && r.latitude !== undefined ? parseFloat(r.latitude) : null,
    longitude: r.longitude !== null && r.longitude !== undefined ? parseFloat(r.longitude) : null,
    locationSource: (r.location_source as LocationSource) || 'NONE',
    locationNote: r.location_note || undefined,
    locationUpdatedAt: r.location_updated_at ? toIsoDate(r.location_updated_at) : undefined,
    locationUpdatedByActorId: r.location_updated_by_actor_id || undefined,
    locationUpdatedByActorName: r.location_updated_by_actor_name || undefined,
    active: r.active,
    lastSyncedAt: toIsoDate(r.last_synced_at),
    version: r.version
  };
}

export class PostgresCloudMachineRepository implements ICloudMachineRepository {
  constructor(private pool: Pool) {}

  async findByQrToken(token: string): Promise<SanitizedCloudMachine | null> {
    if (!token) return null;
    const clean = token.trim().toUpperCase();
    const query = `
      SELECT integration_machine_id, public_qr_token, machine_number, model, machine_type,
             public_display_name, building_public_name, location_public_name,
             latitude, longitude, location_source, location_note, location_updated_at,
             location_updated_by_actor_id, location_updated_by_actor_name,
             active, last_synced_at, version
      FROM cloud_machines
      WHERE UPPER(public_qr_token) = $1
      LIMIT 1;
    `;
    const res = await this.pool.query(query, [clean]);
    if (res.rows.length === 0) return null;
    return mapMachineRow(res.rows[0]);
  }

  async findByIntegrationId(id: string): Promise<SanitizedCloudMachine | null> {
    if (!id) return null;
    const query = `
      SELECT integration_machine_id, public_qr_token, machine_number, model, machine_type,
             public_display_name, building_public_name, location_public_name,
             latitude, longitude, location_source, location_note, location_updated_at,
             location_updated_by_actor_id, location_updated_by_actor_name,
             active, last_synced_at, version
      FROM cloud_machines
      WHERE integration_machine_id = $1
      LIMIT 1;
    `;
    const res = await this.pool.query(query, [id]);
    if (res.rows.length === 0) return null;
    return mapMachineRow(res.rows[0]);
  }

  async bootstrapRegistry(machines: SanitizedCloudMachine[]): Promise<{ updated: number; total: number }> {
    let updated = 0;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const m of machines) {
        const cleanToken = (m.publicQrToken || '').trim().toUpperCase();
        const derivedNumber = m.machineNumber || (m.publicDisplayName ? m.publicDisplayName.split(' ')[0] : null);

        const upsertQuery = `
          INSERT INTO cloud_machines (
            integration_machine_id, public_qr_token, machine_number, model,
            machine_type, public_display_name, building_public_name, location_public_name,
            latitude, longitude, location_source, location_note, active, version, last_synced_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (integration_machine_id) DO UPDATE SET
            public_qr_token = EXCLUDED.public_qr_token,
            machine_number = COALESCE(EXCLUDED.machine_number, cloud_machines.machine_number),
            model = COALESCE(EXCLUDED.model, cloud_machines.model),
            machine_type = EXCLUDED.machine_type,
            public_display_name = EXCLUDED.public_display_name,
            building_public_name = EXCLUDED.building_public_name,
            location_public_name = EXCLUDED.location_public_name,
            latitude = COALESCE(EXCLUDED.latitude, cloud_machines.latitude),
            longitude = COALESCE(EXCLUDED.longitude, cloud_machines.longitude),
            location_source = CASE
              WHEN EXCLUDED.latitude IS NOT NULL THEN EXCLUDED.location_source
              ELSE cloud_machines.location_source
            END,
            location_note = COALESCE(EXCLUDED.location_note, cloud_machines.location_note),
            active = EXCLUDED.active,
            version = cloud_machines.version + 1,
            last_synced_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP;
        `;
        await client.query(upsertQuery, [
          m.integrationMachineId,
          cleanToken,
          derivedNumber,
          m.model || null,
          m.machineType || 'VENDING_MACHINE',
          m.publicDisplayName,
          m.buildingPublicName,
          m.locationPublicName,
          m.latitude ?? null,
          m.longitude ?? null,
          m.locationSource || 'NONE',
          m.locationNote || null,
          m.active ?? true
        ]);
        updated++;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const countRes = await this.pool.query('SELECT COUNT(*) as cnt FROM cloud_machines;');
    return { updated, total: parseInt(countRes.rows[0].cnt, 10) };
  }

  async upsertMachine(machine: SanitizedCloudMachine): Promise<void> {
    await this.bootstrapRegistry([machine]);
  }

  async updateLocation(
    idOrToken: string,
    params: {
      latitude: number | null;
      longitude: number | null;
      locationSource: LocationSource;
      locationNote?: string;
      actorId: string;
      actorName: string;
    }
  ): Promise<SanitizedCloudMachine> {
    const { latitude, longitude, locationSource, locationNote, actorId, actorName } = params;

    // Consistency check: both null or both valid numbers
    if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
      if (latitude !== longitude) {
        throw new Error('INVALID_COORDINATES: يجب تحديد كل من خط العرض وخط الطول معاً أو تركهما كلاهما فارغين.');
      }
    } else {
      if (typeof latitude !== 'number' || isNaN(latitude) || latitude < -90 || latitude > 90) {
        throw new Error(`INVALID_LATITUDE: خط العرض غير صالح (${latitude}). يجب أن يكون بين -90 و 90.`);
      }
      if (typeof longitude !== 'number' || isNaN(longitude) || longitude < -180 || longitude > 180) {
        throw new Error(`INVALID_LONGITUDE: خط الطول غير صالح (${longitude}). يجب أن يكون بين -180 و 180.`);
      }
    }

    const query = `
      UPDATE cloud_machines
      SET latitude = $1,
          longitude = $2,
          location_source = $3,
          location_note = COALESCE($4, location_note),
          location_updated_at = CURRENT_TIMESTAMP,
          location_updated_by_actor_id = $5,
          location_updated_by_actor_name = $6,
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE integration_machine_id = $7 OR UPPER(public_qr_token) = UPPER($7)
      RETURNING *;
    `;
    const res = await this.pool.query(query, [
      latitude ?? null,
      longitude ?? null,
      locationSource,
      locationNote || null,
      actorId,
      actorName,
      idOrToken
    ]);

    if (res.rows.length === 0) {
      throw new Error(`MACHINE_NOT_FOUND: الماكينة المطلوبة (${idOrToken}) غير موجودة.`);
    }

    return mapMachineRow(res.rows[0]);
  }

  async clearLocation(
    idOrToken: string,
    actor: { id: string; name: string }
  ): Promise<SanitizedCloudMachine> {
    const query = `
      UPDATE cloud_machines
      SET latitude = NULL,
          longitude = NULL,
          location_source = 'NONE',
          location_note = NULL,
          location_updated_at = CURRENT_TIMESTAMP,
          location_updated_by_actor_id = $1,
          location_updated_by_actor_name = $2,
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE integration_machine_id = $3 OR UPPER(public_qr_token) = UPPER($3)
      RETURNING *;
    `;
    const res = await this.pool.query(query, [actor.id, actor.name, idOrToken]);
    if (res.rows.length === 0) {
      throw new Error(`MACHINE_NOT_FOUND: الماكينة المطلوبة (${idOrToken}) غير موجودة.`);
    }
    return mapMachineRow(res.rows[0]);
  }

  async removeMachine(idOrToken: string): Promise<boolean> {
    const res = await this.pool.query(
      'DELETE FROM cloud_machines WHERE integration_machine_id = $1 OR UPPER(public_qr_token) = UPPER($1);',
      [idOrToken]
    );
    return (res.rowCount || 0) > 0;
  }

  async count(): Promise<number> {
    const res = await this.pool.query('SELECT COUNT(*) as cnt FROM cloud_machines;');
    return parseInt(res.rows[0].cnt, 10);
  }
}

export class PostgresCloudTicketRepository implements ICloudTicketRepository {
  constructor(private pool: Pool) {}

  private async populateTicketDetails(client: PoolClient | Pool, ticketRow: any): Promise<CloudTicket> {
    const ticketId = ticketRow.id;

    // Load sub-collections concurrently
    const [checkinsRes, actionsRes, evidenceRes, testsRes, partReqsRes] = await Promise.all([
      client.query('SELECT * FROM technician_checkins WHERE ticket_id = $1 ORDER BY created_at ASC;', [ticketId]),
      client.query('SELECT * FROM ticket_actions WHERE ticket_id = $1 ORDER BY created_at ASC;', [ticketId]),
      client.query('SELECT * FROM ticket_evidence WHERE ticket_id = $1 ORDER BY created_at ASC;', [ticketId]),
      client.query('SELECT * FROM functional_tests WHERE ticket_id = $1 ORDER BY created_at ASC;', [ticketId]),
      client.query('SELECT * FROM part_requests WHERE ticket_id = $1 ORDER BY created_at ASC;', [ticketId])
    ]);

    return {
      id: ticketRow.id,
      cloudReportId: ticketRow.cloud_report_id,
      trackingToken: ticketRow.tracking_token,
      integrationMachineId: ticketRow.integration_machine_id,
      publicQrToken: ticketRow.public_qr_token,
      category: ticketRow.category,
      description: ticketRow.description,
      reporterName: ticketRow.reporter_name || '',
      reporterPhone: ticketRow.reporter_phone || '',
      reporterEmail: ticketRow.reporter_email || '',
      status: ticketRow.status,
      syncStatus: ticketRow.sync_status,
      resolutionSummary: ticketRow.resolution_summary || undefined,
      createdAt: toIsoDate(ticketRow.created_at),
      updatedAt: toIsoDate(ticketRow.updated_at),
      checkins: checkinsRes.rows.map(r => ({
        id: r.id,
        ticketId: r.ticket_id,
        technicianId: r.technician_id,
        technicianName: r.technician_name,
        timestamp: toIsoDate(r.created_at || r.timestamp),
        latitude: r.latitude !== null && r.latitude !== undefined ? Number(r.latitude) : null,
        longitude: r.longitude !== null && r.longitude !== undefined ? Number(r.longitude) : null,
        accuracyMeters: r.accuracy_meters !== null && r.accuracy_meters !== undefined ? Number(r.accuracy_meters) : null,
        distanceMeters: r.distance_meters !== null && r.distance_meters !== undefined ? Number(r.distance_meters) : null,
        verified: r.verified,
        status: r.status,
        fieldExceptionId: r.field_exception_id || (r.manual_exception?.approvalId) || undefined,
        manualException: r.manual_exception || undefined
      })),
      actions: actionsRes.rows.map(r => ({
        id: r.id,
        ticketId: r.ticket_id,
        technicianId: r.technician_id,
        technicianName: r.technician_name,
        actionType: r.action_type,
        description: r.description,
        timestamp: toIsoDate(r.created_at || r.timestamp)
      })),
      evidence: evidenceRes.rows.map(r => ({
        id: r.id,
        ticketId: r.ticket_id,
        technicianId: r.technician_id,
        technicianName: r.technician_name,
        objectKey: r.object_key,
        url: r.url,
        mimeType: r.mime_type,
        sizeBytes: Number(r.size_bytes),
        sha256: r.sha256,
        caption: r.caption || '',
        timestamp: toIsoDate(r.created_at || r.timestamp)
      })),
      functionalTests: testsRes.rows.map(r => ({
        id: r.id,
        ticketId: r.ticket_id,
        technicianId: r.technician_id,
        technicianName: r.technician_name,
        testType: r.test_type,
        passed: r.passed,
        notes: r.notes || '',
        timestamp: toIsoDate(r.created_at || r.timestamp)
      })),
      partRequests: partReqsRes.rows.map(r => ({
        id: r.id,
        ticketId: r.ticket_id,
        technicianId: r.technician_id,
        technicianName: r.technician_name,
        partId: r.part_id || undefined,
        partName: r.part_name,
        quantityRequested: r.quantity_requested,
        reason: r.reason,
        status: r.status,
        timestamp: toIsoDate(r.created_at || r.timestamp)
      }))
    };
  }

  async findById(id: string): Promise<CloudTicket | null> {
    const res = await this.pool.query('SELECT * FROM cloud_tickets WHERE id = $1 LIMIT 1;', [id]);
    if (res.rows.length === 0) return null;
    return this.populateTicketDetails(this.pool, res.rows[0]);
  }

  async findByReportId(reportId: string): Promise<CloudTicket | null> {
    const res = await this.pool.query('SELECT * FROM cloud_tickets WHERE cloud_report_id = $1 LIMIT 1;', [reportId]);
    if (res.rows.length === 0) return null;
    return this.populateTicketDetails(this.pool, res.rows[0]);
  }

  async findByTrackingToken(token: string): Promise<CloudTicket | null> {
    if (!token) return null;
    const clean = token.trim().toUpperCase();
    const res = await this.pool.query('SELECT * FROM cloud_tickets WHERE UPPER(tracking_token) = $1 LIMIT 1;', [clean]);
    if (res.rows.length === 0) return null;
    return this.populateTicketDetails(this.pool, res.rows[0]);
  }

  async createTicket(ticket: CloudTicket): Promise<CloudTicket> {
    const insertQuery = `
      INSERT INTO cloud_tickets (
        id, cloud_report_id, tracking_token, integration_machine_id, public_qr_token,
        category, description, reporter_name, reporter_phone, reporter_email,
        status, sync_status, resolution_summary, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *;
    `;
    const res = await this.pool.query(insertQuery, [
      ticket.id,
      ticket.cloudReportId,
      ticket.trackingToken,
      ticket.integrationMachineId,
      ticket.publicQrToken,
      ticket.category,
      ticket.description,
      ticket.reporterName || '',
      ticket.reporterPhone || '',
      ticket.reporterEmail || '',
      ticket.status,
      ticket.syncStatus,
      ticket.resolutionSummary || null
    ]);

    return this.populateTicketDetails(this.pool, res.rows[0]);
  }

  async addCheckin(checkin: CloudCheckinRecord): Promise<void> {
    const query = `
      INSERT INTO technician_checkins (
        id, ticket_id, technician_id, technician_name,
        latitude, longitude, accuracy_meters, distance_meters,
        verified, status, field_exception_id, manual_exception, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP);
    `;
    await this.pool.query(query, [
      checkin.id,
      checkin.ticketId,
      checkin.technicianId,
      checkin.technicianName,
      checkin.latitude !== null && checkin.latitude !== undefined ? checkin.latitude : null,
      checkin.longitude !== null && checkin.longitude !== undefined ? checkin.longitude : null,
      checkin.accuracyMeters !== null && checkin.accuracyMeters !== undefined ? checkin.accuracyMeters : null,
      checkin.distanceMeters !== null && checkin.distanceMeters !== undefined ? checkin.distanceMeters : null,
      checkin.verified,
      checkin.status,
      checkin.fieldExceptionId || checkin.exceptionApprovalId || null,
      checkin.manualException ? JSON.stringify(checkin.manualException) : null
    ]);
  }

  async addAction(action: CloudActionRecord): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO ticket_actions (id, ticket_id, technician_id, technician_name, action_type, description, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP);
      `, [action.id, action.ticketId, action.technicianId, action.technicianName, action.actionType, action.description]);

      await client.query(`
        UPDATE cloud_tickets SET status = 'IN_PROGRESS', updated_at = CURRENT_TIMESTAMP WHERE id = $1;
      `, [action.ticketId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async addEvidence(evidence: CloudEvidenceRecord): Promise<void> {
    const query = `
      INSERT INTO ticket_evidence (id, ticket_id, technician_id, technician_name, object_key, url, mime_type, size_bytes, sha256, caption, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP);
    `;
    await this.pool.query(query, [
      evidence.id,
      evidence.ticketId,
      evidence.technicianId,
      evidence.technicianName,
      evidence.objectKey,
      evidence.url,
      evidence.mimeType,
      evidence.sizeBytes,
      evidence.sha256,
      evidence.caption || ''
    ]);
  }

  async addFunctionalTest(test: CloudFunctionalTestRecord): Promise<void> {
    const query = `
      INSERT INTO functional_tests (id, ticket_id, technician_id, technician_name, test_type, passed, notes, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP);
    `;
    await this.pool.query(query, [
      test.id,
      test.ticketId,
      test.technicianId,
      test.technicianName,
      test.testType,
      test.passed,
      test.notes || ''
    ]);
  }

  async addPartRequest(request: CloudPartRequestRecord): Promise<void> {
    const query = `
      INSERT INTO part_requests (id, ticket_id, technician_id, technician_name, part_id, part_name, quantity_requested, reason, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP);
    `;
    await this.pool.query(query, [
      request.id,
      request.ticketId,
      request.technicianId,
      request.technicianName,
      request.partId || null,
      request.partName,
      request.quantityRequested,
      request.reason,
      request.status
    ]);
  }

  async updateTicketStatus(ticketId: string, status: CloudTicket['status'], resolutionSummary?: string): Promise<void> {
    if (resolutionSummary) {
      await this.pool.query(
        'UPDATE cloud_tickets SET status = $1, resolution_summary = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3;',
        [status, resolutionSummary, ticketId]
      );
    } else {
      await this.pool.query(
        'UPDATE cloud_tickets SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;',
        [status, ticketId]
      );
    }
  }

  async count(): Promise<number> {
    const res = await this.pool.query('SELECT COUNT(*) as cnt FROM cloud_tickets;');
    return parseInt(res.rows[0].cnt, 10);
  }
}

export class PostgresTechnicianRepository implements ITechnicianRepository {
  constructor(private pool: Pool) {}

  async findByEmployeeCode(code: string): Promise<CloudTechnicianAccount | null> {
    const clean = code.trim().toUpperCase();
    const res = await this.pool.query(
      'SELECT * FROM technician_accounts WHERE UPPER(employee_code) = $1 OR UPPER(email) = $1 OR id = $2 LIMIT 1;',
      [clean, code.trim()]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      employeeCode: r.employee_code,
      fullName: r.full_name,
      email: r.email,
      phone: r.phone || undefined,
      passwordHash: r.password_hash,
      status: r.status,
      specialization: r.specialization || undefined
    };
  }

  async findById(id: string): Promise<CloudTechnicianAccount | null> {
    const res = await this.pool.query('SELECT * FROM technician_accounts WHERE id = $1 LIMIT 1;', [id]);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      employeeCode: r.employee_code,
      fullName: r.full_name,
      email: r.email,
      phone: r.phone || undefined,
      passwordHash: r.password_hash,
      status: r.status,
      specialization: r.specialization || undefined
    };
  }

  async saveTechnician(account: CloudTechnicianAccount): Promise<void> {
    const query = `
      INSERT INTO technician_accounts (id, employee_code, full_name, email, phone, password_hash, status, specialization, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        employee_code = EXCLUDED.employee_code,
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        password_hash = EXCLUDED.password_hash,
        status = EXCLUDED.status,
        specialization = EXCLUDED.specialization;
    `;
    await this.pool.query(query, [
      account.id,
      account.employeeCode,
      account.fullName,
      account.email,
      account.phone || null,
      account.passwordHash,
      account.status,
      account.specialization || null
    ]);
  }

  async count(): Promise<number> {
    const res = await this.pool.query('SELECT COUNT(*) as cnt FROM technician_accounts;');
    return parseInt(res.rows[0].cnt, 10);
  }
}

export class PostgresSessionRepository implements ISessionRepository {
  constructor(private pool: Pool) {}

  async createSession(session: CloudTechnicianSession): Promise<void> {
    const query = `
      INSERT INTO technician_sessions (session_id, token_hash, technician_id, employee_code, full_name, created_at, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (session_id) DO UPDATE SET
        token_hash = EXCLUDED.token_hash,
        expires_at = EXCLUDED.expires_at;
    `;
    await this.pool.query(query, [
      session.sessionId,
      session.tokenHash,
      session.technicianId,
      session.employeeCode,
      session.fullName,
      session.createdAt,
      session.expiresAt
    ]);
  }

  async findSessionByTokenHash(tokenHash: string): Promise<CloudTechnicianSession | null> {
    const res = await this.pool.query(
      'SELECT * FROM technician_sessions WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP LIMIT 1;',
      [tokenHash]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      sessionId: r.session_id,
      tokenHash: r.token_hash,
      technicianId: r.technician_id,
      employeeCode: r.employee_code,
      fullName: r.full_name,
      createdAt: r.created_at.toISOString(),
      expiresAt: r.expires_at.toISOString()
    };
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.pool.query('DELETE FROM technician_sessions WHERE session_id = $1;', [sessionId]);
  }

  async deleteExpiredSessions(): Promise<number> {
    const res = await this.pool.query('DELETE FROM technician_sessions WHERE expires_at <= CURRENT_TIMESTAMP;');
    return res.rowCount || 0;
  }

  async countActive(): Promise<number> {
    const res = await this.pool.query('SELECT COUNT(*) as cnt FROM technician_sessions WHERE expires_at > CURRENT_TIMESTAMP;');
    return parseInt(res.rows[0].cnt, 10);
  }
}

export class PostgresSyncEventRepository implements ISyncEventRepository {
  constructor(private pool: Pool) {}

  async pushEvent(eventType: CloudSyncEventType, entityId: string, payload: any, version = 1): Promise<CloudSyncEvent> {
    const eventId = `cld-evt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const insertQuery = `
      INSERT INTO sync_events (event_id, event_type, entity_id, version, payload, status, created_at)
      VALUES ($1, $2, $3, $4, $5, 'PENDING', CURRENT_TIMESTAMP)
      RETURNING cursor, created_at;
    `;
    const res = await this.pool.query(insertQuery, [
      eventId,
      eventType,
      entityId,
      version,
      JSON.stringify(payload)
    ]);
    const r = res.rows[0];
    return {
      cursor: Number(r.cursor),
      eventId,
      eventType,
      createdAt: r.created_at.toISOString(),
      entityId,
      version,
      payload,
      status: 'PENDING',
      acknowledgedAt: null
    };
  }

  async getEventsAfter(cursor: number, limit = 50): Promise<{ events: CloudSyncEvent[]; nextCursor: number; hasMore: boolean }> {
    const query = `
      SELECT cursor, event_id, event_type, entity_id, version, payload, status, acknowledged_at, created_at
      FROM sync_events
      WHERE cursor > $1
      ORDER BY cursor ASC
      LIMIT $2;
    `;
    const res = await this.pool.query(query, [cursor, limit + 1]);
    const hasMore = res.rows.length > limit;
    const rows = hasMore ? res.rows.slice(0, limit) : res.rows;
    const events: CloudSyncEvent[] = rows.map(r => ({
      cursor: Number(r.cursor),
      eventId: r.event_id,
      eventType: r.event_type as CloudSyncEventType,
      createdAt: r.created_at.toISOString(),
      entityId: r.entity_id,
      version: r.version,
      payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
      status: r.status,
      acknowledgedAt: r.acknowledged_at ? r.acknowledged_at.toISOString() : null
    }));

    const nextCursor = events.length > 0 ? events[events.length - 1].cursor : cursor;
    return { events, nextCursor, hasMore };
  }

  async acknowledgeEvents(eventIds: string[]): Promise<{ acknowledgedCount: number }> {
    if (!eventIds || eventIds.length === 0) return { acknowledgedCount: 0 };
    const query = `
      UPDATE sync_events
      SET status = 'ACKNOWLEDGED', acknowledged_at = CURRENT_TIMESTAMP
      WHERE event_id = ANY($1::text[]) AND status != 'ACKNOWLEDGED';
    `;
    const res = await this.pool.query(query, [eventIds]);
    return { acknowledgedCount: res.rowCount || 0 };
  }

  async count(): Promise<number> {
    const res = await this.pool.query('SELECT COUNT(*) as cnt FROM sync_events;');
    return parseInt(res.rows[0].cnt, 10);
  }

  async countPending(): Promise<number> {
    const res = await this.pool.query("SELECT COUNT(*) as cnt FROM sync_events WHERE status = 'PENDING';");
    return parseInt(res.rows[0].cnt, 10);
  }
}

export class PostgresAuditRepository implements IAuditRepository {
  constructor(private pool: Pool) {}

  async log(event: {
    actorType: 'CUSTOMER' | 'TECHNICIAN' | 'DESKTOP_SYNC' | 'SYSTEM' | 'ANONYMOUS';
    actorId: string;
    actorName: string;
    action: string;
    entity: string;
    result: 'SUCCESS' | 'FAILURE' | 'BLOCKED';
    details: any;
    ip?: string;
  }): Promise<void> {
    const id = `cld-adt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const query = `
      INSERT INTO audit_events (id, actor_type, actor_id, actor_name, action, entity, result, details, ip, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP);
    `;
    await this.pool.query(query, [
      id,
      event.actorType,
      event.actorId,
      event.actorName,
      event.action,
      event.entity,
      event.result,
      event.details ? JSON.stringify(event.details) : null,
      event.ip || null
    ]);
  }
}

export class PostgresIdempotencyRepository implements IIdempotencyRepository {
  constructor(private pool: Pool) {}

  async get(key: string): Promise<any | null> {
    const res = await this.pool.query('SELECT response_payload FROM idempotency_keys WHERE idempotency_key = $1 LIMIT 1;', [key]);
    if (res.rows.length === 0) return null;
    const val = res.rows[0].response_payload;
    return typeof val === 'string' ? JSON.parse(val) : val;
  }

  async set(key: string, response: any): Promise<void> {
    const query = `
      INSERT INTO idempotency_keys (idempotency_key, response_payload, created_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (idempotency_key) DO UPDATE SET
        response_payload = EXCLUDED.response_payload,
        created_at = CURRENT_TIMESTAMP;
    `;
    await this.pool.query(query, [key, JSON.stringify(response)]);
  }
}

export class PostgresMachineLocationProposalRepository implements IMachineLocationProposalRepository {
  constructor(private pool: Pool) {}

  async submitProposal(proposal: MachineLocationProposal): Promise<MachineLocationProposal> {
    const query = `
      INSERT INTO machine_location_proposals (
        id, integration_machine_id, public_qr_token, ticket_id,
        technician_id, technician_name, latitude, longitude,
        accuracy_meters, captured_at, status, submitted_ip,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *;
    `;
    const res = await this.pool.query(query, [
      proposal.id,
      proposal.integrationMachineId,
      proposal.publicQrToken,
      proposal.ticketId || null,
      proposal.technicianId,
      proposal.technicianName,
      proposal.latitude,
      proposal.longitude,
      proposal.accuracyMeters,
      proposal.capturedAt,
      proposal.status || 'PENDING',
      proposal.submittedIp || null
    ]);
    return this.mapRowToProposal(res.rows[0]);
  }

  async findById(id: string): Promise<MachineLocationProposal | null> {
    const res = await this.pool.query(
      'SELECT * FROM machine_location_proposals WHERE id = $1 LIMIT 1;',
      [id]
    );
    if (res.rows.length === 0) return null;
    return this.mapRowToProposal(res.rows[0]);
  }

  async findPendingByMachineId(machineId: string): Promise<MachineLocationProposal[]> {
    const res = await this.pool.query(
      'SELECT * FROM machine_location_proposals WHERE integration_machine_id = $1 AND status = $2 ORDER BY created_at DESC;',
      [machineId, 'PENDING']
    );
    return res.rows.map(r => this.mapRowToProposal(r));
  }

  async listPending(limit = 50): Promise<MachineLocationProposal[]> {
    const res = await this.pool.query(
      'SELECT * FROM machine_location_proposals WHERE status = $1 ORDER BY created_at DESC LIMIT $2;',
      ['PENDING', limit]
    );
    return res.rows.map(r => this.mapRowToProposal(r));
  }

  async approveProposal(
    proposalId: string,
    approver: { id: string; name: string }
  ): Promise<{ proposal: MachineLocationProposal; machine: SanitizedCloudMachine }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const propRes = await client.query(
        'SELECT * FROM machine_location_proposals WHERE id = $1 FOR UPDATE;',
        [proposalId]
      );
      if (propRes.rows.length === 0) {
        throw new Error(`PROPOSAL_NOT_FOUND: مقترح الموقع رقم ${proposalId} غير موجود.`);
      }
      const proposal = this.mapRowToProposal(propRes.rows[0]);
      if (proposal.status !== 'PENDING') {
        throw new Error(`PROPOSAL_NOT_PENDING: لا يمكن اعتماد المقترح لأن حالته الحالية هي: ${proposal.status}`);
      }

      // Update machine coordinates transactionally
      const machineUpdateRes = await client.query(
        `UPDATE cloud_machines
         SET latitude = $1,
             longitude = $2,
             location_source = 'TECHNICIAN_PROPOSAL_APPROVED',
             location_updated_at = CURRENT_TIMESTAMP,
             location_updated_by_actor_id = $3,
             location_updated_by_actor_name = $4,
             version = version + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE integration_machine_id = $5
         RETURNING *;`,
        [proposal.latitude, proposal.longitude, approver.id, approver.name, proposal.integrationMachineId]
      );
      if (machineUpdateRes.rows.length === 0) {
        throw new Error(`MACHINE_NOT_FOUND: الماكينة ${proposal.integrationMachineId} غير موجودة في قاعدة البيانات.`);
      }

      // Mark proposal APPROVED
      const updatePropRes = await client.query(
        `UPDATE machine_location_proposals
         SET status = 'APPROVED',
             approved_by_actor_id = $1,
             approved_by_actor_name = $2,
             approved_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING *;`,
        [approver.id, approver.name, proposalId]
      );

      // Mark any other pending proposals for this machine as SUPERSEDED
      await client.query(
        `UPDATE machine_location_proposals
         SET status = 'SUPERSEDED',
             updated_at = CURRENT_TIMESTAMP
         WHERE integration_machine_id = $1 AND id != $2 AND status = 'PENDING';`,
        [proposal.integrationMachineId, proposalId]
      );

      await client.query('COMMIT');

      const updatedProp = this.mapRowToProposal(updatePropRes.rows[0]);
      const updatedMachine = mapMachineRow(machineUpdateRes.rows[0]);
      return { proposal: updatedProp, machine: updatedMachine };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async rejectProposal(
    proposalId: string,
    actor: { id: string; name: string },
    reason?: string
  ): Promise<MachineLocationProposal> {
    const res = await this.pool.query(
      `UPDATE machine_location_proposals
       SET status = 'REJECTED',
           rejected_by_actor_id = $1,
           rejected_by_actor_name = $2,
           rejected_at = CURRENT_TIMESTAMP,
           rejection_reason = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND status = 'PENDING'
       RETURNING *;`,
      [actor.id, actor.name, reason || 'Rejected by management', proposalId]
    );
    if (res.rows.length === 0) {
      const existing = await this.findById(proposalId);
      if (!existing) throw new Error(`PROPOSAL_NOT_FOUND: المقترح غير موجود.`);
      throw new Error(`PROPOSAL_NOT_PENDING: لا يمكن رفض المقترح لأن حالته: ${existing.status}`);
    }
    return this.mapRowToProposal(res.rows[0]);
  }

  async countPending(): Promise<number> {
    const res = await this.pool.query(
      "SELECT COUNT(*) as cnt FROM machine_location_proposals WHERE status = 'PENDING';"
    );
    return parseInt(res.rows[0].cnt, 10);
  }

  private mapRowToProposal(r: any): MachineLocationProposal {
    return {
      id: r.id,
      integrationMachineId: r.integration_machine_id,
      publicQrToken: r.public_qr_token,
      ticketId: r.ticket_id || null,
      technicianId: r.technician_id,
      technicianName: r.technician_name,
      latitude: parseFloat(r.latitude),
      longitude: parseFloat(r.longitude),
      accuracyMeters: parseFloat(r.accuracy_meters),
      capturedAt: toIsoDate(r.captured_at),
      status: r.status,
      submittedIp: r.submitted_ip || null,
      approvedByActorId: r.approved_by_actor_id || null,
      approvedByActorName: r.approved_by_actor_name || null,
      approvedAt: r.approved_at ? toIsoDate(r.approved_at) : null,
      rejectedByActorId: r.rejected_by_actor_id || null,
      rejectedByActorName: r.rejected_by_actor_name || null,
      rejectedAt: r.rejected_at ? toIsoDate(r.rejected_at) : null,
      rejectionReason: r.rejection_reason || null,
      createdAt: toIsoDate(r.created_at),
      updatedAt: toIsoDate(r.updated_at)
    };
  }
}

export class PostgresFieldExceptionApprovalRepository implements IFieldExceptionApprovalRepository {
  constructor(private pool: Pool) {}

  async createApproval(approval: FieldExceptionApproval): Promise<FieldExceptionApproval> {
    const query = `
      INSERT INTO field_exception_approvals (
        id, ticket_id, integration_machine_id, technician_id,
        reason, status, approved_by_actor_id, approved_by_actor_name,
        approved_at, expires_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *;
    `;
    const res = await this.pool.query(query, [
      approval.id,
      approval.ticketId,
      approval.integrationMachineId,
      approval.technicianId || null,
      approval.reason,
      approval.status || 'APPROVED',
      approval.approvedByActorId,
      approval.approvedByActorName,
      approval.approvedAt || new Date().toISOString(),
      approval.expiresAt || null
    ]);
    return this.mapRow(res.rows[0]);
  }

  async findById(id: string): Promise<FieldExceptionApproval | null> {
    const res = await this.pool.query(
      'SELECT * FROM field_exception_approvals WHERE id = $1 LIMIT 1;',
      [id]
    );
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  async findValidForTicketMachineAndTechnician(
    ticketId: string,
    machineId: string,
    technicianId?: string | null
  ): Promise<FieldExceptionApproval | null> {
    const cleanTech = technicianId ? technicianId.trim() : null;
    let query: string;
    let params: any[];

    if (cleanTech) {
      query = `
        SELECT * FROM field_exception_approvals
        WHERE ticket_id = $1
          AND integration_machine_id = $2
          AND status = 'APPROVED'
          AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
          AND (technician_id IS NULL OR technician_id = $3)
        ORDER BY created_at DESC
        LIMIT 1;
      `;
      params = [ticketId, machineId, cleanTech];
    } else {
      query = `
        SELECT * FROM field_exception_approvals
        WHERE ticket_id = $1
          AND integration_machine_id = $2
          AND status = 'APPROVED'
          AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
          AND technician_id IS NULL
        ORDER BY created_at DESC
        LIMIT 1;
      `;
      params = [ticketId, machineId];
    }

    const res = await this.pool.query(query, params);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  async findValidForTicketAndMachine(ticketId: string, machineId: string): Promise<FieldExceptionApproval | null> {
    return this.findValidForTicketMachineAndTechnician(ticketId, machineId, null);
  }

  async consumeApproval(id: string): Promise<FieldExceptionApproval> {
    const res = await this.pool.query(
      `UPDATE field_exception_approvals
       SET status = 'USED',
           used_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'APPROVED' AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
       RETURNING *;`,
      [id]
    );
    if (res.rows.length === 0) {
      const existing = await this.findById(id);
      if (!existing) {
        throw new Error('EXCEPTION_APPROVAL_NOT_FOUND: تصريح الاستثناء غير موجود.');
      }
      if (existing.expiresAt && new Date(existing.expiresAt).getTime() <= Date.now()) {
        throw new Error('EXCEPTION_APPROVAL_EXPIRED: تصريح الاستثناء منتهي الصلاحية.');
      }
      throw new Error(`EXCEPTION_APPROVAL_INVALID: لا يمكن استخدام التصريح لأن حالته الحالية: ${existing.status}`);
    }
    return this.mapRow(res.rows[0]);
  }

  private mapRow(r: any): FieldExceptionApproval {
    return {
      id: r.id,
      ticketId: r.ticket_id,
      integrationMachineId: r.integration_machine_id,
      technicianId: r.technician_id,
      reason: r.reason,
      status: r.status,
      approvedByActorId: r.approved_by_actor_id,
      approvedByActorName: r.approved_by_actor_name,
      approvedAt: toIsoDate(r.approved_at),
      expiresAt: r.expires_at ? toIsoDate(r.expires_at) : null,
      usedAt: r.used_at ? toIsoDate(r.used_at) : null,
      createdAt: toIsoDate(r.created_at),
      updatedAt: toIsoDate(r.updated_at)
    };
  }
}

export class PostgresCloudRepositoryManager implements ICloudRepositoryManager {
  public providerType: 'POSTGRES' = 'POSTGRES';
  public machines: ICloudMachineRepository;
  public tickets: ICloudTicketRepository;
  public locationProposals: IMachineLocationProposalRepository;
  public fieldExceptions: IFieldExceptionApprovalRepository;
  public technicians: ITechnicianRepository;
  public sessions: ISessionRepository;
  public syncEvents: ISyncEventRepository;
  public audit: IAuditRepository;
  public idempotency: IIdempotencyRepository;

  constructor(private pool: Pool) {
    this.machines = new PostgresCloudMachineRepository(pool);
    this.tickets = new PostgresCloudTicketRepository(pool);
    this.locationProposals = new PostgresMachineLocationProposalRepository(pool);
    this.fieldExceptions = new PostgresFieldExceptionApprovalRepository(pool);
    this.technicians = new PostgresTechnicianRepository(pool);
    this.sessions = new PostgresSessionRepository(pool);
    this.syncEvents = new PostgresSyncEventRepository(pool);
    this.audit = new PostgresAuditRepository(pool);
    this.idempotency = new PostgresIdempotencyRepository(pool);
  }

  async checkHealth(): Promise<{ healthy: boolean; details?: any }> {
    try {
      const start = Date.now();
      const res = await this.pool.query('SELECT 1 as alive, NOW() as server_time;');
      const latencyMs = Date.now() - start;
      const countRes = await this.pool.query('SELECT COUNT(*) as cnt FROM cloud_machines;');
      return {
        healthy: res.rows.length > 0,
        details: {
          provider: 'POSTGRESQL',
          latencyMs,
          serverTime: res.rows[0].server_time,
          machineCount: parseInt(countRes.rows[0].cnt, 10)
        }
      };
    } catch (err: any) {
      return {
        healthy: false,
        details: {
          provider: 'POSTGRESQL',
          error: 'DATABASE_PING_FAILED' // Do not leak credentials or connection string
        }
      };
    }
  }
}

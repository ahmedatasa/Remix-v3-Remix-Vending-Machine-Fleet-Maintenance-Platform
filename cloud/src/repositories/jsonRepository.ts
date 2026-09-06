import {
  ICloudRepositoryManager,
  ICloudMachineRepository,
  ICloudTicketRepository,
  ITechnicianRepository,
  ISessionRepository,
  ISyncEventRepository,
  IAuditRepository,
  IIdempotencyRepository
} from './interfaces';
import {
  cloudDb,
  CloudDatabase,
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
  CloudSyncEventType
} from '../db/cloudDb';

export class JsonCloudMachineRepository implements ICloudMachineRepository {
  constructor(private db: CloudDatabase) {}

  async findByQrToken(token: string): Promise<SanitizedCloudMachine | null> {
    return this.db.findMachineByQrToken(token);
  }

  async findByIntegrationId(id: string): Promise<SanitizedCloudMachine | null> {
    return this.db.findMachineByIntegrationId(id);
  }

  async bootstrapRegistry(machines: SanitizedCloudMachine[]): Promise<{ updated: number; total: number }> {
    return this.db.bootstrapMachineRegistry(machines);
  }

  async upsertMachine(machine: SanitizedCloudMachine): Promise<void> {
    this.db.bootstrapMachineRegistry([machine]);
  }

  async removeMachine(idOrToken: string): Promise<boolean> {
    return this.db.removeMachine(idOrToken);
  }

  async count(): Promise<number> {
    return this.db.getData().cloud_machine_registry.length;
  }
}

export class JsonCloudTicketRepository implements ICloudTicketRepository {
  constructor(private db: CloudDatabase) {}

  async findById(id: string): Promise<CloudTicket | null> {
    return this.db.findTicketById(id);
  }

  async findByReportId(reportId: string): Promise<CloudTicket | null> {
    return this.db.findTicketByReportId(reportId);
  }

  async findByTrackingToken(token: string): Promise<CloudTicket | null> {
    return this.db.findTicketByTrackingToken(token);
  }

  async createTicket(ticket: CloudTicket): Promise<CloudTicket> {
    this.db.insertTicket(ticket);
    return ticket;
  }

  async addCheckin(checkin: CloudCheckinRecord): Promise<void> {
    const ticket = this.db.findTicketById(checkin.ticketId);
    if (ticket) {
      ticket.checkins = ticket.checkins || [];
      ticket.checkins.push(checkin);
      ticket.updatedAt = new Date().toISOString();
      this.db.save();
    }
  }

  async addAction(action: CloudActionRecord): Promise<void> {
    const ticket = this.db.findTicketById(action.ticketId);
    if (ticket) {
      ticket.actions = ticket.actions || [];
      ticket.actions.push(action);
      ticket.status = 'IN_PROGRESS';
      ticket.updatedAt = new Date().toISOString();
      this.db.save();
    }
  }

  async addEvidence(evidence: CloudEvidenceRecord): Promise<void> {
    const ticket = this.db.findTicketById(evidence.ticketId);
    if (ticket) {
      ticket.evidence = ticket.evidence || [];
      ticket.evidence.push(evidence);
      ticket.updatedAt = new Date().toISOString();
      this.db.save();
    }
  }

  async addFunctionalTest(test: CloudFunctionalTestRecord): Promise<void> {
    const ticket = this.db.findTicketById(test.ticketId);
    if (ticket) {
      ticket.functionalTests = ticket.functionalTests || [];
      ticket.functionalTests.push(test);
      ticket.updatedAt = new Date().toISOString();
      this.db.save();
    }
  }

  async addPartRequest(request: CloudPartRequestRecord): Promise<void> {
    const ticket = this.db.findTicketById(request.ticketId);
    if (ticket) {
      ticket.partRequests = ticket.partRequests || [];
      ticket.partRequests.push(request);
      ticket.updatedAt = new Date().toISOString();
      this.db.save();
    }
  }

  async updateTicketStatus(ticketId: string, status: CloudTicket['status'], resolutionSummary?: string): Promise<void> {
    const ticket = this.db.findTicketById(ticketId);
    if (ticket) {
      ticket.status = status;
      if (resolutionSummary) {
        ticket.resolutionSummary = resolutionSummary;
      }
      ticket.updatedAt = new Date().toISOString();
      this.db.save();
    }
  }
}

export class JsonTechnicianRepository implements ITechnicianRepository {
  constructor(private db: CloudDatabase) {}

  async findByEmployeeCode(code: string): Promise<CloudTechnicianAccount | null> {
    const clean = code.trim().toUpperCase();
    return this.db.getData().technician_accounts.find(t => t.employeeCode.toUpperCase() === clean) || null;
  }

  async findById(id: string): Promise<CloudTechnicianAccount | null> {
    return this.db.getData().technician_accounts.find(t => t.id === id) || null;
  }

  async saveTechnician(account: CloudTechnicianAccount): Promise<void> {
    const existingIdx = this.db.getData().technician_accounts.findIndex(t => t.id === account.id || t.employeeCode === account.employeeCode);
    if (existingIdx >= 0) {
      this.db.getData().technician_accounts[existingIdx] = account;
    } else {
      this.db.getData().technician_accounts.push(account);
    }
    this.db.save();
  }
}

export class JsonSessionRepository implements ISessionRepository {
  constructor(private db: CloudDatabase) {}

  async createSession(session: CloudTechnicianSession): Promise<void> {
    this.db.getData().technician_sessions[session.tokenHash] = session;
    this.db.save();
  }

  async findSessionByTokenHash(tokenHash: string): Promise<CloudTechnicianSession | null> {
    const session = this.db.getData().technician_sessions[tokenHash];
    if (!session) return null;
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      delete this.db.getData().technician_sessions[tokenHash];
      this.db.save();
      return null;
    }
    return session;
  }

  async deleteSession(sessionId: string): Promise<void> {
    const data = this.db.getData();
    for (const [hash, s] of Object.entries(data.technician_sessions)) {
      if (s.sessionId === sessionId) {
        delete data.technician_sessions[hash];
        this.db.save();
        break;
      }
    }
  }

  async deleteExpiredSessions(): Promise<number> {
    const data = this.db.getData();
    const now = Date.now();
    let removed = 0;
    for (const [hash, s] of Object.entries(data.technician_sessions)) {
      if (new Date(s.expiresAt).getTime() < now) {
        delete data.technician_sessions[hash];
        removed++;
      }
    }
    if (removed > 0) this.db.save();
    return removed;
  }
}

export class JsonSyncEventRepository implements ISyncEventRepository {
  constructor(private db: CloudDatabase) {}

  async pushEvent(eventType: CloudSyncEventType, entityId: string, payload: any, version = 1): Promise<CloudSyncEvent> {
    return this.db.pushSyncEvent(eventType, entityId, payload, version);
  }

  async getEventsAfter(cursor: number, limit = 50): Promise<{ events: CloudSyncEvent[]; nextCursor: number; hasMore: boolean }> {
    return this.db.getSyncEventsAfter(cursor, limit);
  }

  async acknowledgeEvents(eventIds: string[]): Promise<{ acknowledgedCount: number }> {
    return this.db.acknowledgeSyncEvents(eventIds);
  }
}

export class JsonAuditRepository implements IAuditRepository {
  constructor(private db: CloudDatabase) {}

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
    this.db.logAudit(
      event.actorType,
      event.actorId,
      event.actorName,
      event.action,
      event.entity,
      event.result,
      event.details,
      event.ip
    );
  }
}

export class JsonIdempotencyRepository implements IIdempotencyRepository {
  constructor(private db: CloudDatabase) {}

  async get(key: string): Promise<any | null> {
    const entry = this.db.getData().idempotency_keys[key];
    return entry ? entry.response : null;
  }

  async set(key: string, response: any): Promise<void> {
    this.db.getData().idempotency_keys[key] = {
      createdAt: new Date().toISOString(),
      response
    };
    this.db.save();
  }
}

export class JsonCloudRepositoryManager implements ICloudRepositoryManager {
  public providerType: 'JSON_DEV' = 'JSON_DEV';
  public machines: ICloudMachineRepository;
  public tickets: ICloudTicketRepository;
  public technicians: ITechnicianRepository;
  public sessions: ISessionRepository;
  public syncEvents: ISyncEventRepository;
  public audit: IAuditRepository;
  public idempotency: IIdempotencyRepository;

  constructor(dbInstance: CloudDatabase = cloudDb) {
    this.machines = new JsonCloudMachineRepository(dbInstance);
    this.tickets = new JsonCloudTicketRepository(dbInstance);
    this.technicians = new JsonTechnicianRepository(dbInstance);
    this.sessions = new JsonSessionRepository(dbInstance);
    this.syncEvents = new JsonSyncEventRepository(dbInstance);
    this.audit = new JsonAuditRepository(dbInstance);
    this.idempotency = new JsonIdempotencyRepository(dbInstance);
  }

  async checkHealth(): Promise<{ healthy: boolean; details?: any }> {
    return {
      healthy: true,
      details: {
        provider: 'JSON_DEVELOPMENT',
        machineCount: await this.machines.count()
      }
    };
  }
}

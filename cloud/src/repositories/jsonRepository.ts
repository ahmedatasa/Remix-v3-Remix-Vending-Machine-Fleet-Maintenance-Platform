import type {
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
import {
  getCloudDb,
  CloudDatabase
} from '../db/cloudDb';
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
    const clean = idOrToken.trim().toUpperCase();
    const machine = this.db.getData().cloud_machine_registry.find(
      m => m.integrationMachineId === idOrToken || (m.publicQrToken && m.publicQrToken.toUpperCase() === clean)
    );
    if (!machine) {
      throw new Error(`MACHINE_NOT_FOUND: الماكينة المطلوبة (${idOrToken}) غير موجودة.`);
    }

    const { latitude, longitude, locationSource, locationNote, actorId, actorName } = params;
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

    machine.latitude = latitude ?? null;
    machine.longitude = longitude ?? null;
    machine.locationSource = locationSource;
    if (locationNote !== undefined) machine.locationNote = locationNote;
    machine.locationUpdatedAt = new Date().toISOString();
    machine.locationUpdatedByActorId = actorId;
    machine.locationUpdatedByActorName = actorName;
    machine.version = (machine.version || 1) + 1;
    this.db.save();
    return { ...machine };
  }

  async clearLocation(
    idOrToken: string,
    actor: { id: string; name: string }
  ): Promise<SanitizedCloudMachine> {
    const clean = idOrToken.trim().toUpperCase();
    const machine = this.db.getData().cloud_machine_registry.find(
      m => m.integrationMachineId === idOrToken || (m.publicQrToken && m.publicQrToken.toUpperCase() === clean)
    );
    if (!machine) {
      throw new Error(`MACHINE_NOT_FOUND: الماكينة المطلوبة (${idOrToken}) غير موجودة.`);
    }

    machine.latitude = null;
    machine.longitude = null;
    machine.locationSource = 'NONE';
    machine.locationNote = undefined;
    machine.locationUpdatedAt = new Date().toISOString();
    machine.locationUpdatedByActorId = actor.id;
    machine.locationUpdatedByActorName = actor.name;
    machine.version = (machine.version || 1) + 1;
    this.db.save();
    return { ...machine };
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

  async count(): Promise<number> {
    return this.db.getData().cloud_tickets.length;
  }
}

export class JsonTechnicianRepository implements ITechnicianRepository {
  constructor(private db: CloudDatabase) {}

  async findByEmployeeCode(code: string): Promise<CloudTechnicianAccount | null> {
    const clean = code.trim().toUpperCase();
    return this.db.getData().technician_accounts.find(t =>
      t.employeeCode.toUpperCase() === clean ||
      (t.email && t.email.toUpperCase() === clean) ||
      t.id === code.trim()
    ) || null;
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

  async count(): Promise<number> {
    return this.db.getData().technician_accounts.length;
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

  async countActive(): Promise<number> {
    const data = this.db.getData();
    const now = Date.now();
    return Object.values(data.technician_sessions).filter(s => new Date(s.expiresAt).getTime() > now).length;
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

  async count(): Promise<number> {
    return this.db.getData().sync_events.length;
  }

  async countPending(): Promise<number> {
    return this.db.getData().sync_events.filter(e => e.status === 'PENDING').length;
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

export class JsonMachineLocationProposalRepository implements IMachineLocationProposalRepository {
  constructor(private db: CloudDatabase) {}

  async submitProposal(proposal: MachineLocationProposal): Promise<MachineLocationProposal> {
    const list = this.db.getData().machine_location_proposals = this.db.getData().machine_location_proposals || [];
    list.unshift(proposal);
    this.db.save();
    return proposal;
  }

  async findById(id: string): Promise<MachineLocationProposal | null> {
    const list = this.db.getData().machine_location_proposals || [];
    return list.find(p => p.id === id) || null;
  }

  async findPendingByMachineId(machineId: string): Promise<MachineLocationProposal[]> {
    const list = this.db.getData().machine_location_proposals || [];
    return list.filter(p => p.integrationMachineId === machineId && p.status === 'PENDING');
  }

  async listPending(limit = 50): Promise<MachineLocationProposal[]> {
    const list = this.db.getData().machine_location_proposals || [];
    return list.filter(p => p.status === 'PENDING').slice(0, limit);
  }

  async approveProposal(
    proposalId: string,
    approver: { id: string; name: string }
  ): Promise<{ proposal: MachineLocationProposal; machine: SanitizedCloudMachine }> {
    const list = this.db.getData().machine_location_proposals || [];
    const proposal = list.find(p => p.id === proposalId);
    if (!proposal) {
      throw new Error(`PROPOSAL_NOT_FOUND: مقترح الموقع رقم ${proposalId} غير موجود.`);
    }
    if (proposal.status !== 'PENDING') {
      throw new Error(`PROPOSAL_NOT_PENDING: لا يمكن اعتماد المقترح لأن حالته الحالية: ${proposal.status}`);
    }

    const machine = this.db.getData().cloud_machine_registry.find(
      m => m.integrationMachineId === proposal.integrationMachineId
    );
    if (!machine) {
      throw new Error(`MACHINE_NOT_FOUND: الماكينة ${proposal.integrationMachineId} غير موجودة.`);
    }

    machine.latitude = proposal.latitude;
    machine.longitude = proposal.longitude;
    machine.locationSource = 'TECHNICIAN_PROPOSAL_APPROVED';
    machine.locationUpdatedAt = new Date().toISOString();
    machine.locationUpdatedByActorId = approver.id;
    machine.locationUpdatedByActorName = approver.name;
    machine.version = (machine.version || 1) + 1;

    proposal.status = 'APPROVED';
    proposal.approvedByActorId = approver.id;
    proposal.approvedByActorName = approver.name;
    proposal.approvedAt = new Date().toISOString();
    proposal.updatedAt = new Date().toISOString();

    for (const other of list) {
      if (other.integrationMachineId === proposal.integrationMachineId && other.id !== proposalId && other.status === 'PENDING') {
        other.status = 'SUPERSEDED';
        other.updatedAt = new Date().toISOString();
      }
    }

    this.db.save();
    return { proposal: { ...proposal }, machine: { ...machine } };
  }

  async rejectProposal(
    proposalId: string,
    actor: { id: string; name: string },
    reason?: string
  ): Promise<MachineLocationProposal> {
    const list = this.db.getData().machine_location_proposals || [];
    const proposal = list.find(p => p.id === proposalId);
    if (!proposal) {
      throw new Error(`PROPOSAL_NOT_FOUND: المقترح غير موجود.`);
    }
    if (proposal.status !== 'PENDING') {
      throw new Error(`PROPOSAL_NOT_PENDING: لا يمكن رفض المقترح لأن حالته: ${proposal.status}`);
    }
    proposal.status = 'REJECTED';
    proposal.rejectedByActorId = actor.id;
    proposal.rejectedByActorName = actor.name;
    proposal.rejectedAt = new Date().toISOString();
    proposal.rejectionReason = reason || 'Rejected by management';
    proposal.updatedAt = new Date().toISOString();
    this.db.save();
    return { ...proposal };
  }

  async countPending(): Promise<number> {
    const list = this.db.getData().machine_location_proposals || [];
    return list.filter(p => p.status === 'PENDING').length;
  }
}

export class JsonFieldExceptionApprovalRepository implements IFieldExceptionApprovalRepository {
  constructor(private db: CloudDatabase) {}

  async createApproval(approval: FieldExceptionApproval): Promise<FieldExceptionApproval> {
    const list = this.db.getData().field_exception_approvals = this.db.getData().field_exception_approvals || [];
    list.unshift(approval);
    this.db.save();
    return approval;
  }

  async findById(id: string): Promise<FieldExceptionApproval | null> {
    const list = this.db.getData().field_exception_approvals || [];
    return list.find(a => a.id === id) || null;
  }

  async findValidForTicketAndMachine(ticketId: string, machineId: string): Promise<FieldExceptionApproval | null> {
    const list = this.db.getData().field_exception_approvals || [];
    const now = new Date().getTime();
    return list.find(a =>
      a.ticketId === ticketId &&
      a.integrationMachineId === machineId &&
      a.status === 'APPROVED' &&
      (!a.expiresAt || new Date(a.expiresAt).getTime() > now)
    ) || null;
  }

  async consumeApproval(id: string): Promise<FieldExceptionApproval> {
    const list = this.db.getData().field_exception_approvals || [];
    const approval = list.find(a => a.id === id);
    if (!approval) {
      throw new Error('EXCEPTION_APPROVAL_NOT_FOUND: تصريح الاستثناء غير موجود.');
    }
    if (approval.status !== 'APPROVED') {
      throw new Error(`EXCEPTION_APPROVAL_INVALID: لا يمكن استخدام التصريح لأن حالته الحالية: ${approval.status}`);
    }
    approval.status = 'USED';
    approval.usedAt = new Date().toISOString();
    approval.updatedAt = new Date().toISOString();
    this.db.save();
    return { ...approval };
  }
}

export class JsonCloudRepositoryManager implements ICloudRepositoryManager {
  public providerType: 'JSON_DEV' = 'JSON_DEV';
  public machines: ICloudMachineRepository;
  public tickets: ICloudTicketRepository;
  public locationProposals: IMachineLocationProposalRepository;
  public fieldExceptions: IFieldExceptionApprovalRepository;
  public technicians: ITechnicianRepository;
  public sessions: ISessionRepository;
  public syncEvents: ISyncEventRepository;
  public audit: IAuditRepository;
  public idempotency: IIdempotencyRepository;

  constructor(dbInstance?: CloudDatabase) {
    const db = dbInstance || getCloudDb();
    this.machines = new JsonCloudMachineRepository(db);
    this.tickets = new JsonCloudTicketRepository(db);
    this.locationProposals = new JsonMachineLocationProposalRepository(db);
    this.fieldExceptions = new JsonFieldExceptionApprovalRepository(db);
    this.technicians = new JsonTechnicianRepository(db);
    this.sessions = new JsonSessionRepository(db);
    this.syncEvents = new JsonSyncEventRepository(db);
    this.audit = new JsonAuditRepository(db);
    this.idempotency = new JsonIdempotencyRepository(db);
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

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
  CloudAuditEvent,
  MachineLocationProposal,
  FieldExceptionApproval,
  LocationSource
} from '../db/cloudDb';

export interface ICloudMachineRepository {
  findByQrToken(token: string): Promise<SanitizedCloudMachine | null>;
  findByIntegrationId(id: string): Promise<SanitizedCloudMachine | null>;
  bootstrapRegistry(machines: SanitizedCloudMachine[]): Promise<{ updated: number; total: number }>;
  upsertMachine(machine: SanitizedCloudMachine): Promise<void>;
  updateLocation(
    idOrToken: string,
    params: {
      latitude: number | null;
      longitude: number | null;
      locationSource: LocationSource;
      locationNote?: string;
      actorId: string;
      actorName: string;
    }
  ): Promise<SanitizedCloudMachine>;
  clearLocation(
    idOrToken: string,
    actor: { id: string; name: string }
  ): Promise<SanitizedCloudMachine>;
  removeMachine(idOrToken: string): Promise<boolean>;
  count(): Promise<number>;
}

export interface ICloudTicketRepository {
  findById(id: string): Promise<CloudTicket | null>;
  findByReportId(reportId: string): Promise<CloudTicket | null>;
  findByTrackingToken(token: string): Promise<CloudTicket | null>;
  createTicket(ticket: CloudTicket): Promise<CloudTicket>;
  addCheckin(checkin: CloudCheckinRecord): Promise<void>;
  addAction(action: CloudActionRecord): Promise<void>;
  addEvidence(evidence: CloudEvidenceRecord): Promise<void>;
  addFunctionalTest(test: CloudFunctionalTestRecord): Promise<void>;
  addPartRequest(request: CloudPartRequestRecord): Promise<void>;
  updateTicketStatus(ticketId: string, status: CloudTicket['status'], resolutionSummary?: string): Promise<void>;
  count(): Promise<number>;
}

export interface IMachineLocationProposalRepository {
  submitProposal(proposal: MachineLocationProposal): Promise<MachineLocationProposal>;
  findById(id: string): Promise<MachineLocationProposal | null>;
  findPendingByMachineId(machineId: string): Promise<MachineLocationProposal[]>;
  listPending(limit?: number): Promise<MachineLocationProposal[]>;
  approveProposal(
    proposalId: string,
    approver: { id: string; name: string }
  ): Promise<{ proposal: MachineLocationProposal; machine: SanitizedCloudMachine }>;
  rejectProposal(
    proposalId: string,
    actor: { id: string; name: string },
    reason?: string
  ): Promise<MachineLocationProposal>;
  countPending(): Promise<number>;
}

export interface IFieldExceptionApprovalRepository {
  createApproval(approval: FieldExceptionApproval): Promise<FieldExceptionApproval>;
  findById(id: string): Promise<FieldExceptionApproval | null>;
  findValidForTicketAndMachine(ticketId: string, machineId: string): Promise<FieldExceptionApproval | null>;
  findValidForTicketMachineAndTechnician(
    ticketId: string,
    machineId: string,
    technicianId?: string | null
  ): Promise<FieldExceptionApproval | null>;
  consumeApproval(id: string): Promise<FieldExceptionApproval>;
}

export interface ITechnicianRepository {
  findByEmployeeCode(code: string): Promise<CloudTechnicianAccount | null>;
  findById(id: string): Promise<CloudTechnicianAccount | null>;
  saveTechnician(account: CloudTechnicianAccount): Promise<void>;
  count(): Promise<number>;
}

export interface ISessionRepository {
  createSession(session: CloudTechnicianSession): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<CloudTechnicianSession | null>;
  deleteSession(sessionId: string): Promise<void>;
  deleteExpiredSessions(): Promise<number>;
  countActive(): Promise<number>;
}

export interface ISyncEventRepository {
  pushEvent(eventType: CloudSyncEventType, entityId: string, payload: any, version?: number): Promise<CloudSyncEvent>;
  getEventsAfter(cursor: number, limit?: number): Promise<{ events: CloudSyncEvent[]; nextCursor: number; hasMore: boolean }>;
  acknowledgeEvents(eventIds: string[]): Promise<{ acknowledgedCount: number }>;
  count(): Promise<number>;
  countPending(): Promise<number>;
}

export interface IAuditRepository {
  log(event: {
    actorType: 'CUSTOMER' | 'TECHNICIAN' | 'DESKTOP_SYNC' | 'SYSTEM' | 'ANONYMOUS';
    actorId: string;
    actorName: string;
    action: string;
    entity: string;
    result: 'SUCCESS' | 'FAILURE' | 'BLOCKED';
    details: any;
    ip?: string;
  }): Promise<void>;
}

export interface IIdempotencyRepository {
  get(key: string): Promise<any | null>;
  set(key: string, response: any): Promise<void>;
}

export interface ICloudRepositoryManager {
  providerType: 'POSTGRES' | 'JSON_DEV';
  machines: ICloudMachineRepository;
  tickets: ICloudTicketRepository;
  locationProposals: IMachineLocationProposalRepository;
  fieldExceptions: IFieldExceptionApprovalRepository;
  technicians: ITechnicianRepository;
  sessions: ISessionRepository;
  syncEvents: ISyncEventRepository;
  audit: IAuditRepository;
  idempotency: IIdempotencyRepository;
  checkHealth(): Promise<{ healthy: boolean; details?: any }>;
}

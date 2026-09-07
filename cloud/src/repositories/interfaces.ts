import {
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
  CloudAuditEvent
} from '../db/cloudDb';

export interface ICloudMachineRepository {
  findByQrToken(token: string): Promise<SanitizedCloudMachine | null>;
  findByIntegrationId(id: string): Promise<SanitizedCloudMachine | null>;
  bootstrapRegistry(machines: SanitizedCloudMachine[]): Promise<{ updated: number; total: number }>;
  upsertMachine(machine: SanitizedCloudMachine): Promise<void>;
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
  technicians: ITechnicianRepository;
  sessions: ISessionRepository;
  syncEvents: ISyncEventRepository;
  audit: IAuditRepository;
  idempotency: IIdempotencyRepository;
  checkHealth(): Promise<{ healthy: boolean; details?: any }>;
}

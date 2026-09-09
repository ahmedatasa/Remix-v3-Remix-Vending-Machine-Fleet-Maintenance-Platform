import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { cloudConfig } from '../config/cloudConfig';

export type LocationSource =
  | 'NONE'
  | 'MANUAL_ENTRY'
  | 'MAP_PICKER'
  | 'DEVICE_GPS'
  | 'TECHNICIAN_PROPOSAL_APPROVED'
  | 'IMPORT'
  | 'API'
  | 'FUTURE_DEVICE';

export type LocationStatus =
  | 'LOCATION_NOT_CONFIGURED'
  | 'GPS_CONFIGURED'
  | 'GPS_VERIFIED'
  | 'GPS_FAILED_DISTANCE'
  | 'GPS_FAILED_ACCURACY'
  | 'COORDINATES_MISSING'
  | 'QR_CONFIRMED_GPS_UNAVAILABLE'
  | 'PENDING_LOCATION_APPROVAL'
  | 'MANUAL_EXCEPTION_APPROVED';

export interface SanitizedCloudMachine {
  integrationMachineId: string;
  publicQrToken: string;
  machineNumber?: string;
  model?: string;
  machineType: string;
  publicDisplayName: string;
  buildingPublicName: string;
  locationPublicName: string;
  latitude: number | null;
  longitude: number | null;
  locationSource?: LocationSource;
  locationNote?: string;
  locationUpdatedAt?: string;
  locationUpdatedByActorId?: string;
  locationUpdatedByActorName?: string;
  active: boolean;
  lastSyncedAt: string;
  version: number;
}

export interface MachineLocationProposal {
  id: string;
  integrationMachineId: string;
  publicQrToken: string;
  ticketId?: string | null;
  technicianId: string;
  technicianName: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';
  submittedIp?: string | null;
  approvedByActorId?: string | null;
  approvedByActorName?: string | null;
  approvedAt?: string | null;
  rejectedByActorId?: string | null;
  rejectedByActorName?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FieldExceptionApproval {
  id: string;
  ticketId: string;
  integrationMachineId: string;
  technicianId?: string | null;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'USED' | 'EXPIRED';
  approvedByActorId: string;
  approvedByActorName: string;
  approvedAt: string;
  expiresAt?: string | null;
  usedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CloudCheckinRecord {
  id: string;
  ticketId: string;
  technicianId: string;
  technicianName: string;
  timestamp: string;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  distanceMeters: number | null;
  verified: boolean;
  status: LocationStatus | 'VERIFIED' | 'FAILED_DISTANCE' | 'FAILED_ACCURACY' | 'MANUAL_EXCEPTION' | 'COORDINATES_MISSING' | 'GPS_VERIFIED' | 'GPS_FAILED';
  exceptionApprovalId?: string | null;
  fieldExceptionId?: string | null;
  proposalId?: string | null;
  manualException?: {
    approvalId?: string;
    approvedBy: string;
    reason: string;
    approverRole?: string;
    timestamp: string;
  };
}

export interface CloudActionRecord {
  id: string;
  ticketId: string;
  technicianId: string;
  technicianName: string;
  actionType: string;
  description: string;
  timestamp: string;
}

export interface CloudEvidenceRecord {
  id: string;
  ticketId: string;
  technicianId: string;
  technicianName: string;
  objectKey: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  caption: string;
  timestamp: string;
}

export interface CloudFunctionalTestRecord {
  id: string;
  ticketId: string;
  technicianId: string;
  technicianName: string;
  testType: string;
  passed: boolean;
  notes: string;
  timestamp: string;
}

export interface CloudPartRequestRecord {
  id: string;
  ticketId: string;
  technicianId: string;
  technicianName: string;
  partId?: string;
  partName: string;
  quantityRequested: number;
  reason: string;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'ISSUED' | 'USED' | 'CANCELLED';
  timestamp: string;
}

export interface CloudTicket {
  id: string;
  cloudReportId: string;
  trackingToken: string;
  integrationMachineId: string;
  publicQrToken: string;
  category: string;
  description: string;
  reporterName: string;
  reporterPhone: string;
  reporterEmail: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  syncStatus: 'PENDING' | 'DELIVERED' | 'ACKNOWLEDGED';
  createdAt: string;
  updatedAt: string;
  checkins: CloudCheckinRecord[];
  actions: CloudActionRecord[];
  evidence: CloudEvidenceRecord[];
  functionalTests: CloudFunctionalTestRecord[];
  partRequests: CloudPartRequestRecord[];
  resolutionSummary?: string;
}

export interface CloudTechnicianAccount {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  phone?: string;
  passwordHash: string;
  status: 'ACTIVE' | 'DISABLED';
  specialization?: string;
}

export interface CloudTechnicianSession {
  sessionId: string;
  tokenHash: string;
  technicianId: string;
  employeeCode: string;
  fullName: string;
  createdAt: string;
  expiresAt: string;
}

export type CloudSyncEventType =
  | 'CUSTOMER_TICKET_CREATED'
  | 'TECHNICIAN_CHECKIN'
  | 'TECHNICIAN_ACTION'
  | 'EVIDENCE_ADDED'
  | 'FUNCTIONAL_TEST_COMPLETED'
  | 'PART_REQUEST_CREATED'
  | 'TICKET_RESOLVED'
  | 'MACHINE_LOCATION_PROPOSED'
  | 'MACHINE_LOCATION_APPROVED'
  | 'MACHINE_LOCATION_REJECTED'
  | 'MACHINE_LOCATION_MANUALLY_UPDATED'
  | 'MACHINE_LOCATION_CLEARED'
  | 'FIELD_EXCEPTION_APPROVED'
  | 'FIELD_EXCEPTION_USED';

export interface CloudSyncEvent {
  cursor: number;
  eventId: string;
  eventType: CloudSyncEventType;
  createdAt: string;
  entityId: string;
  version: number;
  payload: any;
  status: 'PENDING' | 'DELIVERED' | 'ACKNOWLEDGED';
  acknowledgedAt: string | null;
}

export interface CloudAuditEvent {
  id: string;
  timestamp: string;
  actorType: 'CUSTOMER' | 'TECHNICIAN' | 'DESKTOP_SYNC' | 'SYSTEM' | 'ANONYMOUS';
  actorId: string;
  actorName: string;
  action: string;
  entity: string;
  result: 'SUCCESS' | 'FAILURE' | 'BLOCKED';
  details: any;
  ip?: string;
}

export interface CloudDatabaseData {
  cloud_machine_registry: SanitizedCloudMachine[];
  cloud_tickets: CloudTicket[];
  technician_accounts: CloudTechnicianAccount[];
  technician_sessions: Record<string, CloudTechnicianSession>;
  sync_events: CloudSyncEvent[];
  lastCursor: number;
  idempotency_keys: Record<string, { createdAt: string; response: any }>;
  audit_events: CloudAuditEvent[];
  machine_location_proposals: MachineLocationProposal[];
  field_exception_approvals: FieldExceptionApproval[];
}

export class CloudDatabase {
  private filePath: string;
  private data: CloudDatabaseData;
  private isWriting = false;
  private isInMemory = false;

  constructor(filePath?: string) {
    const isStagingOrProduction =
      cloudConfig.isProduction ||
      cloudConfig.isStaging ||
      process.env.NODE_ENV === 'staging' ||
      process.env.NODE_ENV === 'production';

    if (isStagingOrProduction) {
      throw new Error(
        'FATAL_SPLIT_BRAIN_GUARD: CloudDatabase instantiation is strictly prohibited in staging/production mode. PostgreSQL is the authoritative runtime data store.'
      );
    }

    this.filePath = filePath || cloudConfig.cloudDatabaseFile;
    this.isInMemory = this.filePath === ':memory:';
    this.data = this.loadInitial();
  }

  private getDefaultData(): CloudDatabaseData {
    return {
      cloud_machine_registry: [],
      cloud_tickets: [],
      technician_accounts: [],
      technician_sessions: {},
      sync_events: [],
      lastCursor: 0,
      idempotency_keys: {},
      audit_events: [],
      machine_location_proposals: [],
      field_exception_approvals: []
    };
  }

  private loadInitial(): CloudDatabaseData {
    if (this.isInMemory) {
      return this.getDefaultData();
    }
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        return {
          cloud_machine_registry: Array.isArray(parsed.cloud_machine_registry) ? parsed.cloud_machine_registry : [],
          cloud_tickets: Array.isArray(parsed.cloud_tickets) ? parsed.cloud_tickets : [],
          technician_accounts: Array.isArray(parsed.technician_accounts) ? parsed.technician_accounts : [],
          technician_sessions: typeof parsed.technician_sessions === 'object' && parsed.technician_sessions ? parsed.technician_sessions : {},
          sync_events: Array.isArray(parsed.sync_events) ? parsed.sync_events : [],
          lastCursor: typeof parsed.lastCursor === 'number' ? parsed.lastCursor : (parsed.sync_events?.length || 0),
          idempotency_keys: typeof parsed.idempotency_keys === 'object' && parsed.idempotency_keys ? parsed.idempotency_keys : {},
          audit_events: Array.isArray(parsed.audit_events) ? parsed.audit_events : [],
          machine_location_proposals: Array.isArray(parsed.machine_location_proposals) ? parsed.machine_location_proposals : [],
          field_exception_approvals: Array.isArray(parsed.field_exception_approvals) ? parsed.field_exception_approvals : []
        };
      }
    } catch (err) {
      console.warn('[CloudDb] Failed to read existing cloud database, initializing fresh state:', err);
    }
    const def = this.getDefaultData();
    const isStagingOrProduction =
      cloudConfig.isProduction ||
      cloudConfig.isStaging ||
      process.env.NODE_ENV === 'staging' ||
      process.env.NODE_ENV === 'production';

    if (!isStagingOrProduction && !this.isInMemory) {
      this.persistSync(def);
    }
    return def;
  }

  public getData(): CloudDatabaseData {
    return this.data;
  }

  public save(): void {
    if (this.isInMemory) return;
    if (this.isWriting) return;
    this.isWriting = true;
    try {
      this.persistSync(this.data);
    } finally {
      this.isWriting = false;
    }
  }

  private persistSync(dataToSave: CloudDatabaseData): void {
    if (this.isInMemory || this.filePath === ':memory:') {
      return;
    }
    const isStagingOrProduction =
      cloudConfig.isProduction ||
      cloudConfig.isStaging ||
      process.env.NODE_ENV === 'staging' ||
      process.env.NODE_ENV === 'production';

    if (isStagingOrProduction) {
      throw new Error(
        'FATAL_SPLIT_BRAIN_GUARD: Writing to cloud_data.json is strictly prohibited in staging/production mode. PostgreSQL is the authoritative runtime data store.'
      );
    }

    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpPath = `${this.filePath}.tmp.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`;
    fs.writeFileSync(tmpPath, JSON.stringify(dataToSave, null, 2), 'utf8');
    fs.renameSync(tmpPath, this.filePath);
  }

  // --- Machine Registry ---
  public findMachineByQrToken(token: string): SanitizedCloudMachine | null {
    if (!token) return null;
    const clean = token.trim().toUpperCase();
    return this.data.cloud_machine_registry.find(m => m.publicQrToken.toUpperCase() === clean) || null;
  }

  public findMachineByIntegrationId(id: string): SanitizedCloudMachine | null {
    if (!id) return null;
    return this.data.cloud_machine_registry.find(m => m.integrationMachineId === id) || null;
  }

  public bootstrapMachineRegistry(machines: SanitizedCloudMachine[]): { updated: number; total: number } {
    let updated = 0;
    const now = new Date().toISOString();
    const existingMap = new Map<string, SanitizedCloudMachine>();
    for (const m of this.data.cloud_machine_registry) {
      existingMap.set(m.integrationMachineId, m);
    }

    const newRegistry: SanitizedCloudMachine[] = [];
    const seenIds = new Set<string>();
    const seenTokens = new Set<string>();

    for (const m of machines) {
      const cleanToken = (m.publicQrToken || '').trim().toUpperCase();
      if (seenIds.has(m.integrationMachineId) || (cleanToken && seenTokens.has(cleanToken))) {
        continue; // Deduplicate
      }
      seenIds.add(m.integrationMachineId);
      if (cleanToken) seenTokens.add(cleanToken);

      const existing = existingMap.get(m.integrationMachineId);
      const derivedNumber = m.machineNumber || (m.publicDisplayName ? m.publicDisplayName.split(' ')[0] : undefined);
      if (!existing) {
        newRegistry.push({
          ...m,
          machineNumber: derivedNumber,
          model: m.model,
          publicQrToken: cleanToken || m.publicQrToken,
          lastSyncedAt: now,
          version: 1
        });
        updated++;
      } else {
        newRegistry.push({
          ...existing,
          ...m,
          machineNumber: derivedNumber || existing.machineNumber,
          model: m.model || existing.model,
          publicQrToken: cleanToken || existing.publicQrToken,
          lastSyncedAt: now,
          version: (existing.version || 1) + 1
        });
        updated++;
      }
    }

    this.data.cloud_machine_registry = newRegistry;
    this.save();
    return { updated, total: this.data.cloud_machine_registry.length };
  }

  public removeMachine(idOrToken: string): boolean {
    if (!idOrToken) return false;
    const clean = idOrToken.trim().toUpperCase();
    const idx = this.data.cloud_machine_registry.findIndex(
      m => m.integrationMachineId === idOrToken || m.publicQrToken.toUpperCase() === clean
    );
    if (idx !== -1) {
      this.data.cloud_machine_registry.splice(idx, 1);
      this.save();
      return true;
    }
    return false;
  }

  // --- Ticket Repository ---
  public findTicketById(id: string): CloudTicket | null {
    return this.data.cloud_tickets.find(t => t.id === id) || null;
  }

  public findTicketByReportId(cloudReportId: string): CloudTicket | null {
    if (!cloudReportId) return null;
    return this.data.cloud_tickets.find(t => t.cloudReportId === cloudReportId) || null;
  }

  public findTicketByTrackingToken(token: string): CloudTicket | null {
    if (!token) return null;
    const clean = token.trim().toUpperCase();
    return this.data.cloud_tickets.find(t => t.trackingToken.toUpperCase() === clean) || null;
  }

  public insertTicket(ticket: CloudTicket): void {
    this.data.cloud_tickets.unshift(ticket);
    this.save();
  }

  // --- Event Sync Queue ---
  public pushSyncEvent(eventType: CloudSyncEventType, entityId: string, payload: any, version = 1): CloudSyncEvent {
    this.data.lastCursor += 1;
    const event: CloudSyncEvent = {
      cursor: this.data.lastCursor,
      eventId: `cld-evt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      eventType,
      createdAt: new Date().toISOString(),
      entityId,
      version,
      payload,
      status: 'PENDING',
      acknowledgedAt: null
    };
    this.data.sync_events.push(event);
    this.save();
    return event;
  }

  public getSyncEventsAfter(cursor: number, limit = 50): { events: CloudSyncEvent[]; nextCursor: number; hasMore: boolean } {
    const filtered = this.data.sync_events
      .filter(e => e.cursor > cursor)
      .slice(0, limit);
    
    const nextCursor = filtered.length > 0 ? filtered[filtered.length - 1].cursor : cursor;
    const hasMore = this.data.sync_events.some(e => e.cursor > nextCursor);

    return { events: filtered, nextCursor, hasMore };
  }

  public acknowledgeSyncEvents(eventIds: string[]): { acknowledgedCount: number } {
    const idSet = new Set(eventIds);
    let count = 0;
    const now = new Date().toISOString();
    for (const evt of this.data.sync_events) {
      if (idSet.has(evt.eventId) && evt.status !== 'ACKNOWLEDGED') {
        evt.status = 'ACKNOWLEDGED';
        evt.acknowledgedAt = now;
        count++;
      }
    }
    if (count > 0) {
      this.save();
    }
    return { acknowledgedCount: count };
  }

  // --- Audit Log ---
  public logAudit(
    actorType: 'CUSTOMER' | 'TECHNICIAN' | 'DESKTOP_SYNC' | 'SYSTEM' | 'ANONYMOUS',
    actorId: string,
    actorName: string,
    action: string,
    entity: string,
    result: 'SUCCESS' | 'FAILURE' | 'BLOCKED',
    details: any,
    ip?: string
  ): void {
    const entry: CloudAuditEvent = {
      id: `cld-adt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      timestamp: new Date().toISOString(),
      actorType,
      actorId,
      actorName,
      action,
      entity,
      result,
      details,
      ip
    };
    this.data.audit_events.unshift(entry);
    if (this.data.audit_events.length > 1000) {
      this.data.audit_events = this.data.audit_events.slice(0, 1000);
    }
    this.save();
  }
}

let _cloudDbInstance: CloudDatabase | null = null;

export function getCloudDb(): CloudDatabase {
  const isStagingOrProduction =
    cloudConfig.isProduction ||
    cloudConfig.isStaging ||
    process.env.NODE_ENV === 'staging' ||
    process.env.NODE_ENV === 'production';

  if (isStagingOrProduction) {
    throw new Error(
      'FATAL_SPLIT_BRAIN_GUARD: Accessing CloudDatabase/cloudDb is strictly prohibited in staging/production mode. PostgreSQL is the authoritative runtime data store.'
    );
  }

  if (!_cloudDbInstance) {
    _cloudDbInstance = new CloudDatabase();
  }
  return _cloudDbInstance;
}

export function resetCloudDbInstance(): void {
  _cloudDbInstance = null;
}

export const cloudDb: CloudDatabase = new Proxy({} as CloudDatabase, {
  get(_target, prop, receiver) {
    const instance = getCloudDb();
    const value = Reflect.get(instance as any, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  }
});

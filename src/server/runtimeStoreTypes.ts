export interface PersistenceMetadata {
  initialized: boolean;
  schemaVersion: number;
  version: string;
  initializedAt: string;
  baselineImportedAt: string | null;
  legacyMigrationCompletedAt: string | null;
  lastStartupTimestamp: string;
  runtimeStoreId: string;
  lastPersistedAt?: string;
  migrationSource?: string | null;
}

export interface EntityTombstone {
  id: string;
  entityType: 'Machine' | 'Building' | 'Floor' | 'Location' | 'Ticket' | 'User' | 'Technician' | 'SparePart' | 'Supplier' | 'PartRequest';
  entityId: string;
  deletedAt: string;
  deletedBy?: string;
  reason?: string;
  revision: number;
}

export interface SystemSettings {
  criticalSla: number;
  highSla: number;
  mediumSla: number;
  lowSla: number;
  emailAlerts: boolean;
  smsAlerts: boolean;
  supportPhone: string;
  supportEmail: string;
  supportHoursAr: string;
  supportWhatsapp: string;
  [key: string]: any;
}

export interface RuntimeStoreData {
  machines: any[];
  buildings: any[];
  floors: any[];
  locations: any[];
  tickets: any[];
  technicians: any[];
  categories: any[];
  spareParts: any[];
  suppliers: any[];
  partRequests: any[];
  transactions: any[];
  users: any[];
  auditLogs: any[];
  importBatches: any[];
  importRows: any[];
  settings: SystemSettings;
  tombstones: EntityTombstone[];
  locationProposals?: any[];
  fieldExceptions?: any[];
  processedSyncEventIds?: string[];
  lastCloudSyncCursor?: number;
  syncQueue?: any[];
  initialized: boolean;
  _persistence: PersistenceMetadata;
  isBaselineCommitted?: boolean;
  baselineCommittedAt?: string | null;
  baselineCommittedBy?: string | null;
  baselineNotes?: string | null;
}

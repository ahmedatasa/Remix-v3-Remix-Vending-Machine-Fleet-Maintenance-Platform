import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  resolveRuntimeDataDir,
  resolveRuntimeDataPath,
  resolveBackupsDir,
  resolveLegacyDataPath,
  resolveBaselineDataPath
} from './runtimePathResolver';
import {
  PersistenceMetadata,
  RuntimeStoreData,
  SystemSettings,
  EntityTombstone
} from './runtimeStoreTypes';

export const DEFAULT_SETTINGS: SystemSettings = {
  criticalSla: 2,
  highSla: 4,
  mediumSla: 8,
  lowSla: 24,
  emailAlerts: true,
  smsAlerts: true,
  supportPhone: '800-123-4567',
  supportEmail: 'support@vendingfleet.com',
  supportHoursAr: 'خدمة العملاء على مدار 24 ساعة طوال أيام الأسبوع',
  supportWhatsapp: '+966-50-000-0000'
};

function createEmptyRuntimeStore(storeId?: string): RuntimeStoreData {
  const now = new Date().toISOString();
  return {
    machines: [],
    buildings: [],
    floors: [],
    locations: [],
    tickets: [],
    technicians: [],
    categories: [],
    spareParts: [],
    suppliers: [],
    partRequests: [],
    transactions: [],
    users: [],
    auditLogs: [],
    importBatches: [],
    importRows: [],
    settings: { ...DEFAULT_SETTINGS },
    tombstones: [],
    locationProposals: [],
    fieldExceptions: [],
    processedSyncEventIds: [],
    lastCloudSyncCursor: 0,
    syncQueue: [],
    initialized: true,
    _persistence: {
      initialized: true,
      schemaVersion: 3,
      version: '5.4.4',
      initializedAt: now,
      baselineImportedAt: null,
      legacyMigrationCompletedAt: null,
      lastStartupTimestamp: now,
      runtimeStoreId: storeId || `store-${crypto.randomBytes(6).toString('hex')}`
    },
    isBaselineCommitted: false,
    baselineCommittedAt: null,
    baselineCommittedBy: null,
    baselineNotes: null
  };
}

export class RuntimeStoreManager {
  private static instance: RuntimeStoreManager | null = null;
  private inMemoryStore: RuntimeStoreData | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private isInitializing = false;

  public static getInstance(): RuntimeStoreManager {
    if (!RuntimeStoreManager.instance) {
      RuntimeStoreManager.instance = new RuntimeStoreManager();
    }
    return RuntimeStoreManager.instance;
  }

  /**
   * Reset instance (mainly for testing isolated environments)
   */
  public static resetInstance(): void {
    RuntimeStoreManager.instance = null;
  }

  public getRuntimeDataPath(): string {
    return resolveRuntimeDataPath();
  }

  public getRuntimeDataDir(): string {
    return resolveRuntimeDataDir();
  }

  /**
   * Serialized Mutex / Write Queue
   * Prevents concurrent writes from corrupting or losing updates.
   */
  public async enqueueMutation<T>(operation: (store: RuntimeStoreData) => Promise<T> | T): Promise<T> {
    const store = this.getStore();
    return new Promise<T>((resolve, reject) => {
      this.writeQueue = this.writeQueue
        .then(async () => {
          try {
            const result = await operation(store);
            this.saveStore(store);
            resolve(result);
          } catch (err) {
            reject(err);
          }
        })
        .catch(err => {
          reject(err);
        });
    });
  }

  /**
   * Performs an atomic file write:
   * 1. Writes to unique temp file in the same directory.
   * 2. Calls fsync to ensure data is flushed to physical storage.
   * 3. Validates written content.
   * 4. Atomically renames temp file to target file.
   */
  public atomicWriteJsonSync(targetPath: string, data: any): void {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const tempFile = `${targetPath}.tmp.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`;
    const jsonStr = JSON.stringify(data, null, 2);

    const fd = fs.openSync(tempFile, 'w');
    try {
      fs.writeSync(fd, jsonStr, 0, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    // Validate written temp file before rename
    const verifyRaw = fs.readFileSync(tempFile, 'utf8');
    if (verifyRaw.length < 10) {
      throw new Error(`[AtomicWrite] Written file is too small or truncated (${verifyRaw.length} bytes)`);
    }
    JSON.parse(verifyRaw); // Validate JSON parseability

    fs.renameSync(tempFile, targetPath);
  }

  /**
   * Creates a timestamped backup of the current store in <runtimeDir>/backups
   */
  public createBackup(label = 'manual'): string {
    const store = this.getStore();
    const backupsDir = resolveBackupsDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `fleet-backup-${label}-${timestamp}.json`;
    const backupFilePath = path.join(backupsDir, backupFileName);

    this.atomicWriteJsonSync(backupFilePath, store);
    console.log(`[Persistence] Created durable backup at: ${backupFilePath}`);
    return backupFilePath;
  }

  /**
   * One-time legacy migration from <project>/fleet_data.json to <runtimeDir>/fleet_runtime_data.json
   */
  public migrateLegacyStore(): { migrated: boolean; status: string; backupFile?: string } {
    const runtimePath = resolveRuntimeDataPath();
    const legacyPath = resolveLegacyDataPath();

    // 1. If runtime store already exists, DO NOT overwrite it with legacy file
    if (fs.existsSync(runtimePath)) {
      try {
        const raw = fs.readFileSync(runtimePath, 'utf8');
        if (raw && raw.trim().length > 10) {
          return { migrated: false, status: 'SKIPPED_ALREADY_INITIALIZED' };
        }
      } catch {
        // Fall through if file is corrupted
      }
    }

    // 2. If legacy fleet_data.json exists, migrate it
    if (fs.existsSync(legacyPath)) {
      try {
        console.log(`[Persistence] Starting one-time legacy migration from ${legacyPath} to ${runtimePath}...`);
        const legacyRaw = fs.readFileSync(legacyPath, 'utf8');
        const legacyData = JSON.parse(legacyRaw);

        if (!legacyData || typeof legacyData !== 'object' || !Array.isArray(legacyData.machines)) {
          throw new Error('Legacy fleet_data.json is missing or corrupted.');
        }

        // Create pre-migration backup in durable directory
        const backupsDir = resolveBackupsDir();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(backupsDir, `legacy-pre-migration-${timestamp}.json`);
        this.atomicWriteJsonSync(backupFile, legacyData);
        console.log(`[Persistence] Pre-migration backup verified at ${backupFile}`);

        // Construct normalized migrated runtime data
        const storeId = `store-${crypto.randomBytes(6).toString('hex')}`;
        const migratedStore = createEmptyRuntimeStore(storeId);

        // Copy all operational entities
        migratedStore.machines = Array.isArray(legacyData.machines) ? legacyData.machines : [];
        migratedStore.buildings = Array.isArray(legacyData.buildings) ? legacyData.buildings : [];
        migratedStore.floors = Array.isArray(legacyData.floors) ? legacyData.floors : [];
        migratedStore.locations = Array.isArray(legacyData.locations) ? legacyData.locations : [];
        migratedStore.tickets = Array.isArray(legacyData.tickets) ? legacyData.tickets : [];
        migratedStore.technicians = Array.isArray(legacyData.technicians) ? legacyData.technicians : [];
        migratedStore.categories = Array.isArray(legacyData.categories) ? legacyData.categories : [];
        migratedStore.spareParts = Array.isArray(legacyData.spareParts) ? legacyData.spareParts : [];
        migratedStore.suppliers = Array.isArray(legacyData.suppliers) ? legacyData.suppliers : [];
        migratedStore.partRequests = Array.isArray(legacyData.partRequests) ? legacyData.partRequests : [];
        migratedStore.transactions = Array.isArray(legacyData.transactions) ? legacyData.transactions : [];
        migratedStore.users = Array.isArray(legacyData.users) ? legacyData.users : [];
        migratedStore.auditLogs = Array.isArray(legacyData.auditLogs) ? legacyData.auditLogs : [];
        migratedStore.importBatches = Array.isArray(legacyData.importBatches) ? legacyData.importBatches : [];
        migratedStore.importRows = Array.isArray(legacyData.importRows) ? legacyData.importRows : [];
        migratedStore.settings = { ...DEFAULT_SETTINGS, ...(legacyData.settings || {}) };
        migratedStore.tombstones = Array.isArray(legacyData.tombstones) ? legacyData.tombstones : [];
        migratedStore.locationProposals = Array.isArray(legacyData.locationProposals) ? legacyData.locationProposals : [];
        migratedStore.fieldExceptions = Array.isArray(legacyData.fieldExceptions) ? legacyData.fieldExceptions : [];
        migratedStore.processedSyncEventIds = Array.isArray(legacyData.processedSyncEventIds) ? legacyData.processedSyncEventIds : [];
        migratedStore.lastCloudSyncCursor = typeof legacyData.lastCloudSyncCursor === 'number' ? legacyData.lastCloudSyncCursor : 0;
        migratedStore.isBaselineCommitted = legacyData.isBaselineCommitted === true;
        migratedStore.baselineCommittedAt = legacyData.baselineCommittedAt || null;
        migratedStore.baselineCommittedBy = legacyData.baselineCommittedBy || null;
        migratedStore.baselineNotes = legacyData.baselineNotes || null;

        // Populate metadata
        migratedStore.initialized = true;
        migratedStore._persistence = {
          initialized: true,
          schemaVersion: 3,
          version: '5.4.4',
          initializedAt: legacyData._persistence?.initializedAt || new Date().toISOString(),
          baselineImportedAt: legacyData._persistence?.baselineImportedAt || null,
          legacyMigrationCompletedAt: new Date().toISOString(),
          lastStartupTimestamp: new Date().toISOString(),
          runtimeStoreId: storeId,
          migrationSource: legacyPath
        };

        // Write atomically to authoritative runtime store
        this.atomicWriteJsonSync(runtimePath, migratedStore);
        console.log(`[Persistence] Legacy migration complete. Migrated ${migratedStore.machines.length} machines, ${migratedStore.tickets.length} tickets.`);

        return { migrated: true, status: 'COMPLETE', backupFile };
      } catch (err) {
        console.error('[Persistence] Legacy migration failed:', err);
        return { migrated: false, status: 'FAILED' };
      }
    }

    return { migrated: false, status: 'NOT_REQUIRED' };
  }

  /**
   * Initializes first-run installation from fleet_master_baseline.json
   * Executed when neither runtime store nor legacy store exists, or when explicitly requested.
   */
  public initFirstRunFromBaseline(): RuntimeStoreData {
    const runtimePath = resolveRuntimeDataPath();
    const baselinePath = resolveBaselineDataPath();
    console.log(`[Persistence] First-ever run detected. Initializing from baseline: ${baselinePath}`);

    const storeId = `store-${crypto.randomBytes(6).toString('hex')}`;
    const newStore = createEmptyRuntimeStore(storeId);

    if (fs.existsSync(baselinePath)) {
      try {
        const rawBaseline = fs.readFileSync(baselinePath, 'utf8');
        const parsedBaseline = JSON.parse(rawBaseline);

        newStore.machines = Array.isArray(parsedBaseline.machines) ? parsedBaseline.machines : [];
        newStore.buildings = Array.isArray(parsedBaseline.buildings) ? parsedBaseline.buildings : [];
        newStore.floors = Array.isArray(parsedBaseline.floors) ? parsedBaseline.floors : [];
        newStore.locations = Array.isArray(parsedBaseline.locations) ? parsedBaseline.locations : [];
        newStore.technicians = Array.isArray(parsedBaseline.technicians) ? parsedBaseline.technicians : [];
        newStore.categories = Array.isArray(parsedBaseline.categories) ? parsedBaseline.categories : [];
        newStore.spareParts = Array.isArray(parsedBaseline.spareParts) ? parsedBaseline.spareParts : [];
        newStore.suppliers = Array.isArray(parsedBaseline.suppliers) ? parsedBaseline.suppliers : [];
        newStore.users = Array.isArray(parsedBaseline.users) ? parsedBaseline.users : [];
        newStore.importBatches = Array.isArray(parsedBaseline.importBatches) ? parsedBaseline.importBatches : [];
        newStore.importRows = Array.isArray(parsedBaseline.importRows) ? parsedBaseline.importRows : [];
        newStore.settings = { ...DEFAULT_SETTINGS, ...(parsedBaseline.settings || {}) };

        // Zero dynamic operational tickets or requests in baseline
        newStore.tickets = [];
        newStore.partRequests = [];
        newStore.transactions = [];

        newStore._persistence.baselineImportedAt = new Date().toISOString();
      } catch (err) {
        console.warn('[Persistence] Could not parse baseline file, using clean defaults:', err);
      }
    }

    this.atomicWriteJsonSync(runtimePath, newStore);
    return newStore;
  }

  /**
   * Load and validate the authoritative store
   */
  public load(): RuntimeStoreData {
    if (this.inMemoryStore) {
      return this.inMemoryStore;
    }

    const runtimePath = resolveRuntimeDataPath();
    const now = new Date().toISOString();

    // 1. Run legacy migration if needed
    const migrationResult = this.migrateLegacyStore();

    // 2. Load authoritative runtime file if exists
    if (fs.existsSync(runtimePath)) {
      try {
        const raw = fs.readFileSync(runtimePath, 'utf8');
        if (raw && raw.trim().length > 0) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object' && Array.isArray(parsed.machines)) {
            // Normalize all collections
            if (!Array.isArray(parsed.buildings)) parsed.buildings = [];
            if (!Array.isArray(parsed.floors)) parsed.floors = [];
            if (!Array.isArray(parsed.locations)) parsed.locations = [];
            if (!Array.isArray(parsed.tickets)) parsed.tickets = [];
            if (!Array.isArray(parsed.technicians)) parsed.technicians = [];
            if (!Array.isArray(parsed.categories)) parsed.categories = [];
            if (!Array.isArray(parsed.spareParts)) parsed.spareParts = [];
            if (!Array.isArray(parsed.suppliers)) parsed.suppliers = [];
            if (!Array.isArray(parsed.partRequests)) parsed.partRequests = [];
            if (!Array.isArray(parsed.transactions)) parsed.transactions = [];
            if (!Array.isArray(parsed.users)) parsed.users = [];
            if (!Array.isArray(parsed.auditLogs)) parsed.auditLogs = [];
            if (!Array.isArray(parsed.importBatches)) parsed.importBatches = [];
            if (!Array.isArray(parsed.importRows)) parsed.importRows = [];
            if (!Array.isArray(parsed.tombstones)) parsed.tombstones = [];
            if (!Array.isArray(parsed.locationProposals)) parsed.locationProposals = [];
            if (!Array.isArray(parsed.fieldExceptions)) parsed.fieldExceptions = [];
            if (!Array.isArray(parsed.processedSyncEventIds)) parsed.processedSyncEventIds = [];
            if (typeof parsed.lastCloudSyncCursor !== 'number') parsed.lastCloudSyncCursor = 0;
            if (!parsed.settings || typeof parsed.settings !== 'object') {
              parsed.settings = { ...DEFAULT_SETTINGS };
            } else {
              parsed.settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
            }

            parsed.initialized = true;
            if (!parsed._persistence) {
              parsed._persistence = {
                initialized: true,
                schemaVersion: 3,
                version: '5.4.4',
                initializedAt: now,
                baselineImportedAt: null,
                legacyMigrationCompletedAt: migrationResult.migrated ? now : null,
                lastStartupTimestamp: now,
                runtimeStoreId: `store-${crypto.randomBytes(6).toString('hex')}`
              };
            } else {
              parsed._persistence.initialized = true;
              parsed._persistence.schemaVersion = 3;
              parsed._persistence.version = '5.4.4';
              parsed._persistence.lastStartupTimestamp = now;
            }

            this.inMemoryStore = parsed;
            this.logStartupDiagnostics(migrationResult.status, 'SKIPPED_ALREADY_INITIALIZED');
            return this.inMemoryStore;
          }
        }
      } catch (err) {
        console.error('[Persistence] CRITICAL: Failed to parse runtime store:', err);
      }
    }

    // 3. First-run baseline initialization (if neither runtime nor legacy data exists)
    this.inMemoryStore = this.initFirstRunFromBaseline();
    this.logStartupDiagnostics('NOT_REQUIRED', 'FIRST_RUN_APPLIED');
    return this.inMemoryStore;
  }

  public getStore(): RuntimeStoreData {
    if (!this.inMemoryStore) {
      return this.load();
    }
    return this.inMemoryStore;
  }

  /**
   * Authoritative save method:
   * Writes ONLY to resolveRuntimeDataPath() atomically.
   * Does NOT write to process.cwd()/fleet_data.json.
   */
  public saveStore(data?: RuntimeStoreData): void {
    const store = data || this.inMemoryStore;
    if (!store || typeof store !== 'object') {
      console.error('[Persistence] CRITICAL: Attempted to save invalid store payload - aborted.');
      return;
    }

    const now = new Date().toISOString();
    store.initialized = true;
    if (!store._persistence) {
      store._persistence = {
        initialized: true,
        schemaVersion: 3,
        version: '5.4.4',
        initializedAt: now,
        baselineImportedAt: null,
        legacyMigrationCompletedAt: null,
        lastStartupTimestamp: now,
        runtimeStoreId: `store-${crypto.randomBytes(6).toString('hex')}`
      };
    }
    store._persistence.initialized = true;
    store._persistence.lastPersistedAt = now;

    this.inMemoryStore = store;
    const runtimePath = resolveRuntimeDataPath();
    this.atomicWriteJsonSync(runtimePath, store);
  }

  public getMetadata(): PersistenceMetadata {
    const store = this.getStore();
    return store._persistence;
  }

  public getStats(): {
    machinesCount: number;
    buildingsCount: number;
    floorsCount: number;
    locationsCount: number;
    ticketsActiveCount: number;
    ticketsResolvedCount: number;
    ticketsClosedCount: number;
    tombstonesCount: number;
  } {
    const store = this.getStore();
    const tickets = store.tickets || [];
    const active = tickets.filter((t: any) => !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(t.status)).length;
    const resolved = tickets.filter((t: any) => t.status === 'RESOLVED').length;
    const closed = tickets.filter((t: any) => t.status === 'CLOSED').length;

    return {
      machinesCount: (store.machines || []).length,
      buildingsCount: (store.buildings || []).length,
      floorsCount: (store.floors || []).length,
      locationsCount: (store.locations || []).length,
      ticketsActiveCount: active,
      ticketsResolvedCount: resolved,
      ticketsClosedCount: closed,
      tombstonesCount: (store.tombstones || []).length
    };
  }

  /**
   * Records a tombstone to prevent deleted entities from being resurrected by stale sync.
   */
  public recordTombstone(
    entityType: EntityTombstone['entityType'],
    entityId: string,
    deletedBy?: string,
    reason?: string
  ): void {
    const store = this.getStore();
    if (!Array.isArray(store.tombstones)) store.tombstones = [];
    
    // Remove any existing tombstone for same entityId to update it
    store.tombstones = store.tombstones.filter(t => !(t.entityType === entityType && t.entityId === entityId));
    store.tombstones.push({
      id: `tb-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      entityType,
      entityId,
      deletedAt: new Date().toISOString(),
      deletedBy: deletedBy || 'System',
      reason: reason || 'Deleted by user',
      revision: Date.now()
    });
    // Cap tombstones at 5000 to prevent unbounded growth
    if (store.tombstones.length > 5000) {
      store.tombstones = store.tombstones.slice(-5000);
    }
  }

  public isTombstoned(entityType: EntityTombstone['entityType'], entityId: string): boolean {
    const store = this.getStore();
    if (!Array.isArray(store.tombstones)) return false;
    return store.tombstones.some(t => t.entityType === entityType && t.entityId === entityId);
  }

  private logStartupDiagnostics(legacyMigrationStatus: string, baselineImportStatus: string): void {
    const stats = this.getStats();
    console.log('======================================================================');
    console.log('PHASE 5.4.4: AUTHORITATIVE RUNTIME STORE INITIALIZED');
    console.log('======================================================================');
    console.log(`Runtime data directory: ${this.getRuntimeDataDir()}`);
    console.log(`Runtime data file:      ${this.getRuntimeDataPath()}`);
    console.log(`Runtime initialized:    YES`);
    console.log(`Schema version:         3`);
    console.log(`Legacy migration:       ${legacyMigrationStatus}`);
    console.log(`Baseline import:        ${baselineImportStatus}`);
    console.log(`Machine count:          ${stats.machinesCount}`);
    console.log(`Building count:         ${stats.buildingsCount}`);
    console.log(`Location count:         ${stats.locationsCount}`);
    console.log(`Ticket counts:          active=${stats.ticketsActiveCount}, resolved=${stats.ticketsResolvedCount}, closed=${stats.ticketsClosedCount}`);
    console.log(`Tombstones count:       ${stats.tombstonesCount}`);
    console.log('======================================================================');
  }
}

// Export dynamic singleton helper methods for server.ts and services
export const runtimeStoreManager = new Proxy({} as RuntimeStoreManager, {
  get(_target, prop) {
    const instance = RuntimeStoreManager.getInstance() as any;
    const value = instance[prop];
    return typeof value === 'function' ? value.bind(instance) : value;
  }
});
export const getStore = () => RuntimeStoreManager.getInstance().getStore();
export const saveStore = (data?: RuntimeStoreData) => RuntimeStoreManager.getInstance().saveStore(data);

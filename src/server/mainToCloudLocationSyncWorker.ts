import {
  syncCloudMachineLocationFromMain,
  type CloudMachineLocationSyncInput
} from './cloudMachineLocationSyncClient';

interface WorkerResult {
  attempted: number;
  synced: number;
  pending: number;
  superseded: number;
}

let timer: NodeJS.Timeout | null = null;
let running = false;

function calculateBackoffMs(retryCount: number): number {
  const base = Math.max(15, parseInt(process.env.MAIN_TO_CLOUD_LOCATION_RETRY_BASE_SECONDS || '30', 10));
  const max = Math.max(base, parseInt(process.env.MAIN_TO_CLOUD_LOCATION_RETRY_MAX_SECONDS || '900', 10));
  const seconds = Math.min(max, base * Math.pow(2, Math.min(retryCount, 5)));
  return seconds * 1000;
}

function isDue(event: any, nowMs: number): boolean {
  if (!event?.nextRetryAt) return true;
  const due = new Date(event.nextRetryAt).getTime();
  return !Number.isFinite(due) || due <= nowMs;
}

function toSyncInput(event: any): CloudMachineLocationSyncInput | null {
  const p = event?.payload || {};
  if (!event?.aggregateId || !event?.operationId) return null;
  if (!Number.isInteger(p.sourceRevision) || p.sourceRevision < 1) return null;

  return {
    machineId: String(event.aggregateId),
    publicQrToken: p.publicQrToken || null,
    latitude: p.latitude ?? null,
    longitude: p.longitude ?? null,
    locationSource: String(p.locationSource || 'NONE'),
    locationNote: p.locationNote ?? null,
    sourceRevision: p.sourceRevision,
    operationId: String(event.operationId),
    actorId: String(p.actorId || 'SYSTEM'),
    actorName: String(p.actorName || 'Main Sync Agent')
  };
}

export const mainToCloudLocationSyncWorker = {
  async syncOnce(
    getStore: () => any,
    saveStore: (store?: any) => void
  ): Promise<WorkerResult> {
    if (running) {
      return { attempted: 0, synced: 0, pending: 0, superseded: 0 };
    }

    running = true;
    const result: WorkerResult = { attempted: 0, synced: 0, pending: 0, superseded: 0 };

    try {
      const store = getStore();
      if (!Array.isArray(store.syncQueue)) store.syncQueue = [];
      const nowMs = Date.now();

      const candidates = store.syncQueue
        .filter((event: any) =>
          event?.direction === 'MAIN_TO_CLOUD' &&
          event?.eventType === 'MACHINE_LOCATION_SYNC_REQUIRED' &&
          event?.syncStatus === 'PENDING' &&
          isDue(event, nowMs)
        )
        .slice(0, 10);

      for (const event of candidates) {
        const input = toSyncInput(event);
        if (!input) {
          event.syncStatus = 'FAILED';
          event.lastError = 'INVALID_LOCATION_SYNC_EVENT';
          event.processedAt = new Date().toISOString();
          continue;
        }

        const machine = (store.machines || []).find((m: any) => m.id === input.machineId);
        if (!machine) {
          event.syncStatus = 'SYNCED';
          event.processedAt = new Date().toISOString();
          event.processedReason = 'MACHINE_NO_LONGER_EXISTS';
          result.superseded++;
          continue;
        }

        const newerLocationEvent = store.syncQueue.some((candidate: any) =>
          candidate !== event &&
          candidate?.direction === 'MAIN_TO_CLOUD' &&
          candidate?.eventType === 'MACHINE_LOCATION_SYNC_REQUIRED' &&
          candidate?.aggregateId === input.machineId &&
          Number.isInteger(candidate?.payload?.sourceRevision) &&
          candidate.payload.sourceRevision > input.sourceRevision
        );

        if (newerLocationEvent) {
          event.syncStatus = 'SYNCED';
          event.processedAt = new Date().toISOString();
          event.processedReason = 'SUPERSEDED_BY_NEWER_LOCATION_REVISION';
          result.superseded++;
          continue;
        }

        const machineLocationMatchesEvent =
          (input.latitude === null && input.longitude === null &&
            (machine.latitude === null || machine.latitude === undefined) &&
            (machine.longitude === null || machine.longitude === undefined)) ||
          (typeof input.latitude === 'number' && typeof input.longitude === 'number' &&
            typeof machine.latitude === 'number' && typeof machine.longitude === 'number' &&
            Number(machine.latitude.toFixed(6)) === Number(input.latitude.toFixed(6)) &&
            Number(machine.longitude.toFixed(6)) === Number(input.longitude.toFixed(6)));

        result.attempted++;
        event.lastAttemptAt = new Date().toISOString();
        const syncResult = await syncCloudMachineLocationFromMain(input);

        if (syncResult.status === 'SYNCED') {
          event.syncStatus = 'SYNCED';
          event.processedAt = new Date().toISOString();
          event.lastError = null;
          event.cloudVersion = syncResult.cloudVersion;
          event.idempotent = syncResult.idempotent === true;

          if (machineLocationMatchesEvent) {
            machine.cloudLocationSyncStatus = 'SYNCED';
            machine.cloudLocationSyncedRevision = input.sourceRevision;
            machine.cloudLocationSyncedAt = event.processedAt;
            machine.cloudLocationSyncLastError = null;
          }
          result.synced++;
        } else {
          event.retryCount = (event.retryCount || 0) + 1;
          event.lastError = syncResult.error || 'CLOUD_SYNC_FAILED';
          event.nextRetryAt = new Date(Date.now() + calculateBackoffMs(event.retryCount)).toISOString();
          event.syncStatus = 'PENDING';

          if (machineLocationMatchesEvent) {
            machine.cloudLocationSyncStatus = 'PENDING';
            machine.cloudLocationSyncLastError = event.lastError;
          }
          result.pending++;
        }

        saveStore(store);
      }

      if (candidates.length === 0) {
        return result;
      }

      saveStore(store);
      return result;
    } finally {
      running = false;
    }
  },

  start(getStore: () => any, saveStore: (store?: any) => void): void {
    if (timer) return;
    const intervalSeconds = Math.max(
      15,
      parseInt(process.env.MAIN_TO_CLOUD_LOCATION_SYNC_INTERVAL_SECONDS || '30', 10)
    );

    void this.syncOnce(getStore, saveStore);
    timer = setInterval(() => {
      void this.syncOnce(getStore, saveStore);
    }, intervalSeconds * 1000);
    timer.unref();
  },

  stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }
};

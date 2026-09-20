export type CloudMachineLocationSyncStatus = 'SYNCED' | 'PENDING' | 'FAILED';

export interface CloudMachineLocationSyncInput {
  machineId: string;
  publicQrToken?: string | null;
  latitude: number | null;
  longitude: number | null;
  locationSource: string;
  locationNote?: string | null;
  sourceRevision: number;
  operationId: string;
  actorId: string;
  actorName: string;
}

export interface CloudMachineLocationSyncResult {
  status: CloudMachineLocationSyncStatus;
  operationId: string;
  cloudVersion?: number;
  idempotent?: boolean;
  error?: string;
  httpStatus?: number;
}

function isSafeCloudUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:') return true;
    if (parsed.protocol !== 'http:') return false;
    return ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function coordinatesMatch(
  expectedLat: number | null,
  expectedLng: number | null,
  actualLat: unknown,
  actualLng: unknown
): boolean {
  if (expectedLat === null || expectedLng === null) {
    return (actualLat === null || actualLat === undefined) &&
      (actualLng === null || actualLng === undefined);
  }

  return typeof actualLat === 'number' &&
    typeof actualLng === 'number' &&
    Number(actualLat.toFixed(6)) === Number(expectedLat.toFixed(6)) &&
    Number(actualLng.toFixed(6)) === Number(expectedLng.toFixed(6));
}

/**
 * Explicit Main-authoritative machine-location push.
 *
 * This is deliberately separate from the PULL_ONLY background worker. It calls
 * a dedicated Cloud /sync endpoint that does NOT create a Cloud -> Main sync
 * event, preventing a sync echo/loop.
 */
export async function syncCloudMachineLocationFromMain(
  input: CloudMachineLocationSyncInput
): Promise<CloudMachineLocationSyncResult> {
  const baseUrl = (process.env.CLOUD_API_URL || '').trim().replace(/\/+$/, '');
  const syncClientId = (process.env.SYNC_CLIENT_ID || 'ksu-desktop-sync-client-2026').trim();
  const syncClientSecret = (process.env.SYNC_CLIENT_SECRET || '').trim();

  if (!baseUrl || !syncClientId || !syncClientSecret) {
    return {
      status: 'PENDING',
      operationId: input.operationId,
      error: 'CLOUD_SYNC_NOT_CONFIGURED'
    };
  }

  if (!isSafeCloudUrl(baseUrl)) {
    return {
      status: 'FAILED',
      operationId: input.operationId,
      error: 'UNSAFE_CLOUD_URL'
    };
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(2000, parseInt(process.env.MAIN_TO_CLOUD_SYNC_TIMEOUT_MS || '8000', 10));
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `${baseUrl}/sync/machines/${encodeURIComponent(input.machineId)}/location`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-sync-client-id': syncClientId,
          'x-sync-client-secret': syncClientSecret
        },
        body: JSON.stringify({
          latitude: input.latitude,
          longitude: input.longitude,
          locationSource: input.locationSource,
          locationNote: input.locationNote ?? undefined,
          sourceRevision: input.sourceRevision,
          operationId: input.operationId,
          actorId: input.actorId,
          actorName: input.actorName,
          publicQrToken: input.publicQrToken || undefined
        }),
        signal: controller.signal
      }
    );

    let body: any = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      return {
        status: 'PENDING',
        operationId: input.operationId,
        error: body?.error || body?.message || `CLOUD_HTTP_${response.status}`,
        httpStatus: response.status
      };
    }

    const cloudMachine = body?.machine;
    if (!body?.success || !cloudMachine) {
      return {
        status: 'PENDING',
        operationId: input.operationId,
        error: 'INVALID_CLOUD_CONFIRMATION',
        httpStatus: response.status
      };
    }

    if (String(cloudMachine.integrationMachineId || '') !== String(input.machineId)) {
      return {
        status: 'PENDING',
        operationId: input.operationId,
        error: 'CLOUD_MACHINE_ID_MISMATCH',
        httpStatus: response.status
      };
    }

    if (!coordinatesMatch(input.latitude, input.longitude, cloudMachine.latitude, cloudMachine.longitude)) {
      return {
        status: 'PENDING',
        operationId: input.operationId,
        error: 'CLOUD_COORDINATE_VERIFICATION_FAILED',
        httpStatus: response.status
      };
    }

    return {
      status: 'SYNCED',
      operationId: input.operationId,
      cloudVersion: typeof cloudMachine.version === 'number' ? cloudMachine.version : undefined,
      idempotent: body?.idempotent === true,
      httpStatus: response.status
    };
  } catch (err: any) {
    return {
      status: 'PENDING',
      operationId: input.operationId,
      error: err?.name === 'AbortError' ? 'CLOUD_SYNC_TIMEOUT' : (err?.message || 'CLOUD_CONNECTION_FAILED')
    };
  } finally {
    clearTimeout(timeout);
  }
}

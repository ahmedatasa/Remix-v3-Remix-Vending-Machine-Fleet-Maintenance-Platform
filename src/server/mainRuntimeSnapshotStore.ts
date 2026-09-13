import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Pool } from 'pg';
import type { RuntimeStoreData } from './runtimeStoreTypes';

type PendingSnapshot = {
  json: string;
  runtimeStoreId: string | null;
};

let pool: Pool | null = null;
let tableReady: Promise<void> | null = null;

let pendingSnapshot: PendingSnapshot | null = null;
let drainPromise: Promise<void> | null = null;
let lastPersistenceError: Error | null = null;

function getDatabaseUrl(): string {
  return String(process.env.MAIN_DATABASE_URL || '').trim();
}

function getSnapshotKey(): string {
  return String(
    process.env.MAIN_RUNTIME_SNAPSHOT_KEY ||
    'vending-main-staging'
  ).trim();
}

function getPersistenceMode(): string {
  return String(
    process.env.MAIN_RUNTIME_PERSISTENCE || ''
  ).trim().toUpperCase();
}

export function isMainRuntimePostgresEnabled(): boolean {
  return getPersistenceMode() === 'POSTGRES';
}

function getPool(): Pool | null {
  if (!isMainRuntimePostgresEnabled()) {
    return null;
  }

  const dbUrl = getDatabaseUrl();

  if (!dbUrl) {
    throw new Error(
      'MAIN_RUNTIME_POSTGRES_CONFIG_INVALID: MAIN_RUNTIME_PERSISTENCE=POSTGRES requires MAIN_DATABASE_URL.'
    );
  }

  if (!pool) {
    pool = new Pool({
      connectionString: dbUrl,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl:
        dbUrl.includes('localhost') ||
        dbUrl.includes('127.0.0.1')
          ? false
          : { rejectUnauthorized: false }
    });
  }

  return pool;
}

async function ensureSnapshotTable(): Promise<void> {
  const db = getPool();

  if (!db) {
    return;
  }

  if (!tableReady) {
    tableReady = db.query(`
      CREATE TABLE IF NOT EXISTS main_runtime_snapshots (
        snapshot_key TEXT PRIMARY KEY,
        snapshot JSONB NOT NULL,
        runtime_store_id TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `).then(() => undefined);
  }

  await tableReady;
}

function atomicRestoreFile(
  targetPath: string,
  snapshot: RuntimeStoreData
): void {
  const dir = path.dirname(targetPath);

  fs.mkdirSync(dir, { recursive: true });

  const tempPath =
    `${targetPath}.restore.${process.pid}.` +
    crypto.randomBytes(4).toString('hex');

  const json = JSON.stringify(snapshot, null, 2);

  const fd = fs.openSync(tempPath, 'w', 0o600);

  try {
    fs.writeSync(fd, json, 0, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  fs.renameSync(tempPath, targetPath);
}

export async function restoreMainRuntimeSnapshotToFile(
  targetPath: string
): Promise<{
  enabled: boolean;
  restored: boolean;
  snapshotKey?: string;
  runtimeStoreId?: string | null;
  updatedAt?: string;
}> {
  const db = getPool();

  if (!db) {
    return {
      enabled: false,
      restored: false
    };
  }

  // Never overwrite an already-present local runtime store.
  // PostgreSQL is used as durable recovery only when the ephemeral/local
  // runtime file is missing (for example after a Render restart/redeploy).
  if (fs.existsSync(targetPath)) {
    const snapshotKey = getSnapshotKey();

    console.log(
      `[MainRuntimePostgres] Local runtime file already exists at ${targetPath}; ` +
      `skipping PostgreSQL restore.`
    );

    return {
      enabled: true,
      restored: false,
      snapshotKey
    };
  }

  await ensureSnapshotTable();

  const snapshotKey = getSnapshotKey();

  const result = await db.query(
    `
      SELECT
        snapshot,
        runtime_store_id,
        updated_at
      FROM main_runtime_snapshots
      WHERE snapshot_key = $1
      LIMIT 1
    `,
    [snapshotKey]
  );

  if (result.rowCount === 0) {
    console.log(
      `[MainRuntimePostgres] No durable snapshot found for key "${snapshotKey}".`
    );

    return {
      enabled: true,
      restored: false,
      snapshotKey
    };
  }

  const row = result.rows[0];
  const snapshot = row.snapshot as RuntimeStoreData;

  if (
    !snapshot ||
    typeof snapshot !== 'object' ||
    !Array.isArray(snapshot.machines)
  ) {
    throw new Error(
      'MAIN_RUNTIME_SNAPSHOT_INVALID: PostgreSQL snapshot is not a valid runtime store.'
    );
  }

  atomicRestoreFile(targetPath, snapshot);

  console.log(
    `[MainRuntimePostgres] Restored durable runtime snapshot "${snapshotKey}" ` +
    `to ${targetPath}.`
  );

  console.log(
    `[MainRuntimePostgres] Restored counts: ` +
    `machines=${snapshot.machines?.length || 0}, ` +
    `tickets=${snapshot.tickets?.length || 0}, ` +
    `users=${snapshot.users?.length || 0}.`
  );

  return {
    enabled: true,
    restored: true,
    snapshotKey,
    runtimeStoreId: row.runtime_store_id || null,
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

async function persistSnapshot(
  snapshot: PendingSnapshot
): Promise<void> {
  const db = getPool();

  if (!db) {
    return;
  }

  await ensureSnapshotTable();

  const snapshotKey = getSnapshotKey();

  await db.query(
    `
      INSERT INTO main_runtime_snapshots (
        snapshot_key,
        snapshot,
        runtime_store_id,
        updated_at
      )
      VALUES ($1, $2::jsonb, $3, NOW())
      ON CONFLICT (snapshot_key)
      DO UPDATE SET
        snapshot = EXCLUDED.snapshot,
        runtime_store_id = EXCLUDED.runtime_store_id,
        updated_at = NOW()
    `,
    [
      snapshotKey,
      snapshot.json,
      snapshot.runtimeStoreId
    ]
  );
}

async function drainSnapshots(): Promise<void> {
  while (pendingSnapshot) {
    const current = pendingSnapshot;
    pendingSnapshot = null;

    try {
      await persistSnapshot(current);
      lastPersistenceError = null;
    } catch (err: any) {
      lastPersistenceError =
        err instanceof Error
          ? err
          : new Error(String(err));

      // Keep the latest snapshot available for retry.
      if (!pendingSnapshot) {
        pendingSnapshot = current;
      }

      console.error(
        '[MainRuntimePostgres] Snapshot persistence failed:',
        lastPersistenceError.message
      );

      break;
    }
  }
}

function startDrain(): void {
  if (drainPromise || !pendingSnapshot) {
    return;
  }

  drainPromise = drainSnapshots()
    .finally(() => {
      drainPromise = null;

      // If a newer snapshot arrived while finishing, continue.
      if (pendingSnapshot && !lastPersistenceError) {
        startDrain();
      }
    });
}

export function queueMainRuntimeSnapshot(
  store: RuntimeStoreData
): void {
  if (!isMainRuntimePostgresEnabled()) {
    return;
  }

  // Serialize immediately so later in-memory mutation cannot alter
  // the snapshot that was queued for PostgreSQL.
  const json = JSON.stringify(store);

  pendingSnapshot = {
    json,
    runtimeStoreId:
      store?._persistence?.runtimeStoreId || null
  };

  lastPersistenceError = null;
  startDrain();
}

export async function flushMainRuntimeSnapshots(): Promise<void> {
  if (!isMainRuntimePostgresEnabled()) {
    return;
  }

  lastPersistenceError = null;

  if (pendingSnapshot && !drainPromise) {
    startDrain();
  }

  if (drainPromise) {
    await drainPromise;
  }

  if (pendingSnapshot) {
    startDrain();

    if (drainPromise) {
      await drainPromise;
    }
  }

  if (lastPersistenceError) {
    throw lastPersistenceError;
  }

  if (pendingSnapshot) {
    throw new Error(
      'MAIN_RUNTIME_SNAPSHOT_FLUSH_INCOMPLETE'
    );
  }
}

export async function closeMainRuntimeSnapshotStore(): Promise<void> {
  try {
    await flushMainRuntimeSnapshots();
  } finally {
    if (pool) {
      await pool.end();
      pool = null;
      tableReady = null;
    }
  }
}

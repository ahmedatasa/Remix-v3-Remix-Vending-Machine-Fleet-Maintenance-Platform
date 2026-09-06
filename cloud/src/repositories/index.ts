import { Pool } from 'pg';
import type { ICloudRepositoryManager } from './interfaces';
import { JsonCloudRepositoryManager } from './jsonRepository';
import { PostgresCloudRepositoryManager } from './postgresRepository';
import { runCloudDatabaseMigrations } from '../db/migrations/runner';
import { cloudConfig } from '../config/cloudConfig';

let activeRepository: ICloudRepositoryManager | null = null;
let postgresPool: Pool | null = null;

export async function initializeCloudRepository(): Promise<ICloudRepositoryManager> {
  if (activeRepository) {
    return activeRepository;
  }

  const dbUrl = cloudConfig.databaseUrl;

  if (dbUrl) {
    try {
      console.log('[CloudRepository] Initializing Managed PostgreSQL Connection Pool...');
      postgresPool = new Pool({
        connectionString: dbUrl,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        ssl: dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1') ? false : { rejectUnauthorized: false }
      });

      // Run non-destructive database migrations
      console.log('[CloudRepository] Running PostgreSQL database migrations...');
      await runCloudDatabaseMigrations(postgresPool);

      activeRepository = new PostgresCloudRepositoryManager(postgresPool);
      console.log('[CloudRepository] Successfully connected to PostgreSQL. Mode: POSTGRESQL');
      return activeRepository;
    } catch (err: any) {
      console.error('[CloudRepository] Failed to initialize PostgreSQL:', err.message);
      if (cloudConfig.isProduction || cloudConfig.isStaging || process.env.NODE_ENV === 'staging') {
        throw new Error('FATAL: Database connection failed in staging/production mode. Refusing to fallback to local JSON to prevent split-brain data.');
      }
      console.warn('[CloudRepository] Falling back to JSON Development repository for local/testing mode.');
      activeRepository = new JsonCloudRepositoryManager();
      return activeRepository;
    }
  }

  if (cloudConfig.isProduction || cloudConfig.isStaging || process.env.NODE_ENV === 'staging') {
    throw new Error('FATAL: CLOUD_DATABASE_URL is required in staging/production environment.');
  }

  console.log('[CloudRepository] CLOUD_DATABASE_URL not set. Running in JSON Development repository mode.');
  activeRepository = new JsonCloudRepositoryManager();
  return activeRepository;
}

export async function resetActiveRepository(): Promise<void> {
  if (postgresPool) {
    try {
      await postgresPool.end();
    } catch {}
    postgresPool = null;
  }
  activeRepository = null;
}

export function getCloudRepository(): ICloudRepositoryManager {
  if (!activeRepository) {
    // Default synchronous instance for dev/test before async init
    activeRepository = new JsonCloudRepositoryManager();
  }
  return activeRepository;
}

export type { ICloudRepositoryManager } from './interfaces';

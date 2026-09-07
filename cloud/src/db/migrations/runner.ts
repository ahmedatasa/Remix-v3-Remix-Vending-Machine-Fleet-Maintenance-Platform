import fs from 'fs';
import path from 'path';
import { Pool, PoolClient } from 'pg';

export interface MigrationResult {
  success: boolean;
  applied: string[];
  message: string;
}

export async function runCloudDatabaseMigrations(pool: Pool): Promise<MigrationResult> {
  const client: PoolClient = await pool.connect();
  const applied: string[] = [];

  try {
    // 1. Ensure schema_migrations exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Fetch already applied versions
    const res = await client.query('SELECT version FROM schema_migrations;');
    const appliedSet = new Set<string>(res.rows.map(r => r.version));
    const alreadyAppliedVersions = Array.from(appliedSet);

    // 3. Find migration files using deterministic resolution strategy
    const configuredDir = process.env.CLOUD_MIGRATIONS_DIR;
    let migrationsDir = configuredDir
      ? path.resolve(configuredDir)
      : path.resolve(process.cwd(), 'cloud', 'src', 'db', 'migrations');

    // Fallback if running from inside the cloud/ directory directly
    if (!fs.existsSync(migrationsDir)) {
      const altDir = path.resolve(process.cwd(), 'src', 'db', 'migrations');
      if (fs.existsSync(altDir)) {
        migrationsDir = altDir;
      }
    }

    console.log(`[CloudDb Migrations] Resolved migration directory: ${migrationsDir}`);

    let files: string[] = [];
    if (fs.existsSync(migrationsDir)) {
      files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();
    }

    console.log(`[CloudDb Migrations] Number of .sql files found: ${files.length}`);
    console.log(`[CloudDb Migrations] Migration filenames found: ${files.length > 0 ? files.join(', ') : 'none'}`);
    console.log(`[CloudDb Migrations] Already applied migration versions: ${alreadyAppliedVersions.length > 0 ? alreadyAppliedVersions.join(', ') : 'none'}`);

    // Critical: If no migration files are discovered in staging/production, fail startup immediately
    if (files.length === 0) {
      const env = (process.env.NODE_ENV || '').toLowerCase();
      if (env === 'staging' || env === 'production') {
        throw new Error(`CLOUD_MIGRATION_FILES_NOT_FOUND: ${migrationsDir}`);
      }
    }

    for (const file of files) {
      const version = file.split('_')[0];
      if (appliedSet.has(version)) {
        continue;
      }

      console.log(`[CloudDb Migrations] Executing migration: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version, name, applied_at) VALUES ($1, $2, CURRENT_TIMESTAMP)',
          [version, file]
        );
        await client.query('COMMIT');
        applied.push(file);
        console.log(`[CloudDb Migrations] Successfully applied migration: ${file} (version ${version})`);
      } catch (migrationErr: any) {
        await client.query('ROLLBACK');
        console.error(`[CloudDb Migrations] Migration failed for ${file}:`, migrationErr.message);
        throw migrationErr;
      }
    }

    console.log(`[CloudDb Migrations] Newly applied migration versions: ${applied.length > 0 ? applied.join(', ') : 'none'}`);

    return {
      success: true,
      applied,
      message: applied.length > 0
        ? `Applied ${applied.length} migrations successfully: ${applied.join(', ')}`
        : 'Database schema is already up to date.'
    };
  } finally {
    client.release();
  }
}

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

    // 3. Find migration files
    const migrationsDir = path.resolve(__dirname);
    let files: string[] = [];
    if (fs.existsSync(migrationsDir)) {
      files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();
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
        console.log(`[CloudDb Migrations] Successfully applied migration: ${file}`);
      } catch (migrationErr: any) {
        await client.query('ROLLBACK');
        console.error(`[CloudDb Migrations] Migration failed for ${file}:`, migrationErr.message);
        throw migrationErr;
      }
    }

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

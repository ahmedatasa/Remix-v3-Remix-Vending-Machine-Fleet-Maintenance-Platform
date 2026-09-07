import fs from 'fs';
import path from 'path';
import { Pool, PoolClient } from 'pg';

export interface MigrationResult {
  success: boolean;
  applied: string[];
  message: string;
}

/**
 * Run Cloud PostgreSQL database migrations.
 *
 * Supported environments:
 * - Local development
 * - Docker
 * - Render
 * - Google Cloud Run
 *
 * Migration path resolution order:
 * 1. CLOUD_MIGRATIONS_DIR environment variable
 * 2. <process.cwd()>/cloud/src/db/migrations
 * 3. <process.cwd()>/src/db/migrations
 *
 * IMPORTANT:
 * In staging/production, finding zero migration files is treated
 * as a fatal deployment/configuration error.
 */
export async function runCloudDatabaseMigrations(
  pool: Pool
): Promise<MigrationResult> {
  const client: PoolClient = await pool.connect();

  const applied: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // 1. Ensure migration tracking table exists
    // -------------------------------------------------------------------------

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // -------------------------------------------------------------------------
    // 2. Read already applied migration versions
    // -------------------------------------------------------------------------

    const res = await client.query<{
      version: string;
      name?: string;
    }>(
      `
      SELECT version, name
      FROM schema_migrations
      ORDER BY version;
      `
    );

    const appliedSet = new Set<string>(
      res.rows.map((row) => row.version)
    );

    const alreadyAppliedVersions = Array.from(appliedSet);

    // -------------------------------------------------------------------------
    // 3. Resolve migrations directory deterministically
    // -------------------------------------------------------------------------

    const configuredDir = process.env.CLOUD_MIGRATIONS_DIR;

    let migrationsDir = configuredDir
      ? path.resolve(configuredDir)
      : path.resolve(
          process.cwd(),
          'cloud',
          'src',
          'db',
          'migrations'
        );

    /**
     * Local fallback:
     *
     * If the application is started while the working directory
     * is already /cloud, the path may instead be:
     *
     * <cwd>/src/db/migrations
     */
    if (!fs.existsSync(migrationsDir)) {
      const alternativeDir = path.resolve(
        process.cwd(),
        'src',
        'db',
        'migrations'
      );

      if (fs.existsSync(alternativeDir)) {
        migrationsDir = alternativeDir;
      }
    }

    // -------------------------------------------------------------------------
    // 4. Discover migration SQL files
    // -------------------------------------------------------------------------

    console.log(
      `[CloudDb Migrations] Resolved migration directory: ${migrationsDir}`
    );

    let files: string[] = [];

    if (fs.existsSync(migrationsDir)) {
      files = fs
        .readdirSync(migrationsDir)
        .filter((file) => file.toLowerCase().endsWith('.sql'))
        .sort();
    }

    console.log(
      `[CloudDb Migrations] Number of .sql files found: ${files.length}`
    );

    console.log(
      `[CloudDb Migrations] Migration filenames found: ${
        files.length > 0 ? files.join(', ') : 'none'
      }`
    );

    console.log(
      `[CloudDb Migrations] Already applied migration versions: ${
        alreadyAppliedVersions.length > 0
          ? alreadyAppliedVersions.join(', ')
          : 'none'
      }`
    );

    // -------------------------------------------------------------------------
    // 5. Prevent silent migration failure in staging / production
    // -------------------------------------------------------------------------

    if (files.length === 0) {
      const env = (process.env.NODE_ENV || '').toLowerCase();

      if (env === 'staging' || env === 'production') {
        throw new Error(
          `CLOUD_MIGRATION_FILES_NOT_FOUND: ${migrationsDir}`
        );
      }

      console.warn(
        '[CloudDb Migrations] No migration files discovered. ' +
          'Continuing because environment is not staging/production.'
      );
    }

    // -------------------------------------------------------------------------
    // 6. Apply pending migrations
    // -------------------------------------------------------------------------

    for (const file of files) {
      /**
       * Expected naming convention:
       *
       * 001_initial_cloud_schema.sql
       * 002_some_future_change.sql
       *
       * Version becomes:
       *
       * 001
       * 002
       */
      const version = file.split('_')[0]?.trim();

      if (!version) {
        throw new Error(
          `INVALID_MIGRATION_FILENAME: Unable to determine version from "${file}"`
        );
      }

      // Skip migration if already applied
      if (appliedSet.has(version)) {
        console.log(
          `[CloudDb Migrations] Skipping already applied migration: ${file} (version ${version})`
        );

        continue;
      }

      const filePath = path.join(migrationsDir, file);

      console.log(
        `[CloudDb Migrations] Executing migration: ${file} (version ${version})`
      );

      const sql = fs.readFileSync(filePath, 'utf8');

      // Prevent accidental empty migration execution
      if (!sql.trim()) {
        throw new Error(
          `EMPTY_MIGRATION_FILE: ${file}`
        );
      }

      // -----------------------------------------------------------------------
      // Execute each migration atomically
      // -----------------------------------------------------------------------

      await client.query('BEGIN');

      try {
        await client.query(sql);

        await client.query(
          `
          INSERT INTO schema_migrations (
            version,
            name,
            applied_at
          )
          VALUES ($1, $2, CURRENT_TIMESTAMP);
          `,
          [version, file]
        );

        await client.query('COMMIT');

        /**
         * Important:
         * Add the version immediately so another file with the same
         * migration version cannot be applied during the same process.
         */
        appliedSet.add(version);

        applied.push(file);

        console.log(
          `[CloudDb Migrations] Successfully applied migration: ${file} (version ${version})`
        );
      } catch (migrationError: unknown) {
        await client.query('ROLLBACK');

        const message =
          migrationError instanceof Error
            ? migrationError.message
            : String(migrationError);

        console.error(
          `[CloudDb Migrations] Migration failed for ${file}: ${message}`
        );

        throw migrationError;
      }
    }

    // -------------------------------------------------------------------------
    // 7. Final migration summary
    // -------------------------------------------------------------------------

    console.log(
      `[CloudDb Migrations] Newly applied migrations: ${
        applied.length > 0
          ? applied.join(', ')
          : 'none'
      }`
    );

    if (applied.length === 0) {
      console.log(
        '[CloudDb Migrations] Database schema is already up to date.'
      );
    }

    // -------------------------------------------------------------------------
    // 8. Return result
    // -------------------------------------------------------------------------

    return {
      success: true,
      applied,
      message:
        applied.length > 0
          ? `Applied ${applied.length} migration(s) successfully: ${applied.join(', ')}`
          : 'Database schema is already up to date.'
    };
  } finally {
    // -------------------------------------------------------------------------
    // Always return PostgreSQL connection to the pool
    // -------------------------------------------------------------------------

    client.release();
  }
}
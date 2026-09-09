import path from 'path';
import os from 'os';
import fs from 'fs';

/**
 * PHASE 5.4.4: Authoritative Runtime Path Resolver
 * 
 * Determines durable operational data directory outside the volatile Git source tree.
 * Priority:
 *  1. VENDING_DATA_DIR environment variable (explicit override for testing/production)
 *  2. Electron app.getPath('userData') if running in an Electron desktop environment
 *  3. Platform-specific user application data directories:
 *     - Linux:   ~/.local/share/vending-management (or $XDG_DATA_HOME/vending-management)
 *     - Windows: %APPDATA%/VendingManagement
 *     - macOS:   ~/Library/Application Support/VendingManagement
 */

export function resolveRuntimeDataDir(): string {
  // 1. Explicit environment override
  if (process.env.VENDING_DATA_DIR && process.env.VENDING_DATA_DIR.trim().length > 0) {
    const customDir = path.resolve(process.env.VENDING_DATA_DIR.trim());
    if (!fs.existsSync(customDir)) {
      fs.mkdirSync(customDir, { recursive: true });
    }
    return customDir;
  }

  // 2. Electron userData directory
  try {
    const electron = (global as any).electron || (process.versions as any)?.electron;
    if (electron) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const electronModule = require('electron');
      const app = electronModule?.app || electronModule?.remote?.app;
      if (app && typeof app.getPath === 'function') {
        const electronUserData = path.join(app.getPath('userData'), 'VendingManagement');
        if (!fs.existsSync(electronUserData)) {
          fs.mkdirSync(electronUserData, { recursive: true });
        }
        return electronUserData;
      }
    }
  } catch {
    // Non-electron environment, continue
  }

  // 3. Platform standard user data directories
  const platform = process.platform;
  let targetDir: string;

  if (platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    targetDir = path.join(appData, 'VendingManagement');
  } else if (platform === 'darwin') {
    targetDir = path.join(os.homedir(), 'Library', 'Application Support', 'VendingManagement');
  } else {
    // Linux and other POSIX (e.g. Lubuntu, Ubuntu, Debian)
    const xdgDataHome = process.env.XDG_DATA_HOME;
    if (xdgDataHome && xdgDataHome.trim().length > 0) {
      targetDir = path.join(path.resolve(xdgDataHome.trim()), 'vending-management');
    } else {
      targetDir = path.join(os.homedir(), '.local', 'share', 'vending-management');
    }
  }

  if (!fs.existsSync(targetDir)) {
    try {
      fs.mkdirSync(targetDir, { recursive: true });
    } catch (err) {
      console.warn(`[RuntimePathResolver] Could not create standard directory ${targetDir}, falling back to local .runtime_data:`, err);
      targetDir = path.join(process.cwd(), '.runtime_data');
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
    }
  }

  return targetDir;
}

/**
 * Returns the absolute path to the authoritative runtime database file.
 * e.g., <runtimeDir>/fleet_runtime_data.json
 */
export function resolveRuntimeDataPath(): string {
  return path.join(resolveRuntimeDataDir(), 'fleet_runtime_data.json');
}

/**
 * Returns the directory for durable pre-migration and operational backups.
 */
export function resolveBackupsDir(): string {
  const dir = path.join(resolveRuntimeDataDir(), 'backups');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Returns the path to the legacy tracked fleet_data.json in process.cwd().
 * Used ONLY for one-time legacy migration.
 */
export function resolveLegacyDataPath(): string {
  if (process.env.VENDING_LEGACY_DATA_PATH && process.env.VENDING_LEGACY_DATA_PATH.trim().length > 0) {
    return path.resolve(process.env.VENDING_LEGACY_DATA_PATH.trim());
  }
  return path.join(process.cwd(), 'fleet_data.json');
}

/**
 * Returns the path to the permanent master baseline file in process.cwd().
 * Used ONLY for first-run initializations when no runtime or legacy data exists.
 */
export function resolveBaselineDataPath(): string {
  return path.join(process.cwd(), 'fleet_master_baseline.json');
}

/**
 * Returns the path to the operational uploads directory.
 * If VENDING_DATA_DIR is set, stores uploads in <runtimeDir>/uploads.
 * Otherwise defaults to durable runtime uploads with fallback.
 */
export function resolveRuntimeUploadsDir(): string {
  const dir = path.join(resolveRuntimeDataDir(), 'uploads');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

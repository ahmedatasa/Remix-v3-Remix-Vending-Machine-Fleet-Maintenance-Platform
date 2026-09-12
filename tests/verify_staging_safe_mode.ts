import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

import { RuntimeStoreManager } from '../src/server/runtimeStoreManager';
import { desktopSyncWorker } from '../src/services/desktopSyncWorker';

async function main() {
  console.log('============================================================');
  console.log(' VERIFY: STAGING SAFE MODE');
  console.log('============================================================');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, message: string) {
    total++;
    if (!condition) {
      console.error(`✗ [FAIL] ${message}`);
      throw new Error(message);
    }
    passed++;
    console.log(`✓ [PASS] ${message}`);
  }

  const originalEnv = {
    VENDING_DATA_DIR: process.env.VENDING_DATA_DIR,
    VENDING_RUNTIME_MODE: process.env.VENDING_RUNTIME_MODE,
    DESKTOP_SYNC_ENABLED: process.env.DESKTOP_SYNC_ENABLED,
    SYNC_CLIENT_SECRET: process.env.SYNC_CLIENT_SECRET
  };

  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'vending-empty-staging-')
  );

  try {
    process.env.VENDING_DATA_DIR = tempDir;
    process.env.VENDING_RUNTIME_MODE = 'EMPTY_STAGING';
    process.env.DESKTOP_SYNC_ENABLED = 'false';
    process.env.SYNC_CLIENT_SECRET = 'THIS_MUST_NEVER_BE_USED';

    console.log('\nTest 1: EMPTY_STAGING ignores tracked fleet and baseline');

    const manager = new RuntimeStoreManager();
    const store = manager.load();

    assert(Array.isArray(store.machines) && store.machines.length === 0,
      'EMPTY_STAGING starts with zero machines');

    assert(Array.isArray(store.users) && store.users.length === 0,
      'EMPTY_STAGING starts with zero users');

    assert(Array.isArray(store.tickets) && store.tickets.length === 0,
      'EMPTY_STAGING starts with zero tickets');

    const runtimePath = path.join(tempDir, 'fleet_runtime_data.json');

    assert(fs.existsSync(runtimePath),
      'isolated fleet_runtime_data.json was created');

    const persisted = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));

    assert(persisted.machines.length === 0,
      'persisted staging runtime contains no protected fleet machines');

    console.log('\nTest 2: Existing staging runtime survives restart');

    store.settings.supportPhone = 'STAGING-PERSISTENCE-MARKER';
    manager.saveStore(store);

    const secondManager = new RuntimeStoreManager();
    const secondLoad = secondManager.load();

    assert(
      secondLoad.settings.supportPhone === 'STAGING-PERSISTENCE-MARKER',
      'existing isolated staging runtime is preserved across restart'
    );

    assert(secondLoad.machines.length === 0,
      'restart does not seed fleet baseline');

    console.log('\nTest 3: Desktop sync is disabled at both entry points');

    let storeTouched = false;

    desktopSyncWorker.start(
      () => {
        storeTouched = true;
        return { machines: [] };
      },
      () => {
        storeTouched = true;
      }
    );

    await new Promise(resolve => setTimeout(resolve, 2300));

    assert(storeTouched === false,
      'disabled background worker performs no initial sync');

    const manualResult = await desktopSyncWorker.syncOnce(
      () => {
        storeTouched = true;
        return { machines: new Array(189).fill({}) };
      },
      () => {
        storeTouched = true;
      }
    );

    assert(manualResult.connected === false,
      'manual sync is rejected while DESKTOP_SYNC_ENABLED=false');

    assert(
      manualResult.message.includes('DESKTOP_SYNC_ENABLED=false'),
      'manual sync returns explicit disabled reason'
    );

    assert(storeTouched === false,
      'disabled manual sync does not read or write local fleet');

    console.log('\nTest 4: Default behavior remains enabled unless explicitly disabled');

    delete process.env.DESKTOP_SYNC_ENABLED;

    assert(
      desktopSyncWorker.getOptions().enabled === true,
      'desktop sync defaults to enabled for existing installations'
    );

    console.log('\nTest 5: Protected tracked fleet remains byte-identical');

    const protectedFleetPath = path.resolve(process.cwd(), 'fleet_data.json');
    const protectedFleetRaw = fs.readFileSync(protectedFleetPath);
    const protectedHash = crypto.createHash('sha256').update(protectedFleetRaw).digest('hex');

    assert(
      protectedHash === 'cfb83460aa1aa2acac6d68c07cacc9168fa3583b8aa880bd875092f2fd992478',
      `protected fleet SHA256 unchanged: ${protectedHash}`
    );

    console.log('\n============================================================');
    console.log(`ALL TESTS PASSED: ${passed} / ${total}`);
    console.log('============================================================');
  } finally {
    desktopSyncWorker.stop();

    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});

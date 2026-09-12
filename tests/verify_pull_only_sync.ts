import http from 'http';
import { desktopSyncWorker } from '../src/services/desktopSyncWorker';

const PORT = 3197;
const CLOUD_URL = `http://127.0.0.1:${PORT}`;

let bootstrapCalls = 0;
let eventCalls = 0;
let ackCalls = 0;
let acknowledgedIds: string[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  console.log(`✓ [PASS] ${message}`);
}

async function main() {
  console.log('============================================================');
  console.log(' VERIFY: DESKTOP SYNC PULL_ONLY MODE');
  console.log('============================================================');

  process.env.DESKTOP_SYNC_ENABLED = 'true';
  process.env.DESKTOP_SYNC_MODE = 'PULL_ONLY';
  process.env.CLOUD_API_URL = CLOUD_URL;
  process.env.SYNC_CLIENT_ID = 'pull-only-test-client';
  process.env.SYNC_CLIENT_SECRET = 'pull-only-test-secret';

  const createdAt = '2026-09-12T14:20:00.000Z';

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', CLOUD_URL);

    const send = (status: number, data: any) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
    };

    if (req.method === 'GET' && url.pathname === '/health') {
      return send(200, { status: 'HEALTHY' });
    }

    if (req.method === 'POST' && url.pathname === '/sync/bootstrap') {
      bootstrapCalls++;
      return send(500, {
        error: 'BOOTSTRAP_MUST_NOT_BE_CALLED_IN_PULL_ONLY'
      });
    }

    if (req.method === 'GET' && url.pathname === '/sync/events') {
      eventCalls++;

      const after = Number(url.searchParams.get('after') || '0');

      if (after >= 1) {
        return send(200, {
          success: true,
          cursor: after,
          nextCursor: after,
          hasMore: false,
          eventCount: 0,
          events: []
        });
      }

      return send(200, {
        success: true,
        cursor: 0,
        nextCursor: 1,
        hasMore: false,
        eventCount: 1,
        events: [
          {
            eventId: 'evt-pull-only-001',
            cursor: 1,
            eventType: 'CUSTOMER_TICKET_CREATED',
            createdAt,
            payload: {
              ticketId: 'cld-tck-pull-only-001',
              cloudReportId: 'report-pull-only-001',
              trackingToken: 'TRK-PULL-ONLY-001',
              integrationMachineId: 'machine-local-001',
              publicQrToken: 'ALDCGXSB',
              category: 'OTHER',
              description: 'Staging pull-only test ticket',
              reporterName: 'Test User',
              reporterPhone: '',
              reporterEmail: '',
              createdAt
            }
          }
        ]
      });
    }

    if (req.method === 'POST' && url.pathname === '/sync/ack') {
      ackCalls++;

      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          acknowledgedIds = parsed.eventIds || [];
          send(200, {
            success: true,
            acknowledgedCount: acknowledgedIds.length
          });
        } catch {
          send(400, { error: 'INVALID_BODY' });
        }
      });
      return;
    }

    send(404, { error: 'NOT_FOUND', path: url.pathname });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve());
  });

  try {
    const options = desktopSyncWorker.getOptions();

    assert(options.enabled === true, 'Desktop sync is enabled for the test');
    assert(options.mode === 'PULL_ONLY', 'DESKTOP_SYNC_MODE resolves to PULL_ONLY');

    let localStore: any = {
      machines: [
        {
          id: 'machine-local-001',
          machineNumber: '1',
          publicQrToken: 'ALDCGXSB',
          machineType: 'VENDING_MACHINE',
          status: 'ACTIVE'
        }
      ],
      technicians: [],
      users: [],
      tickets: [],
      partRequests: [],
      syncQueue: [
        {
          id: 'local-machine-created-event',
          eventType: 'MACHINE_CREATED',
          aggregateId: 'machine-local-001',
          syncStatus: 'PENDING'
        }
      ],
      processedSyncEventIds: [],
      lastCloudSyncCursor: 0
    };

    const initialMachineSnapshot = JSON.stringify(localStore.machines);

    const getStore = () => localStore;
    const saveStore = (updated: any) => {
      localStore = updated;
    };

    console.log('\n--- First PULL_ONLY cycle ---');

    const result = await desktopSyncWorker.syncOnce(getStore, saveStore);

    assert(result.connected === true, 'PULL_ONLY sync connects successfully');
    assert(result.syncedEventsCount === 1, 'Exactly one cloud event was applied');
    assert(result.bootstrappedMachinesCount === 0, 'Bootstrapped machine count remains zero');

    assert(
      bootstrapCalls === 0,
      'POST /sync/bootstrap was NEVER called'
    );

    assert(
      eventCalls === 1,
      'GET /sync/events was called'
    );

    assert(
      ackCalls === 1,
      'POST /sync/ack was called'
    );

    assert(
      acknowledgedIds.includes('evt-pull-only-001'),
      'Cloud event was acknowledged'
    );

    assert(
      localStore.machines.length === 1,
      'PULL_ONLY works with a one-machine staging fleet'
    );

    assert(
      JSON.stringify(localStore.machines) === initialMachineSnapshot,
      'Local machine registry was not mutated'
    );

    assert(
      localStore.tickets.length === 1,
      'Cloud customer ticket was created in Main local tickets'
    );

    const ticket = localStore.tickets[0];

    assert(
      ticket.cloudTicketId === 'cld-tck-pull-only-001',
      'Cloud ticket ID is preserved'
    );

    assert(
      ticket.cloudReportId === 'report-pull-only-001',
      'Cloud report ID is preserved'
    );

    assert(
      ticket.publicTrackingToken === 'TRK-PULL-ONLY-001',
      'Public tracking token is preserved'
    );

    assert(
      ticket.machineId === 'machine-local-001',
      'Cloud ticket is linked to the existing local machine'
    );

    assert(
      ticket.source === 'PUBLIC_QR',
      'Ticket source is PUBLIC_QR'
    );

    assert(
      localStore.lastCloudSyncCursor === 1,
      'Cloud sync cursor advanced to 1'
    );

    assert(
      localStore.processedSyncEventIds.includes('evt-pull-only-001'),
      'Processed event ID is persisted'
    );

    assert(
      localStore.syncQueue[0].syncStatus === 'PENDING',
      'Local MACHINE_CREATED event remains pending; PULL_ONLY does not push/mark it synced'
    );

    console.log('\n--- Second PULL_ONLY cycle / idempotency ---');

    const secondResult = await desktopSyncWorker.syncOnce(getStore, saveStore);

    assert(
      secondResult.connected === true,
      'Second PULL_ONLY cycle completes successfully'
    );

    assert(
      secondResult.syncedEventsCount === 0,
      'No duplicate event is applied on second cycle'
    );

    assert(
      localStore.tickets.length === 1,
      'No duplicate local ticket is created'
    );

    assert(
      bootstrapCalls === 0,
      'Bootstrap remains completely disabled after multiple cycles'
    );

    assert(
      localStore.machines.length === 1,
      'Machine count remains unchanged after multiple cycles'
    );

    console.log('\n--- Initial cursor safety test ---');

    process.env.DESKTOP_SYNC_INITIAL_CURSOR = '2';

    let cursorStore: any = {
      machines: [
        {
          id: 'machine-local-001',
          machineNumber: '1',
          publicQrToken: 'ALDCGXSB',
          machineType: 'VENDING_MACHINE',
          status: 'ACTIVE'
        }
      ],
      technicians: [],
      users: [],
      tickets: [],
      partRequests: [],
      syncQueue: [],
      processedSyncEventIds: []
    };

    const cursorGetStore = () => cursorStore;
    const cursorSaveStore = (updated: any) => {
      cursorStore = updated;
    };

    const eventsBeforeCursorTest = eventCalls;

    const cursorResult = await desktopSyncWorker.syncOnce(
      cursorGetStore,
      cursorSaveStore
    );

    assert(
      cursorResult.connected === true,
      'Fresh PULL_ONLY store connects with configured initial cursor'
    );

    assert(
      cursorStore.lastCloudSyncCursor === 2,
      'DESKTOP_SYNC_INITIAL_CURSOR initializes fresh store cursor to 2'
    );

    assert(
      eventCalls === eventsBeforeCursorTest + 1,
      'Cloud events endpoint is called after cursor initialization'
    );

    assert(
      bootstrapCalls === 0,
      'Initial cursor path still never calls bootstrap'
    );

    console.log('\n--- Empty fleet guard test ---');

    let emptyStore: any = {
      machines: [],
      tickets: [],
      partRequests: [],
      syncQueue: [],
      processedSyncEventIds: []
    };

    const eventCallsBeforeEmpty = eventCalls;
    const ackCallsBeforeEmpty = ackCalls;
    const bootstrapCallsBeforeEmpty = bootstrapCalls;

    const emptyResult = await desktopSyncWorker.syncOnce(
      () => emptyStore,
      (updated: any) => { emptyStore = updated; }
    );

    assert(
      emptyResult.connected === false,
      'PULL_ONLY refuses to consume Cloud events when local fleet is empty'
    );

    assert(
      emptyResult.message.includes('waiting for at least one local machine'),
      'Empty-fleet guard returns explicit waiting reason'
    );

    assert(
      eventCalls === eventCallsBeforeEmpty,
      'Empty-fleet guard performs no GET /sync/events'
    );

    assert(
      ackCalls === ackCallsBeforeEmpty,
      'Empty-fleet guard performs no acknowledgement'
    );

    assert(
      bootstrapCalls === bootstrapCallsBeforeEmpty,
      'Empty-fleet guard performs no bootstrap'
    );

    delete process.env.DESKTOP_SYNC_INITIAL_CURSOR;

    console.log('\n============================================================');
    console.log('ALL PULL_ONLY TESTS PASSED');
    console.log('============================================================');

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));

    delete process.env.DESKTOP_SYNC_MODE;
    delete process.env.CLOUD_API_URL;
    delete process.env.SYNC_CLIENT_ID;
    delete process.env.SYNC_CLIENT_SECRET;
    delete process.env.DESKTOP_SYNC_ENABLED;
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});

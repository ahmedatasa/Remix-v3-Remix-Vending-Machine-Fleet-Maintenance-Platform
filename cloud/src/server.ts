import http from 'http';

import { createCloudApp } from './app';
import { cloudConfig } from './config/cloudConfig';
import { initializeCloudRepository } from './repositories';

export { createCloudApp } from './app';

export {
  initializeCloudRepository,
  getCloudRepository,
  resetActiveRepository
} from './repositories';

export {
  CloudDatabase,
  getCloudDb
} from './db/cloudDb';

/**
 * Active HTTP server instance.
 *
 * Used so tests/local development can stop the server cleanly.
 */
let serverInstance: http.Server | null = null;

/**
 * Resolve the HTTP port.
 *
 * Priority:
 *
 * 1. Explicit port passed to startCloudServer()
 * 2. Hosting provider PORT environment variable
 * 3. cloudConfig.port
 *
 * Render and Cloud Run provide process.env.PORT.
 */
function resolveServerPort(explicitPort?: number): number {
  if (
    typeof explicitPort === 'number' &&
    Number.isFinite(explicitPort) &&
    explicitPort > 0
  ) {
    return explicitPort;
  }

  if (process.env.PORT) {
    const parsedPort = Number.parseInt(
      process.env.PORT,
      10
    );

    if (
      Number.isFinite(parsedPort) &&
      parsedPort > 0
    ) {
      return parsedPort;
    }

    throw new Error(
      `INVALID_PORT: process.env.PORT="${process.env.PORT}"`
    );
  }

  const configPort = cloudConfig.port;

  if (
    !Number.isFinite(configPort) ||
    configPort <= 0
  ) {
    throw new Error(
      `INVALID_CLOUD_PORT: ${configPort}`
    );
  }

  return configPort;
}

/**
 * Start standalone Cloud API server.
 *
 * IMPORTANT:
 *
 * Render and Google Cloud Run require the application to bind to:
 *
 *     0.0.0.0
 *
 * and NOT:
 *
 *     127.0.0.1
 *     localhost
 *
 * Binding to 0.0.0.0 makes the HTTP listener reachable by the
 * managed-container ingress / reverse proxy.
 */
export async function startCloudServer(
  port?: number
): Promise<http.Server> {
  const listenPort = resolveServerPort(port);

  /**
   * Explicit IPv4 all-interface binding.
   *
   * Do not replace this with localhost or 127.0.0.1.
   */
  const listenHost = '0.0.0.0';

  // ---------------------------------------------------------------------------
  // 1. Initialize persistence layer before accepting HTTP traffic
  // ---------------------------------------------------------------------------

  console.log(
    '[Cloud Service] Initializing repository before HTTP listener...'
  );

  await initializeCloudRepository();

  console.log(
    '[Cloud Service] Repository initialization completed.'
  );

  // ---------------------------------------------------------------------------
  // 2. Create Express application
  // ---------------------------------------------------------------------------

  const app = createCloudApp();

  // ---------------------------------------------------------------------------
  // 3. Create HTTP server
  // ---------------------------------------------------------------------------

  const server = http.createServer(app);

  /**
   * Reasonable Node HTTP timeout configuration.
   *
   * headersTimeout must remain larger than keepAliveTimeout.
   */
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;

  // ---------------------------------------------------------------------------
  // 4. Start HTTP listener
  // ---------------------------------------------------------------------------

  return new Promise<http.Server>(
    (resolve, reject) => {
      let settled = false;

      const onStartupError = (err: Error) => {
        if (!settled) {
          settled = true;
          reject(err);
        }

        console.error(
          '[Cloud Service] HTTP server error:',
          err
        );
      };

      server.once(
        'error',
        onStartupError
      );

      server.listen(
        listenPort,
        listenHost,
        () => {
          if (settled) {
            return;
          }

          settled = true;

          /**
           * Remove temporary startup error listener.
           * Add persistent runtime error logging below.
           */
          server.removeListener(
            'error',
            onStartupError
          );

          server.on(
            'error',
            (err) => {
              console.error(
                '[Cloud Service] Runtime HTTP server error:',
                err
              );
            }
          );

          serverInstance = server;

          const address = server.address();

          let actualAddress = `${listenHost}:${listenPort}`;

          if (
            address &&
            typeof address !== 'string'
          ) {
            actualAddress =
              `${address.address}:${address.port}`;
          }

          console.log(
            `[Cloud Service] Standalone Cloud API listening on ${actualAddress}`
          );

          console.log(
            `[Cloud Service] Bind host: ${listenHost}`
          );

          console.log(
            `[Cloud Service] Listening port: ${listenPort}`
          );

          console.log(
            `[Cloud Service] Runtime PORT env: ${
              process.env.PORT || 'not-set'
            }`
          );

          console.log(
            '[Cloud Service] HTTP listener is ready to accept connections.'
          );

          resolve(server);
        }
      );
    }
  );
}

/**
 * Stop Cloud HTTP server gracefully.
 */
export function stopCloudServer(): Promise<void> {
  return new Promise(
    (resolve, reject) => {
      if (!serverInstance) {
        resolve();
        return;
      }

      const serverToClose = serverInstance;

      serverToClose.close(
        (err?: Error) => {
          if (err) {
            console.error(
              '[Cloud Service] Error while stopping server:',
              err
            );

            reject(err);
            return;
          }

          serverInstance = null;

          console.log(
            '[Cloud Service] Server stopped.'
          );

          resolve();
        }
      );
    }
  );
}

/**
 * Auto-start only when this file/bundle is executed directly.
 *
 * Supported:
 *
 * cloud/src/server.ts
 * dist/cloud-server.cjs
 *
 * Importing this module during tests must NOT automatically
 * start an HTTP listener.
 */
const executablePath =
  process.argv[1] || '';

const isDirectCliExecution =
  executablePath.endsWith(
    'cloud/src/server.ts'
  ) ||
  executablePath.endsWith(
    'cloud-server.cjs'
  );

/**
 * TEST_ENV prevents automatic startup in test processes.
 */
if (
  isDirectCliExecution &&
  !process.env.TEST_ENV
) {
  startCloudServer().catch(
    (err: unknown) => {
      const message =
        err instanceof Error
          ? err.message
          : String(err);

      console.error(
        `Fatal error starting Cloud Server: ${message}`
      );

      if (
        err instanceof Error &&
        err.stack
      ) {
        console.error(err.stack);
      }

      process.exit(1);
    }
  );
}
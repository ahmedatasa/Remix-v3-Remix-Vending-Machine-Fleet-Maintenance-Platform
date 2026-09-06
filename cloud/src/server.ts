import http from 'http';
import { createCloudApp } from './app';
import { cloudConfig } from './config/cloudConfig';
import { initializeCloudRepository } from './repositories';

let serverInstance: http.Server | null = null;

export async function startCloudServer(port?: number): Promise<http.Server> {
  const listenPort = port || cloudConfig.port;

  // Initialize active repository (Postgres or JSON Dev)
  await initializeCloudRepository();

  return new Promise((resolve, reject) => {
    const app = createCloudApp();

    const server = http.createServer(app);
    server.listen(listenPort, '0.0.0.0', () => {
      console.log(`[Cloud Service] Standalone Cloud API running on port ${listenPort} (URL: http://127.0.0.1:${listenPort})`);
      serverInstance = server;
      resolve(server);
    });

    server.on('error', (err) => {
      console.error('[Cloud Service] Server listen error:', err);
      reject(err);
    });
  });
}

export function stopCloudServer(): Promise<void> {
  return new Promise((resolve) => {
    if (serverInstance) {
      serverInstance.close(() => {
        console.log('[Cloud Service] Server stopped.');
        serverInstance = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

// Auto-start if run directly from CLI (standalone cloud server)
const isDirectCliExecution =
  Boolean(process.argv[1] &&
  (process.argv[1].endsWith('cloud/src/server.ts') ||
   process.argv[1].endsWith('cloud-server.cjs')));

if (isDirectCliExecution && !process.env.TEST_ENV) {
  startCloudServer().catch(err => {
    console.error('Fatal error starting Cloud Server:', err);
    process.exit(1);
  });
}

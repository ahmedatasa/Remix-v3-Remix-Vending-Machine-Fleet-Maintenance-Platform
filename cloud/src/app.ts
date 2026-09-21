import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { securityHeaders, cloudCors } from './middleware/securityHeaders';
import { publicRoutes } from './routes/publicRoutes';
import { technicianRoutes } from './routes/technicianRoutes';
import { syncRoutes } from './routes/syncRoutes';
import { locationRoutes } from './routes/locationRoutes';
import { ticketManagementRoutes } from './routes/ticketManagementRoutes';
import { cloudConfig } from './config/cloudConfig';
import { cloudStorage } from './storage/cloudStorage';

export function createCloudApp(): express.Express {
  const app = express();

  // Trust proxy for secure headers and IP resolution
  app.set('trust proxy', 1);

  // Apply Security Headers and CORS
  app.use(securityHeaders);
  app.use(cloudCors);

  // Body parser with 15MB limit for evidence images
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // Evidence read-through. Object storage remains private; Cloud reads the
  // object with server credentials and streams it to the browser.
  app.get('/cloud-storage/*', async (req: Request, res: Response) => {
    const rawKey = String(req.params[0] || '');
    let objectKey = rawKey;
    try {
      objectKey = decodeURIComponent(rawKey).replace(/^\/+/, '');
    } catch {
      return res.status(400).json({
        error: 'INVALID_STORAGE_KEY',
        message: 'مسار ملف الدليل غير صالح.'
      });
    }

    if (
      !objectKey.startsWith('evidence/') ||
      objectKey.includes('..') ||
      objectKey.includes('\\')
    ) {
      return res.status(400).json({
        error: 'INVALID_STORAGE_KEY',
        message: 'مسار ملف الدليل غير صالح.'
      });
    }

    try {
      const stored = await cloudStorage.getObject(objectKey);
      res.setHeader('Content-Type', stored.mimeType);
      res.setHeader('Content-Length', String(stored.sizeBytes));
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.status(200).send(stored.buffer);
    } catch (err: any) {
      const message = String(err?.message || '');
      if (message.startsWith('STORAGE_OBJECT_NOT_FOUND:')) {
        return res.status(404).json({
          error: 'STORAGE_OBJECT_NOT_FOUND',
          message: 'ملف الدليل المطلوب غير موجود.'
        });
      }
      if (message.startsWith('INVALID_STORAGE_KEY:')) {
        return res.status(400).json({
          error: 'INVALID_STORAGE_KEY',
          message: 'مسار ملف الدليل غير صالح.'
        });
      }
      console.error('[CloudStorage ReadThrough] Error:', message || err);
      return res.status(503).json({
        error: 'STORAGE_SERVICE_UNAVAILABLE',
        message: 'تعذر قراءة المرفق من خادم التخزين السحابي.'
      });
    }
  });

  // Health check endpoint (Liveness)
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'HEALTHY',
      ok: true,
      service: 'vending-cloud',
      version: '5.0.0',
      time: new Date().toISOString()
    });
  });

  // Readiness check endpoint
  app.get('/ready', async (req: Request, res: Response) => {
    try {
      const repo = (await import('./repositories')).getCloudRepository();
      const health = await repo.checkHealth();
      if (health.healthy) {
        res.json({
          status: 'ready',
          service: 'ksu-vending-cloud',
          persistence: repo.providerType,
          storage: cloudConfig.storageProvider,
          time: new Date().toISOString()
        });
      } else {
        res.status(503).json({
          status: 'degraded',
          service: 'ksu-vending-cloud',
          error: 'DATABASE_UNAVAILABLE',
          time: new Date().toISOString()
        });
      }
    } catch (err: any) {
      res.status(503).json({
        status: 'not_ready',
        service: 'ksu-vending-cloud',
        error: 'SERVICE_INITIALIZING',
        time: new Date().toISOString()
      });
    }
  });

  // Mount API routes
  app.use(publicRoutes);
  app.use(technicianRoutes);
  app.use(syncRoutes);
  app.use(locationRoutes);
  app.use(ticketManagementRoutes);

  // Catch-all 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'ROUTE_NOT_FOUND',
      message: `المسار المطلوب ${req.method} ${req.path} غير متاح في البوابة السحابية.`
    });
  });

  // Global Error Handler (Hides internal stack traces)
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const errorId = `err-${Date.now()}`;
    console.error(`[CloudApp Error ${errorId}]:`, err?.message || err);
    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      errorId,
      message: 'حدث خطأ غير متوقع في البوابة السحابية. تم تسجيل المعرف للمراجعة.'
    });
  });

  return app;
}

import http from 'http';
import https from 'https';
import crypto from 'crypto';

export interface SyncWorkerOptions {
  enabled?: boolean;
  cloudApiUrl?: string;
  syncClientId?: string;
  syncClientSecret?: string;
  intervalSeconds?: number;
}

export interface SyncResult {
  connected: boolean;
  message: string;
  syncedEventsCount: number;
  bootstrappedMachinesCount?: number;
}

class DesktopSyncWorker {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isSyncing = false;
  private isPaused = false;
  private getStore: () => any = () => ({});
  private saveStore: (store: any) => void = () => {};

  public getOptions(): Required<SyncWorkerOptions> {
    return {
      enabled: (process.env.DESKTOP_SYNC_ENABLED || 'true').trim().toLowerCase() !== 'false',
      cloudApiUrl: (process.env.CLOUD_API_URL || 'http://127.0.0.1:3001').trim().replace(/\/+$/, ''),
      syncClientId: (process.env.SYNC_CLIENT_ID || 'ksu-desktop-sync-client-2026').trim(),
      syncClientSecret: (process.env.SYNC_CLIENT_SECRET || '').trim(),
      intervalSeconds: parseInt(process.env.SYNC_INTERVAL || '60', 10)
    };
  }

  public pause(): void {
    this.isPaused = true;
    console.log('[DesktopSync] Background worker paused.');
  }

  public resume(force = true): Promise<SyncResult> | void {
    this.isPaused = false;
    console.log('[DesktopSync] Background worker resumed.');
    if (this.getStore && this.saveStore && force) {
      return this.syncOnce(this.getStore, this.saveStore);
    }
  }

  public getIsPaused(): boolean {
    return this.isPaused;
  }

  /**
   * Safe low-level HTTP/HTTPS request helper
   */
  private makeRequest(
    method: string,
    urlStr: string,
    headers: Record<string, string>,
    body?: any
  ): Promise<{ statusCode: number; data: any }> {
    return new Promise((resolve, reject) => {
      try {
        const parsedUrl = new URL(urlStr);
        const isHttps = parsedUrl.protocol === 'https:';
        const client = isHttps ? https : http;

        const payload = body ? JSON.stringify(body) : null;
        const reqHeaders: Record<string, string | number> = {
          ...headers,
          Accept: 'application/json'
        };

        if (payload) {
          reqHeaders['Content-Type'] = 'application/json';
          reqHeaders['Content-Length'] = Buffer.byteLength(payload);
        }

        const req = client.request(
          {
            protocol: parsedUrl.protocol,
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: `${parsedUrl.pathname}${parsedUrl.search}`,
            method,
            headers: reqHeaders,
            timeout: 8000 // 8s timeout
          },
          (res) => {
            let resData = '';
            res.on('data', (chunk) => {
              resData += chunk;
            });
            res.on('end', () => {
              try {
                const parsed = resData ? JSON.parse(resData) : null;
                resolve({ statusCode: res.statusCode || 200, data: parsed });
              } catch {
                resolve({ statusCode: res.statusCode || 200, data: resData });
              }
            });
          }
        );

        req.on('error', (err) => {
          reject(err);
        });

        req.on('timeout', () => {
          req.destroy(new Error('Sync request timed out after 8000ms'));
        });

        if (payload) {
          req.write(payload);
        }
        req.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Perform a single sync cycle between Cloud and Desktop.
   * NEVER overwrites or deletes local machines. Local fleet remains authoritative.
   */
  public async syncOnce(getStore: () => any, saveStore: (store: any) => void): Promise<SyncResult> {
    const opts = this.getOptions();

    if (!opts.enabled) {
      return {
        connected: false,
        message: 'Desktop sync is disabled by DESKTOP_SYNC_ENABLED=false',
        syncedEventsCount: 0
      };
    }

    if (this.isSyncing) {
      return { connected: false, message: 'Sync cycle already in progress', syncedEventsCount: 0 };
    }

    this.isSyncing = true;

    if (!opts.syncClientSecret) {
      this.isSyncing = false;
      return {
        connected: false,
        message: 'Sync secret is not configured in environment (SYNC_CLIENT_SECRET is missing)',
        syncedEventsCount: 0
      };
    }

    try {
      const store = getStore();
      if (!store || !Array.isArray(store.machines)) {
        return { connected: false, message: 'Local store not initialized', syncedEventsCount: 0 };
      }

      // 1. Safety check: ensure fleet has at least baseline 189 machines
      const machineCountBefore = store.machines.length;
      if (machineCountBefore < 189) {
        console.error(`[DesktopSync] CRITICAL SAFETY HALT: Machine count is ${machineCountBefore}, less than baseline 189.`);
        return { connected: false, message: `CRITICAL SAFETY HALT: Machine count ${machineCountBefore} < baseline 189`, syncedEventsCount: 0 };
      }

      // 2. Health check to Cloud API
      try {
        const healthRes = await this.makeRequest('GET', `${opts.cloudApiUrl}/health`, {});
        if (healthRes.statusCode !== 200) {
          return {
            connected: false,
            message: `Cloud API returned non-200 status: ${healthRes.statusCode}`,
            syncedEventsCount: 0
          };
        }
      } catch (err: any) {
        // Cloud is offline or unreachable - Graceful fallback
        return {
          connected: false,
          message: `Cloud service unreachable (${err.message || 'connection failed'}). Running in local offline desktop mode without interruption.`,
          syncedEventsCount: 0
        };
      }

      const syncHeaders = {
        'x-sync-client-id': opts.syncClientId,
        'x-sync-client-secret': opts.syncClientSecret
      };

      // 3. Bootstrap / synchronize sanitized machine registry to Cloud
      // Prepares strictly sanitized public representations (NO serial numbers, NO costs, NO users)
      const sanitizedMachines = store.machines.map((m: any) => ({
        integrationMachineId: m.id || m.publicId || m.machineNumber,
        publicQrToken: m.publicQrToken || m.publicQrId || m.publicId || m.machineNumber,
        machineNumber: m.machineNumber,
        model: m.model,
        machineType: m.machineType || 'VENDING_MACHINE',
        publicDisplayName: `${m.machineNumber} (${m.model || m.machineType || 'Vending'})`,
        buildingPublicName: m.currentLocation?.building?.name || 'مبنى الماكينة',
        locationPublicName: m.currentLocation?.fullDescription || 'موقع الماكينة',
        latitude: typeof m.currentLocation?.latitude === 'number' ? m.currentLocation.latitude : (typeof m.latitude === 'number' ? m.latitude : null),
        longitude: typeof m.currentLocation?.longitude === 'number' ? m.currentLocation.longitude : (typeof m.longitude === 'number' ? m.longitude : null),
        active: m.status !== 'DECOMMISSIONED'
      }));

      // Synchronize technician credentials (bcrypt hash only)
      const techniciansPayload = (store.technicians || []).map((t: any) => {
        const user = (store.users || []).find((u: any) => u.id === t.userId || u.email?.toLowerCase() === t.email?.toLowerCase());
        return {
          id: t.id,
          employeeCode: t.employeeCode,
          fullName: t.fullName || t.name,
          email: t.email,
          phone: t.phone || t.phoneNumber,
          passwordHash: user?.passwordHash || '',
          status: t.status,
          specialization: t.specialization
        };
      });

      let bootstrappedCount = 0;
      try {
        const bootstrapRes = await this.makeRequest('POST', `${opts.cloudApiUrl}/sync/bootstrap`, syncHeaders, {
          machines: sanitizedMachines,
          technicians: techniciansPayload
        });
        if (bootstrapRes.statusCode === 200 && bootstrapRes.data?.synchronizedMachines) {
          bootstrappedCount = bootstrapRes.data.synchronizedMachines;
          // Mark pending local MACHINE_CREATED sync events as SYNCED
          if (Array.isArray(store.syncQueue)) {
            const now = new Date().toISOString();
            store.syncQueue.forEach((e: any) => {
              if (e.eventType === 'MACHINE_CREATED' && e.syncStatus === 'PENDING') {
                e.syncStatus = 'SYNCED';
                e.processedAt = now;
              }
            });
            saveStore(store);
          }
        }
      } catch (err: any) {
        console.warn('[DesktopSync] Bootstrap synchronization warning:', err.message);
      }

      // 4. Pull pending events from Cloud cursor
      if (!Array.isArray(store.processedSyncEventIds)) {
        store.processedSyncEventIds = [];
      }
      const processedIds = new Set(store.processedSyncEventIds);
      const cursor = typeof store.lastCloudSyncCursor === 'number' ? store.lastCloudSyncCursor : 0;

      const eventsRes = await this.makeRequest('GET', `${opts.cloudApiUrl}/sync/events?after=${cursor}&limit=50`, syncHeaders);
      if (eventsRes.statusCode !== 200 || !eventsRes.data?.events) {
        return {
          connected: true,
          message: 'Connected to Cloud, but failed to fetch sync events',
          syncedEventsCount: 0,
          bootstrappedMachinesCount: bootstrappedCount
        };
      }

      const events: any[] = eventsRes.data.events;
      const eventIdsToAck: string[] = [];
      let appliedCount = 0;

      if (!Array.isArray(store.tickets)) {
        store.tickets = [];
      }
      if (!Array.isArray(store.partRequests)) {
        store.partRequests = [];
      }

      // Process events idempotently
      for (const evt of events) {
        eventIdsToAck.push(evt.eventId);

        if (processedIds.has(evt.eventId)) {
          // Already applied in a previous cycle
          continue;
        }

        switch (evt.eventType) {
          case 'CUSTOMER_TICKET_CREATED': {
            const p = evt.payload;
            // Check if ticket already exists locally via cloudReportId or publicTrackingToken
            const exists = store.tickets.find((t: any) =>
              (p.cloudReportId && t.cloudReportId === p.cloudReportId) ||
              (p.trackingToken && t.publicTrackingToken === p.trackingToken)
            );

            if (!exists) {
              // Locate associated local machine
              const machine = store.machines.find((m: any) =>
                m.id === p.integrationMachineId ||
                m.publicQrToken === p.publicQrToken ||
                m.publicQrId === p.publicQrToken ||
                m.publicId === p.publicQrToken ||
                m.machineNumber === p.publicQrToken
              );

              // Generate sequential local ticket number
              const count = store.tickets.length + 1;
              const nextNum = `TCK-2026-${String(count).padStart(4, '0')}`;

              const newLocalTicket = {
                id: `tck-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
                ticketNumber: nextNum,
                cloudTicketId: p.ticketId,
                cloudReportId: p.cloudReportId,
                publicTrackingToken: p.trackingToken,
                machineId: machine?.id || p.integrationMachineId,
                machineNumber: machine?.machineNumber || p.publicQrToken,
                machine: machine ? {
                  id: machine.id,
                  machineNumber: machine.machineNumber,
                  serialNumber: machine.serialNumber,
                  machineType: machine.machineType,
                  currentLocation: machine.currentLocation
                } : undefined,
                title: `عطل مُبلغ عنه: ${p.category || 'صيانة عامة'}`,
                description: p.description,
                category: p.category || 'OTHER',
                priority: 'MEDIUM',
                status: 'OPEN',
                reporterName: p.reporterName,
                reporterPhone: p.reporterPhone,
                reporterEmail: p.reporterEmail,
                source: 'PUBLIC_QR',
                createdAt: p.createdAt || evt.createdAt,
                updatedAt: evt.createdAt,
                actions: [],
                evidence: [],
                checkins: [],
                functionalTests: []
              };

              store.tickets.unshift(newLocalTicket);
              appliedCount++;
            }
            break;
          }

          case 'TECHNICIAN_CHECKIN': {
            const p = evt.payload;
            const ticket = store.tickets.find((t: any) =>
              t.id === p.ticketId ||
              t.cloudTicketId === p.ticketId ||
              t.cloudReportId === p.ticketId ||
              t.publicTrackingToken === p.ticketId
            );
            if (ticket) {
              if (!Array.isArray(ticket.checkins)) ticket.checkins = [];
              ticket.checkins.push(p.checkin);
              if (ticket.status === 'OPEN') {
                ticket.status = 'IN_PROGRESS';
              }
              ticket.updatedAt = p.updatedAt || evt.createdAt;
              appliedCount++;
            }
            break;
          }

          case 'TECHNICIAN_ACTION': {
            const p = evt.payload;
            const ticket = store.tickets.find((t: any) =>
              t.id === p.ticketId ||
              t.cloudTicketId === p.ticketId ||
              t.cloudReportId === p.ticketId ||
              t.publicTrackingToken === p.ticketId
            );
            if (ticket) {
              if (!Array.isArray(ticket.actions)) ticket.actions = [];
              ticket.actions.push(p.action);
              ticket.updatedAt = p.updatedAt || evt.createdAt;
              appliedCount++;
            }
            break;
          }

          case 'EVIDENCE_ADDED': {
            const p = evt.payload;
            const ticket = store.tickets.find((t: any) =>
              t.id === p.ticketId ||
              t.cloudTicketId === p.ticketId ||
              t.cloudReportId === p.ticketId ||
              t.publicTrackingToken === p.ticketId
            );
            if (ticket) {
              if (!Array.isArray(ticket.evidence)) ticket.evidence = [];
              ticket.evidence.push(p.evidence);
              ticket.updatedAt = p.updatedAt || evt.createdAt;
              appliedCount++;
            }
            break;
          }

          case 'FUNCTIONAL_TEST_COMPLETED': {
            const p = evt.payload;
            const ticket = store.tickets.find((t: any) =>
              t.id === p.ticketId ||
              t.cloudTicketId === p.ticketId ||
              t.cloudReportId === p.ticketId ||
              t.publicTrackingToken === p.ticketId
            );
            if (ticket) {
              if (!Array.isArray(ticket.functionalTests)) ticket.functionalTests = [];
              ticket.functionalTests.push(p.functionalTest);
              ticket.updatedAt = p.updatedAt || evt.createdAt;
              appliedCount++;
            }
            break;
          }

          case 'PART_REQUEST_CREATED': {
            const p = evt.payload;
            const reqRecord = p.partRequest;
            // Record in global store.partRequests with status REQUESTED
            const exists = store.partRequests.find((r: any) => r.id === reqRecord.id);
            if (!exists) {
              store.partRequests.unshift({
                ...reqRecord,
                status: 'REQUESTED' // Never directly alters inventory stock from field!
              });
              appliedCount++;
            }
            break;
          }

          case 'TICKET_RESOLVED': {
            const p = evt.payload;
            const ticket = store.tickets.find((t: any) =>
              t.id === p.ticketId ||
              t.cloudTicketId === p.ticketId ||
              t.cloudReportId === p.ticketId ||
              t.publicTrackingToken === p.ticketId
            );
            if (ticket) {
              ticket.status = 'RESOLVED';
              ticket.resolutionSummary = p.resolutionSummary;
              ticket.resolvedBy = p.resolvedBy;
              ticket.resolvedAt = p.resolvedAt;
              ticket.updatedAt = p.resolvedAt || evt.createdAt;
              appliedCount++;
            }
            break;
          }
        }

        // Mark as processed
        store.processedSyncEventIds.push(evt.eventId);
        processedIds.add(evt.eventId);
        if (typeof evt.cursor === 'number' && evt.cursor > cursor) {
          store.lastCloudSyncCursor = evt.cursor;
        }
      }

      // Trim processed event IDs to prevent unbounded memory growth (keep last 2000)
      if (store.processedSyncEventIds.length > 2000) {
        store.processedSyncEventIds = store.processedSyncEventIds.slice(-2000);
      }

      // Authoritative persistence via injected store manager abstraction
      if (appliedCount > 0 || events.length > 0) {
        saveStore(store);
      }

      // 5. Acknowledge processed events on Cloud
      if (eventIdsToAck.length > 0) {
        try {
          await this.makeRequest('POST', `${opts.cloudApiUrl}/sync/ack`, syncHeaders, {
            eventIds: eventIdsToAck
          });
        } catch (ackErr: any) {
          console.warn('[DesktopSync] Acknowledgement notice:', ackErr.message);
        }
      }

      // Safety verification: confirm local machines were not mutated or lost during event processing
      if (store.machines.length !== machineCountBefore) {
        console.error(`[DesktopSync] CRITICAL SAFETY HALT: Post-sync machine count is ${store.machines.length}, expected ${machineCountBefore}.`);
        throw new Error(`CRITICAL: Machine count changed from ${machineCountBefore} to ${store.machines.length} during sync.`);
      }

      return {
        connected: true,
        message: `Sync completed successfully. Synced ${appliedCount} updates.`,
        syncedEventsCount: appliedCount,
        bootstrappedMachinesCount: bootstrappedCount
      };
    } catch (err: any) {
      console.error('[DesktopSync] Error during sync cycle:', err);
      return {
        connected: false,
        message: `Sync error: ${err.message}`,
        syncedEventsCount: 0
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Start recurring background worker
   */
  public start(getStore: () => any, saveStore: (store: any) => void): void {
    if (this.isRunning) return;

    const opts = this.getOptions();
    if (!opts.enabled) {
      console.log('[DesktopSync] Background worker disabled by DESKTOP_SYNC_ENABLED=false.');
      return;
    }

    this.isRunning = true;
    this.getStore = getStore;
    this.saveStore = saveStore;

    console.log(`[DesktopSync] Background worker started. Polling ${opts.cloudApiUrl} every ${opts.intervalSeconds}s.`);

    // Run initial sync cycle after 2 seconds
    setTimeout(() => {
      this.syncOnce(this.getStore, this.saveStore).catch((err) => {
        console.warn('[DesktopSync] Initial sync attempt notice:', err.message);
      });
    }, 2000);

    this.timer = setInterval(() => {
      if (this.isPaused) return;
      this.syncOnce(this.getStore, this.saveStore).catch((err) => {
        console.warn('[DesktopSync] Recurring sync cycle notice:', err.message);
      });
    }, opts.intervalSeconds * 1000);
    this.timer.unref?.();
  }

  /**
   * Stop background worker
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    console.log('[DesktopSync] Background worker stopped.');
  }
}

export const desktopSyncWorker = new DesktopSyncWorker();

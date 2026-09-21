import http from 'http';
import https from 'https';
import crypto from 'crypto';

export type SyncMode = 'FULL' | 'PULL_ONLY';

export interface SyncWorkerOptions {
  enabled?: boolean;
  mode?: SyncMode;
  cloudApiUrl?: string;
  syncClientId?: string;
  syncClientSecret?: string;
  intervalSeconds?: number;
  initialCursor?: number;
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
    const rawMode = (process.env.DESKTOP_SYNC_MODE || 'FULL').trim().toUpperCase();
    const mode: SyncMode = rawMode === 'PULL_ONLY' ? 'PULL_ONLY' : 'FULL';

    return {
      enabled: (process.env.DESKTOP_SYNC_ENABLED || 'true').trim().toLowerCase() !== 'false',
      mode,
      cloudApiUrl: (process.env.CLOUD_API_URL || 'http://127.0.0.1:3001').trim().replace(/\/+$/, ''),
      syncClientId: (process.env.SYNC_CLIENT_ID || 'ksu-desktop-sync-client-2026').trim(),
      syncClientSecret: (process.env.SYNC_CLIENT_SECRET || '').trim(),
      intervalSeconds: parseInt(process.env.SYNC_INTERVAL || '60', 10),
      initialCursor: Math.max(0, parseInt(process.env.DESKTOP_SYNC_INITIAL_CURSOR || '0', 10) || 0)
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
      // Normalize Cloud field-work data into the shapes expected by Main UI.
      // This also backfills already-synchronized evidence/tests without asking
      // the technician to upload or test again.
      let repairedEvidenceUrls = 0;
      const toEvidenceBrowserUrl = (objectKey: string): string =>
        `/cloud-storage/${String(objectKey)
          .replace(/^\/+/, '')
          .split('/')
          .map((segment) => encodeURIComponent(segment))
          .join('/')}`;

      const normalizeFunctionalTest = (rawTest: any) => {
        const rawType = String(rawTest?.testType || 'OPERATIONAL').toUpperCase();
        const typeMap: Record<string, string> = {
          DISPENSE_TEST: 'DISPENSING',
          DISPENSING: 'DISPENSING',
          PAYMENT: 'PAYMENT',
          COOLING: 'COOLING',
          DISPLAY: 'DISPLAY',
          NETWORK: 'NETWORK',
          OPERATIONAL: 'OPERATIONAL',
          ALL: 'ALL'
        };
        return {
          status: rawTest?.passed === true ? 'PASSED' : rawTest?.passed === false ? 'FAILED' : 'NOT_REQUIRED',
          testType: typeMap[rawType] || 'OPERATIONAL',
          notes: String(rawTest?.notes || ''),
          performedBy: rawTest?.technicianName || rawTest?.performedBy || 'TECHNICIAN',
          performedAt: rawTest?.timestamp || rawTest?.performedAt || new Date().toISOString()
        };
      };

      const ensureFunctionalTestPresentation = (ticket: any, rawTest: any): boolean => {
        if (!rawTest) return false;
        let changed = false;
        const normalized = normalizeFunctionalTest(rawTest);

        const current = ticket.functionalTest;
        if (
          !current ||
          current.status !== normalized.status ||
          current.testType !== normalized.testType ||
          current.notes !== normalized.notes ||
          current.performedAt !== normalized.performedAt
        ) {
          ticket.functionalTest = normalized;
          changed = true;
        }

        if (!Array.isArray(ticket.timeline)) ticket.timeline = [];
        const testId = rawTest.id || `${rawTest.ticketId || ticket.id}-${normalized.performedAt}`;
        const timelineId = `tml-functional-${testId}`;
        if (!ticket.timeline.some((item: any) => item.id === timelineId)) {
          ticket.timeline.push({
            id: timelineId,
            ticketId: ticket.id,
            timestamp: normalized.performedAt,
            technicianName: rawTest.technicianName || rawTest.performedBy,
            technicianId: rawTest.technicianId,
            action: 'ACTION_ADDED',
            actionLabel: 'الفحص التشغيلي',
            description: `نتيجة الفحص التشغيلي: ${normalized.status === 'PASSED' ? 'ناجح' : normalized.status === 'FAILED' ? 'راسب' : 'غير مطلوب'}${normalized.notes ? ` — ${normalized.notes}` : ''}`,
            metadata: {
              source: 'CLOUD_FUNCTIONAL_TEST',
              cloudTestId: rawTest.id,
              testType: rawTest.testType,
              passed: rawTest.passed
            }
          });
          changed = true;
        }
        return changed;
      };

      const ensureEvidencePresentation = (ticket: any, evidence: any): boolean => {
        if (!evidence) return false;
        let changed = false;

        const browserUrl = evidence.objectKey
          ? toEvidenceBrowserUrl(evidence.objectKey)
          : String(evidence.fileUrl || evidence.url || '');

        if (browserUrl && (evidence.url !== browserUrl || evidence.fileUrl !== browserUrl)) {
          evidence.url = browserUrl;
          evidence.fileUrl = browserUrl;
          changed = true;
        }

        evidence.fileType = evidence.fileType || evidence.mimeType || 'image/jpeg';
        evidence.createdAt = evidence.createdAt || evidence.timestamp || ticket.updatedAt || new Date().toISOString();
        evidence.uploadStatus = evidence.uploadStatus || 'SYNCED';
        evidence.evidenceType = evidence.evidenceType || 'OTHER';

        if (!Array.isArray(ticket.attachments)) ticket.attachments = [];
        const attachmentId = evidence.id || `att-${String(evidence.objectKey || '').replace(/[^a-zA-Z0-9]/g, '').slice(-20)}`;
        const fileName = String(evidence.objectKey || '').split('/').pop() || `${attachmentId}.jpg`;
        const attachment = {
          id: attachmentId,
          ticketId: ticket.id,
          fileName,
          fileType: evidence.fileType,
          fileUrl: browserUrl,
          fileSize: evidence.sizeBytes,
          uploadedBy: evidence.technicianName || 'TECHNICIAN',
          uploaderRole: 'TECHNICIAN',
          caption: evidence.caption || 'صورة توثيقية من الفني',
          createdAt: evidence.createdAt
        };

        const existingAttachment = ticket.attachments.find((a: any) =>
          a.id === attachmentId ||
          (browserUrl && a.fileUrl === browserUrl)
        );
        if (!existingAttachment && browserUrl) {
          ticket.attachments.push(attachment);
          changed = true;
        } else if (existingAttachment && browserUrl && existingAttachment.fileUrl !== browserUrl) {
          existingAttachment.fileUrl = browserUrl;
          changed = true;
        }

        if (!Array.isArray(ticket.timeline)) ticket.timeline = [];
        const timelineId = `tml-evidence-${attachmentId}`;
        if (!ticket.timeline.some((item: any) => item.id === timelineId) && browserUrl) {
          ticket.timeline.push({
            id: timelineId,
            ticketId: ticket.id,
            timestamp: evidence.createdAt,
            technicianName: evidence.technicianName,
            technicianId: evidence.technicianId,
            action: 'PHOTO_UPLOADED',
            actionLabel: 'صورة توثيقية',
            description: evidence.caption || 'تم رفع صورة توثيقية من الفني إلى ملف البلاغ.',
            attachment: {
              id: attachment.id,
              fileName: attachment.fileName,
              fileUrl: attachment.fileUrl,
              fileType: attachment.fileType,
              caption: attachment.caption
            },
            metadata: {
              source: 'CLOUD_EVIDENCE',
              objectKey: evidence.objectKey,
              sha256: evidence.sha256
            }
          });
          changed = true;
        }

        return changed;
      };

      if (Array.isArray(store.tickets)) {
        for (const ticket of store.tickets) {
          if (Array.isArray(ticket.evidence)) {
            for (const evidence of ticket.evidence) {
              if (ensureEvidencePresentation(ticket, evidence)) {
                repairedEvidenceUrls++;
              }
            }
          }

          if (Array.isArray(ticket.functionalTests) && ticket.functionalTests.length > 0) {
            const latestTest = ticket.functionalTests[ticket.functionalTests.length - 1];
            if (ensureFunctionalTestPresentation(ticket, latestTest)) {
              repairedEvidenceUrls++;
            }
          }
        }
      }

      // 1. Capture local fleet size. The >=189 production baseline guard
      // applies only to FULL sync. PULL_ONLY never publishes the local fleet.
      const machineCountBefore = store.machines.length;
      if (opts.mode === 'FULL' && machineCountBefore < 189) {
        console.error(`[DesktopSync] CRITICAL SAFETY HALT: Machine count is ${machineCountBefore}, less than baseline 189.`);
        return { connected: false, message: `CRITICAL SAFETY HALT: Machine count ${machineCountBefore} < baseline 189`, syncedEventsCount: 0 };
      }

      if (opts.mode === 'PULL_ONLY' && machineCountBefore === 0) {
        return {
          connected: false,
          message: 'PULL_ONLY waiting for at least one local machine before consuming Cloud events',
          syncedEventsCount: 0,
          bootstrappedMachinesCount: 0
        };
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

      let bootstrappedCount = 0;
      if (opts.mode === 'FULL') {
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

      } else {
        console.log('[DesktopSync] PULL_ONLY mode: skipping machine/technician bootstrap.');
      }

      // 4. Pull pending events from Cloud cursor
      if (!Array.isArray(store.processedSyncEventIds)) {
        store.processedSyncEventIds = [];
      }
      const processedIds = new Set(store.processedSyncEventIds);
      let cursor = typeof store.lastCloudSyncCursor === 'number' ? store.lastCloudSyncCursor : 0;

      if (
        opts.mode === 'PULL_ONLY' &&
        cursor === 0 &&
        processedIds.size === 0 &&
        opts.initialCursor > 0
      ) {
        cursor = opts.initialCursor;
        store.lastCloudSyncCursor = cursor;
        saveStore(store);
        console.log(`[DesktopSync] PULL_ONLY initialized Cloud cursor at ${cursor}.`);
      }

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

        if (processedIds.has(evt.eventId)) {
          // Already applied in a previous cycle: ACK is safe and idempotent.
          eventIdsToAck.push(evt.eventId);
          if (typeof evt.cursor === 'number' && evt.cursor > cursor) {
            cursor = evt.cursor;
            store.lastCloudSyncCursor = evt.cursor;
          }
          continue;
        }

        let handled = false;

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
            handled = true;
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
              handled = true;
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
              handled = true;
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
              const evidence = { ...p.evidence };
              const exists = ticket.evidence.some((e: any) =>
                (evidence.id && e.id === evidence.id) ||
                (evidence.objectKey && e.objectKey === evidence.objectKey)
              );
              const storedEvidence = exists
                ? ticket.evidence.find((e: any) =>
                    (evidence.id && e.id === evidence.id) ||
                    (evidence.objectKey && e.objectKey === evidence.objectKey)
                  )
                : evidence;

              if (!exists) ticket.evidence.push(storedEvidence);
              ensureEvidencePresentation(ticket, storedEvidence);
              ticket.updatedAt = p.updatedAt || evt.createdAt;
              appliedCount++;
              handled = true;
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
              const rawTest = p.functionalTest;
              const exists = ticket.functionalTests.some((t: any) =>
                rawTest?.id && t.id === rawTest.id
              );
              if (!exists && rawTest) ticket.functionalTests.push(rawTest);
              ensureFunctionalTestPresentation(ticket, rawTest);
              ticket.updatedAt = p.updatedAt || evt.createdAt;
              appliedCount++;
              handled = true;
            }
            break;
          }

          case 'PART_REQUEST_CREATED': {
            const p = evt.payload;
            const reqRecord = p.partRequest;
            const ticket = store.tickets.find((t: any) =>
              t.id === p.ticketId ||
              t.cloudTicketId === p.ticketId ||
              t.cloudReportId === p.ticketId ||
              t.publicTrackingToken === p.ticketId ||
              t.id === reqRecord.ticketId ||
              t.cloudTicketId === reqRecord.ticketId
            );

            const normalizedName = String(reqRecord.partName || '').trim().toLowerCase();
            const matchedPart = (store.spareParts || []).find((part: any) =>
              (reqRecord.partId && (part.id === reqRecord.partId || part.sparePartId === reqRecord.partId)) ||
              (
                normalizedName &&
                String(part.name || part.nameAr || '').trim().toLowerCase() === normalizedName
              )
            );

            const exists = store.partRequests.find((r: any) => r.id === reqRecord.id);
            if (!exists) {
              const quantityRequested = Math.max(1, Number(reqRecord.quantityRequested || 1));
              const createdAt = reqRecord.timestamp || evt.createdAt || new Date().toISOString();
              const requestNumber = reqRecord.requestNumber ||
                `PR-${String(reqRecord.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase()}`;

              store.partRequests.unshift({
                ...reqRecord,
                requestNumber,
                ticketId: ticket?.id || reqRecord.ticketId,
                ticketNumber: ticket?.ticketNumber,
                machineId: ticket?.machineId,
                machineNumber: ticket?.machineNumber,
                partId: matchedPart?.id || reqRecord.partId || undefined,
                sparePartId: matchedPart?.id || reqRecord.partId || undefined,
                sparePart: matchedPart || undefined,
                part: matchedPart || undefined,
                partNumber: matchedPart?.partNumber || matchedPart?.code || undefined,
                partName: reqRecord.partName,
                isCustomNonCatalog: !matchedPart,
                quantity: quantityRequested,
                quantityRequested,
                reason: reqRecord.reason || '',
                notes: reqRecord.reason || '',
                status: 'REQUESTED',
                createdAt,
                requestedAt: createdAt,
                timeline: [{
                  status: 'REQUESTED',
                  timestamp: createdAt,
                  actor: reqRecord.technicianName || 'TECHNICIAN',
                  comment: reqRecord.reason || `طلب قطعة غيار: ${reqRecord.partName}`
                }]
              });

              if (ticket && !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(ticket.status)) {
                ticket.status = 'WAITING_FOR_PART';
                ticket.updatedAt = createdAt;
                if (!Array.isArray(ticket.timeline)) ticket.timeline = [];
                ticket.timeline.push({
                  id: `tml-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
                  ticketId: ticket.id,
                  timestamp: createdAt,
                  action: 'PART_REQUESTED',
                  actionLabel: 'بانتظار قطعة غيار',
                  description: `طلب الفني قطعة الغيار (${reqRecord.partName}) وأصبحت التذكرة بانتظار معالجة المستودع.`
                });
              }

              appliedCount++;
            }
            handled = true;
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
              handled = true;
            }
            break;
          }
        }

        if (!handled) {
          console.warn(
            `[DesktopSync] Event ${evt.eventId} (${evt.eventType}) at cursor ${evt.cursor} was not safely handled. ` +
            'Stopping this sync batch without ACK or cursor advancement.'
          );
          break;
        }

        eventIdsToAck.push(evt.eventId);

        // Mark as processed
        store.processedSyncEventIds.push(evt.eventId);
        processedIds.add(evt.eventId);
        if (typeof evt.cursor === 'number' && evt.cursor > cursor) {
          cursor = evt.cursor;
          store.lastCloudSyncCursor = evt.cursor;
        }
      }

      // Trim processed event IDs to prevent unbounded memory growth (keep last 2000)
      if (store.processedSyncEventIds.length > 2000) {
        store.processedSyncEventIds = store.processedSyncEventIds.slice(-2000);
      }

      // Authoritative persistence via injected store manager abstraction
      if (appliedCount > 0 || events.length > 0 || repairedEvidenceUrls > 0) {
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

    console.log(`[DesktopSync] Background worker started in ${opts.mode} mode. Polling ${opts.cloudApiUrl} every ${opts.intervalSeconds}s.`);

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

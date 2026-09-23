export type CloudManualTicketSyncResult = {
  status: 'SYNCED' | 'FAILED';
  reason?: string;
  cloudTicketId?: string;
  cloudReportId?: string;
  publicTrackingToken?: string;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function getRetryDelayMs(
  response: Response,
  attempt: number
): number {
  const retryAfter = response.headers.get('retry-after');

  if (retryAfter) {
    const seconds = Number(retryAfter);

    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(
        30000,
        Math.max(500, seconds * 1000)
      );
    }

    const retryDate = Date.parse(retryAfter);

    if (Number.isFinite(retryDate)) {
      return Math.min(
        30000,
        Math.max(500, retryDate - Date.now())
      );
    }
  }

  const resetHeader =
    response.headers.get('x-ratelimit-reset');

  if (resetHeader) {
    const resetSeconds = Number(resetHeader);

    if (Number.isFinite(resetSeconds)) {
      const delay =
        (resetSeconds * 1000) - Date.now() + 250;

      if (delay > 0) {
        return Math.min(30000, delay);
      }
    }
  }

  return (
    1000 * Math.pow(2, attempt) +
    Math.floor(Math.random() * 250)
  );
}

export async function syncManualTicketToCloud(
  req: any,
  ticket: any,
  machine: any
): Promise<CloudManualTicketSyncResult> {
  const base =
    (process.env.CLOUD_API_URL || '')
      .trim()
      .replace(/\/+$/, '');

  const clientId =
    (
      process.env.SYNC_CLIENT_ID ||
      'ksu-desktop-sync-client-2026'
    ).trim();

  const clientSecret =
    (process.env.SYNC_CLIENT_SECRET || '').trim();

  if (!base || !clientId || !clientSecret) {
    return {
      status: 'FAILED',
      reason: 'CLOUD_SYNC_NOT_CONFIGURED'
    };
  }

  const actor = req?.user || {};

  const actorId =
    String(actor.id || '').trim();

  const actorName =
    String(
      actor.fullName ||
      actor.name ||
      actor.username ||
      actorId
    ).trim();

  const actorRole =
    String(actor.role || '')
      .trim()
      .toUpperCase();

  if (!actorId || !actorName || !actorRole) {
    return {
      status: 'FAILED',
      reason: 'MANUAL_TICKET_ACTOR_REQUIRED'
    };
  }

  const machineId =
    String(machine?.id || '').trim();

  const publicQrToken =
    String(machine?.publicQrToken || '').trim();

  if (!machineId || !publicQrToken) {
    return {
      status: 'FAILED',
      reason: 'MACHINE_CLOUD_IDENTITY_MISSING'
    };
  }

  let parsed: URL;

  try {
    parsed = new URL(base);
  } catch {
    return {
      status: 'FAILED',
      reason: 'UNSAFE_CLOUD_URL'
    };
  }

  const localHttp =
    parsed.protocol === 'http:' &&
    [
      'localhost',
      '127.0.0.1',
      '[::1]'
    ].includes(parsed.hostname);

  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (
      parsed.protocol !== 'https:' &&
      !localHttp
    )
  ) {
    return {
      status: 'FAILED',
      reason: 'UNSAFE_CLOUD_URL'
    };
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => controller.abort(),
        30000
      );

    try {
      const response =
        await fetch(
          `${base}/sync/manual-ticket`,
          {
            method: 'POST',
            redirect: 'error',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'x-sync-client-id': clientId,
              'x-sync-client-secret': clientSecret
            },
            body: JSON.stringify({
              mainTicketId:
                ticket.id,

              mainTicketNumber:
                ticket.ticketNumber,

              integrationMachineId:
                machineId,

              publicQrToken,

              category:
                ticket.category || 'OTHER',

              description:
                ticket.description ||
                'Manual ticket entry',

              reporterName:
                ticket.reporterName ||
                actor.fullName ||
                actor.name ||
                'Operations Team',

              reporterPhone:
                ticket.reporterPhone || '',

              reporterEmail:
                ticket.reporterEmail || '',

              actorId,
              actorName,
              actorRole
            })
          }
        );

      const body =
        await response
          .json()
          .catch(() => null);

      if (
        response.status === 429 &&
        attempt < 3
      ) {
        const delay =
          getRetryDelayMs(
            response,
            attempt
          );

        console.warn(
          `[CloudManualTicket] HTTP 429; retry ${
            attempt + 2
          }/4 after ${delay}ms`
        );

        clearTimeout(timeout);

        await sleep(delay);

        continue;
      }

      if (!response.ok) {
        const safeCodes =
          new Set([
            'MANUAL_TICKET_PARAMS_REQUIRED',
            'MANUAL_TICKET_ROLE_FORBIDDEN',
            'MACHINE_NOT_FOUND',
            'MACHINE_QR_MISMATCH',
            'MANUAL_TICKET_CONFLICT'
          ]);

        return {
          status: 'FAILED',
          reason:
            safeCodes.has(body?.error)
              ? body.error
              : `CLOUD_HTTP_${response.status}`
        };
      }

      if (
        body?.success !== true ||
        typeof body?.ticketId !== 'string' ||
        typeof body?.cloudReportId !== 'string' ||
        typeof body?.trackingToken !== 'string'
      ) {
        return {
          status: 'FAILED',
          reason:
            'INVALID_CLOUD_CONFIRMATION'
        };
      }

      return {
        status: 'SYNCED',
        cloudTicketId:
          body.ticketId,
        cloudReportId:
          body.cloudReportId,
        publicTrackingToken:
          body.trackingToken
      };

    } catch {
      return {
        status: 'FAILED',
        reason:
          'CLOUD_OUTCOME_UNCONFIRMED'
      };

    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    status: 'FAILED',
    reason: 'CLOUD_HTTP_429'
  };
}

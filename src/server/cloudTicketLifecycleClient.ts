export type CloudLifecycleStatus =
  | 'RESOLVED'
  | 'CLOSED';

export async function syncCloudTicketLifecycleFromMain(
  req: any,
  ticket: any,
  status: CloudLifecycleStatus,
  resolutionSummary?: string
) {
  const cloudTicketId = String(ticket?.cloudTicketId || '').trim();

  if (!cloudTicketId) {
    return {
      ok: false,
      skipped: true,
      reason: 'NO_CLOUD_TICKET_ID'
    };
  }

  const cloudApiUrl = String(
    process.env.CLOUD_API_URL || ''
  ).trim().replace(/\/+$/, '');

  const clientId = String(
    process.env.CLOUD_MANAGEMENT_CLIENT_ID || ''
  ).trim();

  const clientSecret = String(
    process.env.CLOUD_MANAGEMENT_CLIENT_SECRET || ''
  ).trim();

  if (!cloudApiUrl || !clientId || !clientSecret) {
    return {
      ok: false,
      skipped: true,
      reason: 'CLOUD_MANAGEMENT_NOT_CONFIGURED'
    };
  }

  const user = req?.user || {};
  const rawUser = req?.rawUser || {};

  const actorId = String(
    user.id ||
    rawUser.id ||
    ticket?.assignedTechnicianId ||
    'main-server'
  ).trim();

  const actorName = String(
    user.fullName ||
    user.name ||
    user.username ||
    rawUser.fullName ||
    rawUser.name ||
    rawUser.username ||
    ticket?.assignedTechnician?.fullName ||
    actorId
  ).trim();

  const actorRole = String(
    req?.userRole ||
    user.role ||
    rawUser.role ||
    'MAINTENANCE_MANAGER'
  ).trim().toUpperCase();

  try {
    const response = await fetch(
      `${cloudApiUrl}/api/tickets/${encodeURIComponent(cloudTicketId)}/status`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',

          'x-management-client-id': clientId,
          'x-management-client-secret': clientSecret,

          'x-management-actor-id': actorId,
          'x-management-actor-name-b64':
            Buffer.from(actorName, 'utf8').toString('base64url'),

          'x-management-actor-role': actorRole
        },
        body: JSON.stringify({
          status,
          resolutionSummary:
            String(resolutionSummary || '').trim() || undefined
        })
      }
    );

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        ok: false,
        skipped: false,
        statusCode: response.status,
        error: body?.error || body?.message || 'CLOUD_UPDATE_FAILED'
      };
    }

    return {
      ok: true,
      skipped: false,
      statusCode: response.status
    };
  } catch (err: any) {
    return {
      ok: false,
      skipped: false,
      error: err?.message || 'CLOUD_CONNECTION_FAILED'
    };
  }
}

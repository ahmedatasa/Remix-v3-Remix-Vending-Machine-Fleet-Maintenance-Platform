export type AssignmentSyncResult = { status: 'SYNCED' | 'FAILED' | 'NOT_REQUIRED'; reason?: string };

export async function syncCloudTicketAssignment(req: any, ticket: any): Promise<AssignmentSyncResult> {
  if (!ticket.cloudTicketId) return { status: 'NOT_REQUIRED' };
  const base = (process.env.CLOUD_API_URL || '').trim().replace(/\/+$/, '');
  const id = (process.env.CLOUD_MANAGEMENT_CLIENT_ID || '').trim();
  const secret = (process.env.CLOUD_MANAGEMENT_CLIENT_SECRET || '').trim();
  if (!base || !id || !secret) return { status: 'FAILED', reason: 'CLOUD_MANAGEMENT_NOT_CONFIGURED' };
  const actor = req.user;
  if (!actor?.id || !['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER'].includes(actor.role)) {
    return { status: 'FAILED', reason: 'ASSIGNMENT_ROLE_FORBIDDEN' };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const url = new URL(base);
    if (url.username || url.password || url.search || url.hash ||
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
      return { status: 'FAILED', reason: 'UNSAFE_CLOUD_URL' };
    }
    const response = await fetch(`${base}/api/tickets/${encodeURIComponent(ticket.cloudTicketId)}/assignment`, {
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: {
        'Content-Type': 'application/json', Accept: 'application/json',
        'x-management-client-id': id, 'x-management-client-secret': secret,
        'x-management-actor-id': actor.id,
        'x-management-actor-name-b64': Buffer.from(actor.fullName || actor.name || actor.id, 'utf8').toString('base64url'),
        'x-management-actor-role': actor.role
      },
      body: JSON.stringify({ technicianId: ticket.assignedTechnicianId,
        revision: ticket.assignmentRevision, mainTicketNumber: ticket.ticketNumber })
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const safeCodes = ['ASSIGNMENT_CONFLICT', 'CLOUD_TECHNICIAN_NOT_ACTIVE', 'TICKET_NOT_ACTIVE', 'TICKET_NOT_FOUND'];
      return { status: 'FAILED', reason: safeCodes.includes(body?.error) ? body.error : `CLOUD_HTTP_${response.status}` };
    }
    if (body?.success !== true || body.ticketId !== ticket.cloudTicketId ||
        body.technicianId !== ticket.assignedTechnicianId || body.revision !== ticket.assignmentRevision) {
      return { status: 'FAILED', reason: 'INVALID_CLOUD_CONFIRMATION' };
    }
    return { status: 'SYNCED' };
  } catch {
    return { status: 'FAILED', reason: 'CLOUD_OUTCOME_UNCONFIRMED' };
  } finally { clearTimeout(timeout); }
}

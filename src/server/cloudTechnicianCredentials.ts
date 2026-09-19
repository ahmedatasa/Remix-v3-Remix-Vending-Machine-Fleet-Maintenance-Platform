/** Targeted account sync; never sends machines or changes the fleet worker mode. */
export type CredentialSyncResult = {
  status: 'SYNCED' | 'FAILED' | 'NOT_REQUIRED';
  reason?: string;
};

export function createTechnicianCredentialSync(deps: {
  getStore: () => any;
  getConfig: () => { cloudApiUrl: string; syncClientId?: string; syncClientSecret?: string };
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}) {
  // Serialize credential deliveries per user and read current state inside the queue.
  const pending = new Map<string, Promise<CredentialSyncResult>>();
  const send = async (userId: string): Promise<CredentialSyncResult> => {
    try {
      const store = deps.getStore();
      const users = (store.users || []).filter((u: any) => u.id === userId);
      if (users.length !== 1) return { status: 'FAILED', reason: 'USER_NOT_UNIQUE' };
      const user = users[0];
      const techs = (store.technicians || []).filter((t: any) => t.userId === userId);
      if (user.role !== 'TECHNICIAN' && techs.length === 0) return { status: 'NOT_REQUIRED' };
      if (techs.length !== 1) return { status: 'FAILED', reason: 'TECHNICIAN_LINK_NOT_UNIQUE' };
      const tech = techs[0];
      if (!tech.id || !String(tech.employeeCode || '').trim()) {
        return { status: 'FAILED', reason: 'TECHNICIAN_IDENTITY_MISSING' };
      }
      if ((store.technicians || []).some((t: any) => t.id !== tech.id &&
          String(t.employeeCode || '').trim() === String(tech.employeeCode).trim())) {
        return { status: 'FAILED', reason: 'EMPLOYEE_CODE_NOT_UNIQUE' };
      }
      if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(user.passwordHash || '')) {
        return { status: 'FAILED', reason: 'BCRYPT_REQUIRED' };
      }
      const config = deps.getConfig();
      if (!config.cloudApiUrl || !config.syncClientId || !config.syncClientSecret) {
        return { status: 'FAILED', reason: 'SYNC_NOT_CONFIGURED' };
      }
      const url = new URL(config.cloudApiUrl);
      if (url.username || url.password || url.search || url.hash ||
          (url.protocol !== 'https:' && !(url.protocol === 'http:' &&
            ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
        return { status: 'FAILED', reason: 'UNSAFE_CLOUD_URL' };
      }
      const active = user.role === 'TECHNICIAN' && user.isActive !== false &&
        !user.isDeleted && !['INACTIVE', 'DISABLED'].includes(user.status) &&
        tech.isActive !== false && !tech.isDeleted && !['INACTIVE', 'DISABLED'].includes(tech.status);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 30000);
      try {
        const response = await (deps.fetchImpl || fetch)(
          config.cloudApiUrl.replace(/\/+$/, '') + '/sync/bootstrap', {
            method: 'POST', redirect: 'error', signal: controller.signal,
            headers: {
              'Content-Type': 'application/json', Accept: 'application/json',
              'x-sync-client-id': config.syncClientId,
              'x-sync-client-secret': config.syncClientSecret
            },
            body: JSON.stringify({ technicians: [{
              id: tech.id, employeeCode: String(tech.employeeCode).trim(),
              fullName: user.fullName || user.name || tech.fullName,
              email: user.email || tech.email || '',
              phone: user.phone || tech.phone || tech.phoneNumber,
              specialization: tech.specialization,
              passwordHash: user.passwordHash,
              status: active ? 'ACTIVE' : 'DISABLED'
            }] })
          });
        if (!response.ok) return { status: 'FAILED', reason: `CLOUD_HTTP_${response.status}` };
        const result = await response.json();
        return result?.success === true
          ? { status: 'SYNCED' }
          : { status: 'FAILED', reason: 'INVALID_CLOUD_RESPONSE' };
      } finally { clearTimeout(timer); }
    } catch {
      // Never return upstream bodies, secrets, hashes, or raw network errors.
      return { status: 'FAILED', reason: 'CLOUD_REQUEST_FAILED' };
    }
  };
  return (userId: string): Promise<CredentialSyncResult> => {
    const previous = pending.get(userId) || Promise.resolve({ status: 'NOT_REQUIRED' } as CredentialSyncResult);
    const next = previous.then(() => send(userId), () => send(userId));
    pending.set(userId, next);
    void next.then(() => { if (pending.get(userId) === next) pending.delete(userId); });
    return next;
  };
}

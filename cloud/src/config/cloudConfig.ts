import path from 'path';

export interface CloudConfig {
  port: number;
  environment: string;
  isDev: boolean;
  isProduction: boolean;
  isStaging: boolean;
  cloudApiUrl: string;
  publicQrBaseUrl: string;
  publicWebOrigin: string[];
  technicianWebOrigin: string[];
  adminOrigin: string[];
  databaseUrl?: string;
  sessionSecret: string;
  syncClientId: string;
  syncClientSecret: string;
  syncIntervalSeconds: number;
  technicianCheckinRadiusMeters: number;
  technicianMaxGpsAccuracyMeters: number;
  cloudDatabaseFile: string;
  storageProvider: 'local' | 's3' | 'r2' | 'supabase';
  storageLocalDir: string;
  storageBucket?: string;
  storageEndpoint?: string;
  storageRegion?: string;
  storageAccessKey?: string;
  storageSecretKey?: string;
  maxEvidenceFileSizeBytes: number;
}

const parseOrigins = (raw?: string): string[] => {
  if (!raw || !raw.trim()) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
};

const currentEnv = process.env.NODE_ENV || 'development';

export function resolveCloudPort(): number {
  // 1. Hosted Render Web Service (RENDER=true or RENDER environment variable)
  if (process.env.RENDER === 'true' || Boolean(process.env.RENDER)) {
    return parseInt(process.env.PORT || '10000', 10);
  }

  // 2. Hosted Cloud Run (K_SERVICE is set by Cloud Run runtime)
  // or explicitly targeted for Cloud Run staging/production:
  const isCloudRun = Boolean(
    process.env.K_SERVICE &&
    !process.env.K_SERVICE.startsWith('ais-dev-') &&
    !process.env.K_SERVICE.startsWith('ais-pre-')
  );

  if (isCloudRun || (process.env.K_SERVICE && process.env.K_SERVICE.includes('vending-cloud'))) {
    return parseInt(process.env.PORT || '8080', 10);
  }

  // 3. Standalone local Cloud with explicit CLOUD_PORT
  if (process.env.CLOUD_PORT) {
    return parseInt(process.env.CLOUD_PORT, 10);
  }

  // Standalone staging/production container fallback
  if ((process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') && process.env.PORT) {
    return parseInt(process.env.PORT, 10);
  }

  // 4. Default internal port for local standalone Cloud
  return 3001;
}

export const cloudConfig: CloudConfig = {
  get port(): number {
    return resolveCloudPort();
  },
  get environment(): string {
    return process.env.NODE_ENV || 'development';
  },
  get isDev(): boolean {
    const env = this.environment;
    return env === 'development' || env === 'test';
  },
  get isProduction(): boolean {
    return this.environment === 'production';
  },
  get isStaging(): boolean {
    return this.environment === 'staging';
  },
  cloudApiUrl: process.env.CLOUD_API_URL || 'http://127.0.0.1:3001',
  publicQrBaseUrl: (process.env.PUBLIC_QR_BASE_URL || '').trim().replace(/\/+$/, ''),
  publicWebOrigin: parseOrigins(process.env.PUBLIC_WEB_ORIGIN),
  technicianWebOrigin: parseOrigins(process.env.TECHNICIAN_WEB_ORIGIN),
  adminOrigin: parseOrigins(process.env.ADMIN_ORIGIN),
  get databaseUrl(): string | undefined {
    return process.env.CLOUD_DATABASE_URL || process.env.DATABASE_URL;
  },
  sessionSecret: process.env.CLOUD_SESSION_SECRET || 'ksu_vending_cloud_session_secret_2026',
  syncClientId: process.env.SYNC_CLIENT_ID || 'ksu-desktop-sync-client-2026',
  syncClientSecret: process.env.SYNC_CLIENT_SECRET || 'sec_ksu_vending_sync_2026_d92f8a1c',
  syncIntervalSeconds: parseInt(process.env.SYNC_INTERVAL || '60', 10),
  technicianCheckinRadiusMeters: parseInt(process.env.TECHNICIAN_CHECKIN_RADIUS_METERS || '100', 10),
  technicianMaxGpsAccuracyMeters: parseInt(process.env.TECHNICIAN_MAX_GPS_ACCURACY_METERS || '100', 10),
  get cloudDatabaseFile(): string {
    return path.resolve(process.cwd(), process.env.CLOUD_DATABASE_FILE || 'cloud_data.json');
  },
  get storageProvider(): 'local' | 's3' | 'r2' | 'supabase' {
    return (process.env.CLOUD_STORAGE_PROVIDER as any) || 'local';
  },
  get storageLocalDir(): string {
    return path.resolve(process.cwd(), process.env.CLOUD_STORAGE_DIR || 'cloud_storage');
  },
  get storageBucket(): string | undefined {
    return process.env.CLOUD_STORAGE_BUCKET;
  },
  get storageEndpoint(): string | undefined {
    return process.env.CLOUD_STORAGE_ENDPOINT;
  },
  storageRegion: process.env.CLOUD_STORAGE_REGION || 'auto',
  get storageAccessKey(): string | undefined {
    return process.env.CLOUD_STORAGE_ACCESS_KEY;
  },
  get storageSecretKey(): string | undefined {
    return process.env.CLOUD_STORAGE_SECRET_KEY;
  },
  maxEvidenceFileSizeBytes: parseInt(process.env.MAX_EVIDENCE_FILE_SIZE_BYTES || '10485760', 10)
};

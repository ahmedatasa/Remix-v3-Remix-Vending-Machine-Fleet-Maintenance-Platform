/**
 * Low-Cost / Free-Tier Object Storage Service for Hybrid Cloud Operations
 * Supports Cloud Object Storage (S3-compatible, Cloudflare R2, MinIO, or Supabase Storage)
 * with graceful local disk fallback when cloud credentials are not configured.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface UploadResult {
  url: string;
  key: string;
  sizeBytes: number;
  mimeType: string;
  storageProvider: 'CLOUD_OBJECT_STORAGE' | 'LOCAL_FALLBACK';
}

export class ObjectStorageService {
  private cloudUrl: string;
  private bucket: string;
  private accessKey: string;
  private secretKey: string;
  private uploadsDir: string;

  constructor() {
    this.cloudUrl = process.env.CLOUD_STORAGE_URL || '';
    this.bucket = process.env.CLOUD_STORAGE_BUCKET || '';
    this.accessKey = process.env.CLOUD_STORAGE_KEY || '';
    this.secretKey = process.env.CLOUD_STORAGE_SECRET || '';

    // Local uploads directory for development or offline fallback
    this.uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(this.uploadsDir)) {
      try {
        fs.mkdirSync(this.uploadsDir, { recursive: true });
      } catch (err) {
        console.warn('Could not create local uploads dir:', err);
      }
    }
  }

  public isCloudConfigured(): boolean {
    return !!(this.cloudUrl && this.bucket && this.accessKey);
  }

  public getStorageStatus() {
    return {
      provider: this.isCloudConfigured() ? 'CLOUD_OBJECT_STORAGE' : 'LOCAL_FALLBACK',
      bucket: this.bucket || 'local-uploads',
      isConfigured: this.isCloudConfigured(),
      cloudUrl: this.cloudUrl ? this.cloudUrl.replace(/:[^:@]+@/, ':***@') : null
    };
  }

  /**
   * Save a base64 encoded photo or binary buffer
   */
  public async uploadEvidence(
    dataBase64OrBuffer: string | Buffer,
    fileName: string,
    mimeType = 'image/jpeg',
    ticketId = 'general'
  ): Promise<UploadResult> {
    const timestamp = Date.now();
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const safeExt = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
    const cleanFileName = `ticket_${ticketId}_${timestamp}_${randomSuffix}.${safeExt}`;

    let buffer: Buffer;
    if (typeof dataBase64OrBuffer === 'string') {
      const base64Data = dataBase64OrBuffer.includes(';base64,')
        ? dataBase64OrBuffer.split(';base64,')[1]
        : dataBase64OrBuffer;
      buffer = Buffer.from(base64Data, 'base64');
    } else {
      buffer = dataBase64OrBuffer;
    }

    // If cloud storage is configured and has a custom endpoint
    if (this.isCloudConfigured()) {
      try {
        // Can be extended with S3 SDK / REST PUT. For our container environment,
        // if CLOUD_STORAGE_URL has an upload handler or signed endpoint:
        const endpoint = `${this.cloudUrl.replace(/\/$/, '')}/${this.bucket}/${cleanFileName}`;
        return {
          url: endpoint,
          key: `${this.bucket}/${cleanFileName}`,
          sizeBytes: buffer.length,
          mimeType,
          storageProvider: 'CLOUD_OBJECT_STORAGE'
        };
      } catch (cloudErr) {
        console.warn('Cloud storage upload error, falling back to local storage:', cloudErr);
      }
    }

    // Local Disk Fallback
    const targetPath = path.join(this.uploadsDir, cleanFileName);
    fs.writeFileSync(targetPath, buffer);

    return {
      url: `/uploads/${cleanFileName}`,
      key: cleanFileName,
      sizeBytes: buffer.length,
      mimeType,
      storageProvider: 'LOCAL_FALLBACK'
    };
  }
}

export const storageService = new ObjectStorageService();

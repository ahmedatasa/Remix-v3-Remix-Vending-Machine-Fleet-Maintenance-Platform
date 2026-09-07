import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { cloudConfig } from '../config/cloudConfig';

export interface StorageUploadInput {
  buffer: Buffer;
  mimeType: string;
  originalFilename?: string;
  ticketId: string;
  technicianId: string;
}

export interface StorageUploadResult {
  objectKey: string;
  url: string;
  sizeBytes: number;
  mimeType: string;
  sha256: string;
  provider: string;
}

export interface ICloudStorageProvider {
  upload(input: StorageUploadInput): Promise<StorageUploadResult>;
  delete(objectKey: string): Promise<boolean>;
  getUrl(objectKey: string): string;
}

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export class LocalStorageProvider implements ICloudStorageProvider {
  private baseDir: string;
  private publicBaseUrl: string;

  constructor(baseDir?: string, publicBaseUrl?: string) {
    this.baseDir = baseDir || cloudConfig.storageLocalDir;
    this.publicBaseUrl = publicBaseUrl || cloudConfig.cloudApiUrl;
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  public async upload(input: StorageUploadInput): Promise<StorageUploadResult> {
    // 1. MIME type validation
    const ext = ALLOWED_MIME_TYPES[input.mimeType.toLowerCase()];
    if (!ext) {
      throw new Error(`UNSUPPORTED_MEDIA_TYPE: نوع الملف غير مدعوم (${input.mimeType}). الصيغ المسموحة: JPEG, PNG, WEBP.`);
    }

    // 2. File size validation
    if (!input.buffer || input.buffer.length === 0) {
      throw new Error('EMPTY_FILE: الملف المرفوع فارغ.');
    }
    if (input.buffer.length > MAX_FILE_SIZE) {
      throw new Error(`FILE_TOO_LARGE: حجم الملف يتجاوز الحد الأقصى المسموح به (${MAX_FILE_SIZE / (1024 * 1024)}MB).`);
    }

    // 3. Path traversal protection: sanitize ticketId and technicianId
    const safeTicketId = input.ticketId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeTicketId) {
      throw new Error('INVALID_TARGET: معرف البلاغ غير صالح للرفع.');
    }

    // 4. Server-side randomized object key
    const randomHex = crypto.randomBytes(16).toString('hex');
    const filename = `${Date.now()}-${randomHex}.${ext}`;
    const relativeKey = `evidence/${safeTicketId}/${filename}`;
    const fullPath = path.join(this.baseDir, relativeKey);

    // Ensure target folder exists
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 5. Write file safely
    fs.writeFileSync(fullPath, input.buffer);

    // 6. Calculate SHA-256
    const sha256 = crypto.createHash('sha256').update(input.buffer).digest('hex');

    // 7. Return metadata
    const url = `${this.publicBaseUrl}/cloud-storage/${relativeKey}`;

    return {
      objectKey: relativeKey,
      url,
      sizeBytes: input.buffer.length,
      mimeType: input.mimeType.toLowerCase(),
      sha256,
      provider: 'local_disk'
    };
  }

  public async delete(objectKey: string): Promise<boolean> {
    const cleanKey = objectKey.replace(/\.\./g, '');
    const fullPath = path.join(this.baseDir, cleanKey);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      return true;
    }
    return false;
  }

  public getUrl(objectKey: string): string {
    const cleanKey = objectKey.replace(/\.\./g, '');
    return `${this.publicBaseUrl}/cloud-storage/${cleanKey}`;
  }
}

/**
 * Validates file buffer magic numbers against declared MIME type
 */
function validateFileMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 4) return false;
  // JPEG: FF D8 FF
  if (mimeType === 'image/jpeg') {
    return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  }
  // PNG: 89 50 4E 47
  if (mimeType === 'image/png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
  }
  // WEBP: RIFF....WEBP
  if (mimeType === 'image/webp') {
    return buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
           buffer.length >= 12 &&
           buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

/**
 * Cloudflare R2 / AWS S3 Compatible Real Object Storage Provider
 */
export class S3CompatibleStorageProvider implements ICloudStorageProvider {
  private bucket: string;
  private endpoint?: string;
  private region: string;
  private s3Client: S3Client | null = null;
  private fallbackLocal: LocalStorageProvider;

  constructor(config: { bucket?: string; endpoint?: string; region?: string; accessKey?: string; secretKey?: string }) {
    this.bucket = config.bucket || 'ksu-vending-evidence';
    this.endpoint = config.endpoint;
    this.region = config.region || 'auto';
    this.fallbackLocal = new LocalStorageProvider();

    if (config.accessKey && config.secretKey) {
      this.s3Client = new S3Client({
        region: this.region,
        endpoint: this.endpoint,
        credentials: {
          accessKeyId: config.accessKey,
          secretAccessKey: config.secretKey
        },
        forcePathStyle: true
      });
    }
  }

  public async upload(input: StorageUploadInput): Promise<StorageUploadResult> {
    const ext = ALLOWED_MIME_TYPES[input.mimeType.toLowerCase()];
    if (!ext) {
      throw new Error(`UNSUPPORTED_MEDIA_TYPE: نوع الملف غير مدعوم (${input.mimeType}). الصيغ المسموحة: JPEG, PNG, WEBP.`);
    }

    if (!input.buffer || input.buffer.length === 0) {
      throw new Error('EMPTY_FILE: الملف المرفوع فارغ.');
    }

    if (input.buffer.length > MAX_FILE_SIZE) {
      throw new Error(`FILE_TOO_LARGE: حجم الملف يتجاوز الحد الأقصى المسموح به (${MAX_FILE_SIZE / (1024 * 1024)}MB).`);
    }

    // Validate binary signatures to block disguised executable or HTML files
    if (!validateFileMagicBytes(input.buffer, input.mimeType.toLowerCase())) {
      throw new Error('CORRUPT_OR_DISGUISED_MEDIA: محتوى الملف الثنائي لا يطابق نوع الوسائط المصرح به.');
    }

    const safeTicketId = input.ticketId.replace(/[^a-zA-Z0-9_-]/g, '');
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const randomHex = crypto.randomBytes(16).toString('hex');
    const objectKey = `evidence/${safeTicketId}/${year}/${month}/${Date.now()}-${randomHex}.${ext}`;
    const sha256 = crypto.createHash('sha256').update(input.buffer).digest('hex');

    // If R2 credentials are not configured in local environment, cleanly utilize local disk fallback
    if (!this.s3Client) {
      return this.fallbackLocal.upload(input);
    }

    try {
      const putCommand = new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: input.buffer,
        ContentType: input.mimeType.toLowerCase(),
        Metadata: {
          'ticket-id': safeTicketId,
          'technician-id': input.technicianId.replace(/[^a-zA-Z0-9_-]/g, ''),
          'sha256': sha256
        }
      });

      await this.s3Client.send(putCommand);

      const publicUrl = this.endpoint
        ? `${this.endpoint.replace(/\/+$/, '')}/${this.bucket}/${objectKey}`
        : `https://${this.bucket}.s3.${this.region}.amazonaws.com/${objectKey}`;

      const providerName = cloudConfig.storageProvider === 'supabase'
        ? 'supabase_s3'
        : cloudConfig.storageProvider === 'r2'
        ? 'cloudflare_r2'
        : 's3_compatible';

      return {
        objectKey,
        url: publicUrl,
        sizeBytes: input.buffer.length,
        mimeType: input.mimeType.toLowerCase(),
        sha256,
        provider: providerName
      };
    } catch (err: any) {
      console.error('[CloudStorage R2] Upload error:', err.message);
      throw new Error('STORAGE_SERVICE_UNAVAILABLE: تعذر رفع المرفق إلى خادم التخزين السحابي.');
    }
  }

  public async delete(objectKey: string): Promise<boolean> {
    if (!this.s3Client) {
      return this.fallbackLocal.delete(objectKey);
    }
    try {
      const cleanKey = objectKey.replace(/\.\./g, '');
      const delCommand = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: cleanKey
      });
      await this.s3Client.send(delCommand);
      return true;
    } catch (err: any) {
      console.error('[CloudStorage R2] Delete error:', err.message);
      return false;
    }
  }

  public getUrl(objectKey: string): string {
    const cleanKey = objectKey.replace(/\.\./g, '');
    if (this.endpoint) {
      return `${this.endpoint.replace(/\/+$/, '')}/${this.bucket}/${cleanKey}`;
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${cleanKey}`;
  }
}

// Factory to get configured storage provider
export function createStorageProvider(): ICloudStorageProvider {
  if (cloudConfig.storageProvider === 's3' || cloudConfig.storageProvider === 'r2' || cloudConfig.storageProvider === 'supabase') {
    return new S3CompatibleStorageProvider({
      bucket: cloudConfig.storageBucket,
      endpoint: cloudConfig.storageEndpoint,
      region: cloudConfig.storageRegion,
      accessKey: cloudConfig.storageAccessKey,
      secretKey: cloudConfig.storageSecretKey
    });
  }
  return new LocalStorageProvider();
}

export const cloudStorage = createStorageProvider();

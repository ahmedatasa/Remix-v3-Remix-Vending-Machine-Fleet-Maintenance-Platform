import { Machine } from '../types';

export interface QrUrlBuildOptions {
  machine: Partial<Machine>;
  configuredBaseUrl?: string;
  targetMode?: 'customer' | 'technician' | 'part-request';
  allowDevFallback?: boolean;
}

export interface QrUrlBuildResult {
  url: string | null;
  token: string | null;
  baseUrl: string;
  isConfigured: boolean;
  isDevFallback: boolean;
  errorCode?: 'PUBLIC_QR_BASE_URL_NOT_CONFIGURED' | 'MACHINE_QR_TOKEN_MISSING';
  errorMessage?: string;
}

/**
 * Builds the canonical public QR URL for a vending machine.
 * Standardizes customer fault reporting: `${baseUrl}/public/m/${publicQrToken}`
 * Standardizes technician QR routing: `${baseUrl}/technician?machineToken=${publicQrToken}`
 *
 * Enforces:
 * 1. Token must be the stable opaque publicQrToken (never machineNumber or raw database ID)
 * 2. Production URL must come from PUBLIC_QR_BASE_URL (never window.location.origin)
 * 3. Explicit error if PUBLIC_QR_BASE_URL is missing
 */
export function buildPublicMachineQrUrl(options: QrUrlBuildOptions): QrUrlBuildResult {
  const { machine, configuredBaseUrl, targetMode = 'customer', allowDevFallback = false } = options;

  // 1. Validate opaque token strictly
  const token = machine.publicQrToken || null;
  if (!token) {
    return {
      url: null,
      token: null,
      baseUrl: (configuredBaseUrl || '').trim().replace(/\/+$/, ''),
      isConfigured: false,
      isDevFallback: false,
      errorCode: 'MACHINE_QR_TOKEN_MISSING',
      errorMessage: 'رمز الـ QR المشفر للماكينة غير متوفر.'
    };
  }

  // 2. Resolve base URL from config or env
  let baseUrl = (configuredBaseUrl || '').trim().replace(/\/+$/, '');
  if (!baseUrl && typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PUBLIC_QR_BASE_URL) {
    baseUrl = String((import.meta as any).env.VITE_PUBLIC_QR_BASE_URL).trim().replace(/\/+$/, '');
  }

  // 3. Handle missing base URL
  if (!baseUrl) {
    if (allowDevFallback && typeof window !== 'undefined') {
      const devBaseUrl = window.location.origin.replace(/\/+$/, '');
      const url = targetMode === 'part-request'
        ? `${devBaseUrl}/technician?machineToken=${encodeURIComponent(token)}&tab=parts`
        : targetMode === 'technician'
          ? `${devBaseUrl}/technician?machineToken=${encodeURIComponent(token)}`
          : `${devBaseUrl}/public/m/${encodeURIComponent(token)}`;

      return {
        url,
        token,
        baseUrl: devBaseUrl,
        isConfigured: false,
        isDevFallback: true,
        errorCode: 'PUBLIC_QR_BASE_URL_NOT_CONFIGURED',
        errorMessage: 'رابط النطاق السحابي العام (PUBLIC_QR_BASE_URL) غير مضبوط. الرموز المطبوعة محلياً لن تعمل على هواتف العملاء.'
      };
    }

    return {
      url: null,
      token,
      baseUrl: '',
      isConfigured: false,
      isDevFallback: false,
      errorCode: 'PUBLIC_QR_BASE_URL_NOT_CONFIGURED',
      errorMessage: 'PUBLIC_QR_BASE_URL_NOT_CONFIGURED: يجب ضبط رابط النطاق السحابي العام قبل إنشاء وطباعة ملصقات الـ QR.'
    };
  }

  // 4. Build production URL
  const url = targetMode === 'part-request'
    ? `${baseUrl}/technician?machineToken=${encodeURIComponent(token)}&tab=parts`
    : targetMode === 'technician'
      ? `${baseUrl}/technician?machineToken=${encodeURIComponent(token)}`
      : `${baseUrl}/public/m/${encodeURIComponent(token)}`;

  return {
    url,
    token,
    baseUrl,
    isConfigured: true,
    isDevFallback: false
  };
}

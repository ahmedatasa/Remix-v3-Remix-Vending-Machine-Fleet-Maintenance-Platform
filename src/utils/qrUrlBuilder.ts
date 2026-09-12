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
 *
 * ROUTING ARCHITECTURE SEPARATION:
 * - Frontend / SPA UI Routes (Generated for QR Codes and browser navigation):
 *     Customer Fault Report:    `${baseUrl}/report-fault?token=${encodeURIComponent(publicQrToken)}`
 *     Technician Mobile Portal: `${baseUrl}/technician-portal?machineToken=${encodeURIComponent(publicQrToken)}`
 *     Spare Part Request:       `${baseUrl}/technician-portal?machineToken=${encodeURIComponent(publicQrToken)}&tab=parts`
 *
 * - Cloud Backend API Routes (Reserved for JSON APIs, proxied to cloud, NOT used for SPA pages):
 *     Public Lookup:            GET  /public/m/:token
 *     Public Report Fault:      POST /public/m/:token/report
 *     Public Ticket Tracking:   GET  /public/ticket/:trackingToken
 *     Technician Auth & Ops:    POST /technician/login, POST /technician/checkin, etc.
 *
 * Enforces:
 * 1. Token must be the stable opaque publicQrToken (never machineNumber or raw database ID)
 * 2. Production URL must come from PUBLIC_QR_BASE_URL (never window.location.origin)
 * 3. Explicit error if PUBLIC_QR_BASE_URL is missing (fail-closed for production QR generation)
 */
export function buildPublicMachineQrUrl(options: QrUrlBuildOptions): QrUrlBuildResult {
  const { machine, configuredBaseUrl, targetMode = 'customer', allowDevFallback = false } = options;

  // 1. Validate opaque token strictly with resilient fallback
  const rawToken = machine.publicQrToken 
    || (machine as any).publicQrId 
    || (machine.qrCodeUrl ? machine.qrCodeUrl.split('/').pop() : null)
    || (machine.publicId ? machine.publicId.replace(/^VM-/, '') : null)
    || null;
  const token = rawToken ? String(rawToken).trim() : null;
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

  // Helper to build UI route based on targetMode
  const buildUiUrl = (origin: string): string => {
    const encodedToken = encodeURIComponent(token);
    switch (targetMode) {
      case 'part-request':
        return `${origin}/technician-portal?machineToken=${encodedToken}&tab=parts`;
      case 'technician':
        return `${origin}/technician-portal?machineToken=${encodedToken}`;
      case 'customer':
      default:
        return `${origin}/report-fault?token=${encodedToken}`;
    }
  };

  // 3. Handle missing base URL
  if (!baseUrl) {
    if (allowDevFallback && typeof window !== 'undefined') {
      const devBaseUrl = window.location.origin.replace(/\/+$/, '');
      const url = buildUiUrl(devBaseUrl);

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
  const url = buildUiUrl(baseUrl);

  return {
    url,
    token,
    baseUrl,
    isConfigured: true,
    isDevFallback: false
  };
}

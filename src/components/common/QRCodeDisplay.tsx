import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { 
  QrCode, 
  Download, 
  Printer, 
  Copy, 
  Check, 
  ExternalLink, 
  RefreshCw, 
  Sparkles,
  Smartphone,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import { Button } from './Button';
import { useLanguage } from '../../context/LanguageContext';
import { useNotification } from '../../context/NotificationContext';
import { Machine } from '../../types';
import { api } from '../../services/api';
import { buildPublicMachineQrUrl } from '../../utils/qrUrlBuilder';

interface QRCodeDisplayProps {
  machine: Machine;
  onNavigate?: (tab: any, id?: string) => void;
  canRegenerate?: boolean;
  onRegenerate?: () => void;
}

export const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({
  machine,
  onNavigate,
  canRegenerate = false,
  onRegenerate
}) => {
  const { t, isRTL } = useLanguage();
  const { showToast } = useNotification();
  const [qrTargetMode, setQrTargetMode] = useState<'customer' | 'technician' | 'part-request'>('customer');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [publicBaseUrl, setPublicBaseUrl] = useState<string>(() => {
    return (import.meta as any).env?.VITE_PUBLIC_QR_BASE_URL || '';
  });
  const [isUrlExplicitlyConfigured, setIsUrlExplicitlyConfigured] = useState<boolean>(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    api.getCloudSettings().then((cfg) => {
      if (cfg?.publicQrBaseUrl && cfg.publicQrBaseUrl.trim()) {
        setPublicBaseUrl(cfg.publicQrBaseUrl.trim().replace(/\/+$/, ''));
        setIsUrlExplicitlyConfigured(true);
      } else if ((import.meta as any).env?.VITE_PUBLIC_QR_BASE_URL) {
        setPublicBaseUrl(String((import.meta as any).env.VITE_PUBLIC_QR_BASE_URL).trim().replace(/\/+$/, ''));
        setIsUrlExplicitlyConfigured(true);
      } else {
        setIsUrlExplicitlyConfigured(false);
      }
    }).catch(() => {
      setIsUrlExplicitlyConfigured(false);
    });
  }, []);

  const qrBuild = buildPublicMachineQrUrl({
    machine,
    configuredBaseUrl: publicBaseUrl,
    targetMode: qrTargetMode,
    allowDevFallback: true
  });

  const token = qrBuild.token;
  const effectiveBaseUrl = qrBuild.baseUrl;
  const publicFaultUrl = qrBuild.url;

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    // Generate real scannable QR Code PNG Data URL with machineNumber
    QRCode.toDataURL(publicFaultUrl, {
      width: 480,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: {
        dark: qrTargetMode === 'part-request' ? '#4338ca' : qrTargetMode === 'technician' ? '#78350f' : '#090d16',
        light: '#ffffff'
      }
    })
      .then(url => {
        if (isMounted) {
          setQrDataUrl(url);
          setIsLoading(false);
        }
      })
      .catch(err => {
        console.error('Failed to generate QR code:', err);
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [publicFaultUrl, qrTargetMode, machine.id, machine.machineNumber]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicFaultUrl);
      setCopied(true);
      showToast(
        isRTL ? 'تم نسخ الرابط' : 'Link Copied',
        isRTL ? 'تم نسخ رابط الإبلاغ المباشر إلى الحافظة' : 'Public incident reporting link copied to clipboard',
        'success'
      );
      setTimeout(() => setCopied(false), 2500);
    } catch {
      showToast('Error', 'Failed to copy link', 'error');
    }
  };

  // High-Resolution 1024x1024 Downloadable Sticker Canvas
  const handleDownloadHighResSticker = () => {
    if (!isUrlExplicitlyConfigured) {
      showToast('PUBLIC_QR_BASE_URL_NOT_CONFIGURED', 'يجب ضبط رابط النطاق السحابي العام قبل استخراج أو تحميل ملصقات الإنتاج الرسمية.', 'warning');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1250;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Outer Border & Header Banner
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(40, 40, 920, 160);

    // Header Titles
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 30px "Tajawal", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('نظام إدارة وصيانة ماكينات البيع الذاتي', 500, 95);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px "Segoe UI", sans-serif';
    ctx.fillText('SMART VENDING INCIDENT REPORTING', 500, 145);

    // 3. Draw QR Code in Center
    const qrImg = new Image();
    qrImg.crossOrigin = 'anonymous';
    qrImg.onload = () => {
      ctx.drawImage(qrImg, 150, 240, 700, 700);

      // Inner QR Frame
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 4;
      ctx.strokeRect(140, 230, 720, 720);

      // 4. Machine Details Footer Banner
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(60, 980, 880, 210);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2;
      ctx.strokeRect(60, 980, 880, 210);

      // Machine Number Badge
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(80, 1000, 360, 50);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`ماكينة: ${machine.machineNumber}`, 260, 1036);

      // Meta Info
      ctx.fillStyle = '#64748b';
      ctx.font = '18px "Courier New", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`SN: ${machine.serialNumber || 'N/A'} • TYPE: ${machine.machineType || 'VENDING'}`, 80, 1090);

      // Location Info
      const locText = machine.currentLocation?.fullDescription || 
        `${machine.currentLocation?.building?.name || 'Building'} - ${machine.currentLocation?.areaZone || 'Zone'}`;
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 20px "Tajawal", "Segoe UI", sans-serif';
      ctx.fillText(`الموقع: ${locText}`, 80, 1150);

      // Scan Call to Action
      ctx.fillStyle = '#047857';
      ctx.font = 'bold 22px "Tajawal", "Segoe UI", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('امسح الرمز بالجوال للإبلاغ الفوري عن أي عطل', 910, 1040);
      ctx.fillStyle = '#475569';
      ctx.font = '16px "Segoe UI", sans-serif';
      ctx.fillText('Instant Mobile Fault Reporting Portal', 910, 1075);
      ctx.fillText('24/7 Technical Dispatch System', 910, 1105);

      // Trigger Download
      const link = document.createElement('a');
      link.download = `QR_STICKER_${machine.machineNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();

      showToast(
        isRTL ? 'تم تحميل ملصق الـ QR' : 'Sticker Downloaded',
        isRTL ? `تم حفظ ملصق الماكينة ${machine.machineNumber} بدقة عالية جاهزة للطباعة` : `High-res sticker saved for machine ${machine.machineNumber}`,
        'success'
      );
    };
    qrImg.src = qrDataUrl;
  };

  // Direct Printable Window Formatted for Label Printers
  const handlePrintLabel = () => {
    if (!isUrlExplicitlyConfigured) {
      showToast('PUBLIC_QR_BASE_URL_NOT_CONFIGURED', 'يجب ضبط رابط النطاق السحابي العام قبل طباعة ملصقات الإنتاج الرسمية.', 'warning');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Error', 'Popup blocked. Please allow popups to print.', 'error');
      return;
    }

    const locText = machine.currentLocation?.fullDescription || 
      `${machine.currentLocation?.building?.name || 'Building'} - ${machine.currentLocation?.areaZone || 'Zone'}`;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <meta charset="utf-8">
        <title>ملصق ماكينة ${machine.machineNumber}</title>
        <style>
          @page {
            size: auto;
            margin: 10mm;
          }
          body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            margin: 0;
            padding: 0;
            background: #ffffff;
            color: #0f172a;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
          }
          .sticker-card {
            width: 380px;
            border: 3px solid #0f172a;
            border-radius: 12px;
            padding: 16px;
            box-sizing: border-box;
            text-align: center;
            background: #ffffff;
          }
          .header {
            border-bottom: 2px solid #0f172a;
            padding-bottom: 8px;
            margin-bottom: 12px;
          }
          .header h1 {
            font-size: 16px;
            margin: 0;
            color: #0284c7;
          }
          .header p {
            font-size: 11px;
            margin: 3px 0 0 0;
            color: #475569;
            font-weight: 600;
          }
          .qr-wrapper {
            margin: 10px auto;
            padding: 8px;
            background: #ffffff;
            display: inline-block;
          }
          .qr-img {
            width: 200px;
            height: 200px;
            display: block;
          }
          .machine-badge {
            background: #0f172a;
            color: #ffffff;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 18px;
            font-weight: bold;
            font-family: monospace;
            display: inline-block;
            margin-top: 6px;
          }
          .meta-info {
            font-size: 11px;
            margin-top: 10px;
            line-height: 1.5;
            color: #334155;
            border-top: 1px dashed #cbd5e1;
            padding-top: 8px;
          }
          .cta {
            font-size: 12px;
            font-weight: bold;
            color: #047857;
            margin-top: 6px;
          }
        </style>
      </head>
      <body>
        <div class="sticker-card">
          <div class="header">
            <h1>نظام الإبلاغ الفوري عن أعطال ماكينات البيع</h1>
            <p>Smart Vending Maintenance & Incident Dispatch</p>
          </div>

          <div class="machine-badge">${machine.machineNumber}</div>

          <div class="qr-wrapper">
            <img class="qr-img" src="${qrDataUrl}" alt="QR Code" />
          </div>

          <div class="cta">وجه كاميرا الجوال لمسح الرمز وفتح بلاغ عطل فوري</div>

          <div class="meta-info">
            <div><strong>الموقع:</strong> ${locText}</div>
            <div><strong>رقم الماكينة:</strong> ${machine.machineNumber} | <strong>النوع:</strong> ${machine.machineType || 'VENDING'}</div>
            <div><strong>رابط البلاغ المباشر:</strong> ${publicFaultUrl}</div>
          </div>
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-4">
      {/* Target Selector: Customer Portal vs Field Technician vs Spare Parts */}
      <div className="grid grid-cols-3 p-1 bg-slate-900 border border-slate-800 rounded-xl gap-1">
        <button
          type="button"
          onClick={() => setQrTargetMode('customer')}
          className={`py-2 px-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer truncate ${
            qrTargetMode === 'customer'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          بلاغات العملاء
        </button>

        <button
          type="button"
          onClick={() => setQrTargetMode('technician')}
          className={`py-2 px-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer truncate ${
            qrTargetMode === 'technician'
              ? 'bg-amber-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          فني الصيانة
        </button>

        <button
          type="button"
          onClick={() => setQrTargetMode('part-request')}
          className={`py-2 px-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer truncate ${
            qrTargetMode === 'part-request'
              ? 'bg-indigo-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          طلب قطع الغيار
        </button>
      </div>

      {/* Cloud Gateway URL warning banner when not configured */}
      {!isUrlExplicitlyConfigured && (
        <div className="p-3 bg-amber-950/40 border border-amber-800/80 rounded-xl text-xs text-amber-300 flex items-start gap-2.5 text-right rtl:text-right ltr:text-left">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">PUBLIC_QR_BASE_URL_NOT_CONFIGURED: لم يتم تهيئة رابط النطاق السحابي العام</p>
            <p className="text-[11px] text-amber-200/80 leading-relaxed">
              تم حظر طباعة وتصدير ملصقات الإنتاج مؤقتاً لتجنب توليد أكواد بروابط محلية ({effectiveBaseUrl}) لا يمكن مسحها من هواتف العملاء أو الفنيين في الميدان. يرجى ضبط النطاق العام من تبويب إعدادات السحابة أولاً.
            </p>
          </div>
        </div>
      )}

      {/* Visual QR Code Display Container */}
      <div className="flex flex-col items-center justify-center p-5 bg-white rounded-2xl text-slate-950 text-center shadow-lg border border-slate-200">
        <div className="w-full flex items-center justify-between pb-3 mb-2 border-b border-slate-100 text-xs">
          <span className="font-bold text-slate-800 flex items-center gap-1.5">
            <Smartphone className="w-4 h-4 text-blue-600" />
            <span>
              {qrTargetMode === 'part-request'
                ? 'كود QR طلب قطع الغيار المباشر'
                : qrTargetMode === 'technician'
                ? 'كود QR الميداني للفني'
                : 'رمز الاستجابة السريعة (QR Code)'}
            </span>
          </span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
            qrTargetMode === 'part-request'
              ? 'bg-indigo-100 text-indigo-900'
              : qrTargetMode === 'technician'
              ? 'bg-amber-100 text-amber-900'
              : 'bg-emerald-100 text-emerald-800'
          }`}>
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            {qrTargetMode === 'part-request'
              ? 'وضع قطع الغيار'
              : qrTargetMode === 'technician'
              ? 'وضع الفني الميداني'
              : 'جاهز للمسح'}
          </span>
        </div>

        {/* Real Scannable QR Code Render */}
        <div className={`relative p-2 bg-white rounded-xl border-2 shadow-inner group ${
          qrTargetMode === 'part-request' ? 'border-indigo-600' : qrTargetMode === 'technician' ? 'border-amber-600' : 'border-slate-900'
        }`}>
          {isLoading ? (
            <div className="w-52 h-52 flex flex-col items-center justify-center bg-slate-50 rounded-lg">
              <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mb-2" />
              <span className="text-xs text-slate-500 font-medium">جاري توليد رمز الـ QR...</span>
            </div>
          ) : qrDataUrl ? (
            <div className="relative">
              <img
                src={qrDataUrl}
                alt={`QR Code for Machine ${machine.machineNumber}`}
                className="w-52 h-52 object-contain rounded-md"
              />
              <div className="absolute inset-0 bg-blue-950/0 group-hover:bg-blue-950/10 transition-colors rounded-md pointer-events-none" />
            </div>
          ) : (
            <div className="w-52 h-52 flex items-center justify-center bg-rose-50 text-rose-600 text-xs p-4 rounded-lg">
              فشل توليد رمز الاستجابة السريعة
            </div>
          )}
        </div>

        {/* Machine Tag Header */}
        <div className="mt-3.5 space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-900 text-white rounded-lg font-mono font-bold text-sm tracking-wider shadow-sm">
            <span>رقم الماكينة: {machine.machineNumber}</span>
          </div>
          <div className={`text-[11px] font-medium mt-1 ${
            qrTargetMode === 'part-request'
              ? 'text-indigo-700 font-semibold'
              : qrTargetMode === 'technician'
              ? 'text-amber-700 font-semibold'
              : 'text-emerald-700'
          }`}>
            {qrTargetMode === 'part-request'
              ? 'امسح الرمز لفتح نموذج طلب قطع الغيار المباشر للماكينة إلى المستودع'
              : qrTargetMode === 'technician' 
              ? 'امسح الرمز لفتح بوابة الفني المباشرة لتسجيل الإجراءات وطلب قطع الغيار'
              : 'امسح الرمز بالجوال لفتح صفحة البلاغ مباشرة برقم الماكينة'}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={Download}
            onClick={handleDownloadHighResSticker}
            disabled={!qrDataUrl || isLoading || !isUrlExplicitlyConfigured}
            title={!isUrlExplicitlyConfigured ? 'PUBLIC_QR_BASE_URL_NOT_CONFIGURED: اضبط النطاق السحابي لتفعيل التصدير' : undefined}
            className="text-xs font-semibold disabled:opacity-50"
          >
            تحميل الملصق PNG
          </Button>

          <Button
            variant="outline"
            size="sm"
            icon={Printer}
            onClick={handlePrintLabel}
            disabled={!qrDataUrl || isLoading || !isUrlExplicitlyConfigured}
            title={!isUrlExplicitlyConfigured ? 'PUBLIC_QR_BASE_URL_NOT_CONFIGURED: اضبط النطاق السحابي لتفعيل الطباعة' : undefined}
            className="text-xs font-semibold disabled:opacity-50"
          >
            طباعة ملصق فوري
          </Button>
        </div>

        <Button
          variant="outline"
          size="sm"
          fullWidth
          icon={copied ? Check : Copy}
          onClick={handleCopyLink}
          className="text-xs"
        >
          {copied ? 'تم نسخ الرابط!' : `نسخ رابط ${qrTargetMode === 'part-request' ? 'طلب قطع الغيار' : qrTargetMode === 'technician' ? 'الفني الميداني' : 'البلاغ المباشر'}`}
        </Button>

        {onNavigate && (
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={ExternalLink}
              onClick={() => onNavigate('public-portal', `${token}?mode=customer`)}
              className="text-[11px] border-blue-500/40 text-blue-300 hover:bg-blue-600/20 px-1 truncate"
            >
              بوابة العملاء
            </Button>

            <Button
              variant="primary"
              size="sm"
              icon={ExternalLink}
              onClick={() => onNavigate('technician-portal', `${token}`)}
              className="text-[11px] bg-amber-600 hover:bg-amber-500 text-white font-bold px-1 truncate"
            >
              بوابة الفني
            </Button>

            <Button
              variant="primary"
              size="sm"
              icon={ExternalLink}
              onClick={() => onNavigate('technician-portal', `${token}?tab=parts`)}
              className="text-[11px] bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-1 truncate"
            >
              طلب قطع غيار
            </Button>
          </div>
        )}

        {canRegenerate && onRegenerate && (
          <Button
            variant="outline"
            size="sm"
            fullWidth
            icon={RefreshCw}
            onClick={onRegenerate}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            توليد رمز QR بديل (Regenerate ID)
          </Button>
        )}
      </div>
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { QrCode, Camera, Search, ArrowRight, Wrench, FileText, Monitor, ChevronRight, Video, VideoOff, Package } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { useLanguage } from '../../context/LanguageContext';
import { api } from '../../services/api';
import { Machine } from '../../types';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMachine: (machineIdOrCode: string, targetMode?: 'technician' | 'machine' | 'customer' | 'part-request') => void;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  isOpen,
  onClose,
  onSelectMachine
}) => {
  const { t, isRTL } = useLanguage();
  const [manualCode, setManualCode] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selectedMachinePreview, setSelectedMachinePreview] = useState<Machine | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (isOpen) {
      api.getMachines().then(res => {
        if (Array.isArray(res)) setMachines(res);
      }).catch(() => {});
      setSelectedMachinePreview(null);
      setCameraError(null);
    } else {
      stopCamera();
    }
  }, [isOpen]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera not supported in this browser');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
      setIsScanning(true);
    } catch (err: any) {
      console.warn('Camera access issue:', err);
      setCameraError(isRTL ? 'تعذر فتح الكاميرا الحقيقية، تم تفعيل وضع المحاكاة الضوئية' : 'Could not access device camera, simulation mode active');
      setCameraActive(false);
      setIsScanning(true);
    }
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const handleSimulatedScan = (machine: Machine) => {
    stopCamera();
    setSelectedMachinePreview(machine);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      const clean = manualCode.trim().toUpperCase();
      const match = machines.find(m => 
        m.machineNumber.toUpperCase() === clean || 
        m.publicId.toUpperCase() === clean || 
        (m.publicQrId && m.publicQrId.toUpperCase() === clean)
      );
      if (match) {
        stopCamera();
        setSelectedMachinePreview(match);
      } else {
        stopCamera();
        onSelectMachine(manualCode.trim(), 'technician');
        onClose();
      }
    }
  };

  const handleDirectAction = (targetMode: 'technician' | 'machine' | 'customer' | 'part-request') => {
    if (selectedMachinePreview) {
      const code = selectedMachinePreview.publicQrId || selectedMachinePreview.publicId || selectedMachinePreview.machineNumber;
      stopCamera();
      onSelectMachine(code, targetMode);
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        stopCamera();
        onClose();
      }}
      title={isRTL ? 'ماسح الـ QR ومحاكاة التفاعل الميداني' : 'QR Scanner & Field Dispatch'}
      subtitle={isRTL ? 'امسح رمز الـ QR الملصق على الماكينة لاتخاذ إجراءات الصيانة أو تسجيل البلاغات' : 'Point camera at physical vending machine QR code or select from fleet'}
      maxWidth="md"
    >
      <div className="space-y-5">
        {selectedMachinePreview ? (
          /* Action Destination Chooser for Scanned Machine */
          <div className="p-4 rounded-xl bg-slate-950 border border-amber-500/40 space-y-4 animate-fade-in text-right">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <span className="text-[11px] text-slate-400 block">تم التعرف على الماكينة عبر QR:</span>
                <span className="text-lg font-mono font-bold text-amber-400">
                  ماكينة #{selectedMachinePreview.machineNumber}
                </span>
              </div>
              <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-900 border border-slate-700 text-slate-200">
                {selectedMachinePreview.currentLocation?.building?.name || 'موقع الماكينة'}
              </span>
            </div>

            <p className="text-xs text-slate-300 font-medium">
              اختر الإجراء الذي تريد تنفيذه على هذه الماكينة:
            </p>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleDirectAction('technician')}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/50 text-amber-200 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3 text-right">
                  <div className="p-2 rounded-lg bg-amber-600 text-white shadow">
                    <Wrench className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-xs sm:text-sm text-slate-100">
                      بوابة الفني الميداني (تسجيل إجراء وتدخل)
                    </div>
                    <div className="text-[11px] text-amber-300/80">
                      توثيق بيانات الفني، إنهاء الأعطال، وتسجيل الصيانة
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-amber-400 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                type="button"
                onClick={() => handleDirectAction('part-request')}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/50 text-indigo-200 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3 text-right">
                  <div className="p-2 rounded-lg bg-indigo-600 text-white shadow">
                    <Package className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-xs sm:text-sm text-slate-100">
                      طلب قطعة غيار فورية للمستودع (Part Request)
                    </div>
                    <div className="text-[11px] text-indigo-300/80">
                      طلب توريد وصرف قطع الغيار لهذه الماكينة مباشرة
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-indigo-400 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                type="button"
                onClick={() => handleDirectAction('machine')}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-700 text-slate-200 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3 text-right">
                  <div className="p-2 rounded-lg bg-blue-600 text-white shadow">
                    <Monitor className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-xs sm:text-sm text-slate-100">
                      عرض لوحة وتفاصيل الماكينة بالكامل
                    </div>
                    <div className="text-[11px] text-slate-400">
                      سجل الحالة، الصحة التشغيلية، وموقع الماكينة
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                type="button"
                onClick={() => handleDirectAction('customer')}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3 text-right">
                  <div className="p-2 rounded-lg bg-slate-800 text-slate-300 shadow">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-xs sm:text-sm text-slate-200">
                      تسجيل بلاغ عطل كعميل / مستفيد
                    </div>
                    <div className="text-[11px] text-slate-400">
                      بوابة الجمهور العامة للبلاغات السريعة
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setSelectedMachinePreview(null)}
                className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer"
              >
                رجوع لمسح كود ماكينة أخرى
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Camera Viewport */}
            <div className="relative aspect-video rounded-xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center overflow-hidden">
              {cameraActive ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              ) : null}

              <div className="absolute inset-4 border-2 border-dashed border-amber-500/60 rounded-lg flex items-center justify-center pointer-events-none">
                <div className="w-full h-0.5 bg-amber-400/80 shadow-lg shadow-amber-500 animate-bounce" />
              </div>
              
              {!cameraActive && (
                <>
                  <Camera className="w-8 h-8 text-slate-500 mb-2" />
                  <span className="text-xs text-slate-400 font-mono">
                    {isScanning ? 'Optical recognition active...' : 'Camera Ready (Auto-Detect QR)'}
                  </span>
                </>
              )}

              {cameraError && (
                <div className="absolute top-2 inset-x-2 text-center p-1 bg-amber-950/80 border border-amber-500/40 text-[10px] text-amber-300 rounded">
                  {cameraError}
                </div>
              )}

              <div className="absolute bottom-3 inset-x-3 flex justify-center gap-2">
                {cameraActive ? (
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="px-3 py-1 bg-rose-900/90 border border-rose-700 rounded-full text-[11px] text-white flex items-center gap-1 cursor-pointer"
                  >
                    <VideoOff className="w-3.5 h-3.5" />
                    <span>إيقاف الكاميرا الحية</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startCamera}
                    className="px-3 py-1 bg-blue-600/90 hover:bg-blue-500 border border-blue-500 rounded-full text-[11px] text-white flex items-center gap-1 cursor-pointer shadow"
                  >
                    <Video className="w-3.5 h-3.5" />
                    <span>تشغيل كاميرا الجهاز</span>
                  </button>
                )}
              </div>
            </div>

            {/* Quick Fleet Select Shortcuts */}
            {machines.length > 0 && (
              <div>
                <span className="text-xs font-medium text-slate-400 block mb-2 text-right">
                  أو اختر ماكينة مباشرة لمحاكاة قراءة الـ QR Code:
                </span>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                  {machines.slice(0, 8).map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleSimulatedScan(m)}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700 text-right cursor-pointer transition-colors text-xs"
                    >
                      <div className="overflow-hidden pr-1">
                        <div className="font-mono font-bold text-amber-400 truncate">ماكينة #{m.machineNumber}</div>
                        <div className="text-[10px] text-slate-300 truncate">{m.currentLocation?.building?.name || m.currentLocation?.areaZone || 'Site'}</div>
                      </div>
                      <QrCode className="w-4 h-4 text-slate-400 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Manual Code Input Form */}
            <form onSubmit={handleManualSubmit} className="pt-2 border-t border-slate-800">
              <label className="text-xs font-medium text-slate-300 block mb-1.5 text-right">
                إدخال رقم الماكينة أو كود الـ QR يدوياً:
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className={`absolute top-2.5 ${isRTL ? 'right-3' : 'left-3'} w-4 h-4 text-slate-400`} />
                  <input
                    type="text"
                    value={manualCode}
                    onChange={e => setManualCode(e.target.value)}
                    placeholder="مثال: 101 أو VM-B01-F01-01"
                    className={`w-full bg-slate-950 border border-slate-700 rounded-lg py-2 ${
                      isRTL ? 'pr-9 pl-3' : 'pl-9 pr-3'
                    } text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500`}
                  />
                </div>
                <Button type="submit" variant="primary" size="sm" icon={ArrowRight} iconPosition="end">
                  {t('confirm')}
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </Modal>
  );
};

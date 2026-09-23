import React, { useEffect, useRef, useState } from 'react';

interface MobileCameraCaptureProps {
  onCapture: (dataUrl: string, mimeType: string) => void;
  disabled?: boolean;
}

export const MobileCameraCapture: React.FC<MobileCameraCaptureProps> = ({
  onCapture,
  disabled = false
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraFileRef = useRef<HTMLInputElement | null>(null);
  const galleryFileRef = useRef<HTMLInputElement | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    setCameraError(null);

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setCameraError(
        'المتصفح لا يدعم فتح الكاميرا المباشرة. استخدم زر كاميرا الجهاز البديل.'
      );
      return;
    }

    try {
      stopCamera();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: {
            ideal: 'environment'
          }
        },
        audio: false
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;

        await videoRef.current.play();
      }

      setCameraActive(true);
    } catch (err: any) {
      console.warn('[TechnicianCamera] Camera access failed:', err);

      const name = String(err?.name || '');

      if (
        name === 'NotAllowedError' ||
        name === 'PermissionDeniedError'
      ) {
        setCameraError(
          'تم رفض صلاحية الكاميرا. اسمح للموقع باستخدام الكاميرا ثم حاول مرة أخرى.'
        );
      } else if (
        name === 'NotFoundError' ||
        name === 'DevicesNotFoundError'
      ) {
        setCameraError('لم يتم العثور على كاميرا متاحة على الجهاز.');
      } else {
        setCameraError(
          'تعذر فتح الكاميرا المباشرة. يمكنك استخدام كاميرا الجهاز أو اختيار صورة.'
        );
      }
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;

    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
      setCameraError('الكاميرا لم تصبح جاهزة بعد. حاول مرة أخرى.');
      return;
    }

    const canvas = document.createElement('canvas');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');

    if (!ctx) {
      setCameraError('تعذر تجهيز الصورة الملتقطة.');
      return;
    }

    ctx.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height
    );

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

    onCapture(dataUrl, 'image/jpeg');
    stopCamera();
    setCameraError(null);
  };

  const handleFile = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];

    if (!file) return;

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp'
    ];

    if (!allowedTypes.includes(file.type)) {
      setCameraError(
        'نوع الصورة غير مدعوم. استخدم JPEG أو PNG أو WEBP.'
      );
      e.target.value = '';
      return;
    }

    const reader = new FileReader();

    reader.onloadend = () => {
      const result = reader.result;

      if (typeof result === 'string') {
        onCapture(
          result,
          file.type || 'image/jpeg'
        );

        setCameraError(null);
      }
    };

    reader.onerror = () => {
      setCameraError('تعذر قراءة الصورة المختارة.');
    };

    reader.readAsDataURL(file);

    // Allow choosing the same file again if needed.
    e.target.value = '';
  };

  return (
    <div className="space-y-3">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={
          cameraActive
            ? 'w-full rounded-xl bg-black border border-slate-700 max-h-80 object-cover'
            : 'hidden'
        }
      />

      {!cameraActive ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={startCamera}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition"
          >
            📷 فتح الكاميرا
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={() => galleryFileRef.current?.click()}
            className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-100 rounded-xl text-sm font-bold transition"
          >
            🖼️ اختيار صورة من الهاتف
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={capturePhoto}
            className="py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold"
          >
            📸 التقاط الصورة
          </button>

          <button
            type="button"
            onClick={stopCamera}
            className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl text-sm font-bold"
          >
            إلغاء
          </button>
        </div>
      )}

      {/*
        Native mobile camera fallback.
        This remains useful for browsers where getUserMedia is restricted.
      */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => cameraFileRef.current?.click()}
        className="w-full py-2.5 px-4 border border-slate-700 hover:border-slate-600 text-slate-300 rounded-xl text-xs font-semibold"
      >
        📱 استخدام كاميرا الجهاز البديلة
      </button>

      <input
        ref={cameraFileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="hidden"
      />

      <input
        ref={galleryFileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFile}
        className="hidden"
      />

      {cameraError && (
        <div className="p-3 rounded-xl bg-red-950/40 border border-red-900 text-xs text-red-300">
          {cameraError}
        </div>
      )}
    </div>
  );
};

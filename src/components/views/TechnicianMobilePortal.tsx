import React, { useState, useEffect } from 'react';
import {
  Wrench,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Camera,
  Check,
  Send,
  RefreshCw,
  Clock,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  LogOut,
  Package,
  FileCheck,
  Building,
  Navigation
} from 'lucide-react';
import { Ticket, SparePart, TechnicianCheckInRecord } from '../../types/database';

interface TechnicianMobilePortalProps {
  onBackToApp?: () => void;
}

export const TechnicianMobilePortal: React.FC<TechnicianMobilePortalProps> = ({
  onBackToApp
}) => {
  // Auth State
  const [token, setToken] = useState<string>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('vending_tech_token') || '' : '';
  });
  const [technician, setTechnician] = useState<any>(() => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('vending_tech_profile') : null;
    return raw ? JSON.parse(raw) : null;
  });

  // Login inputs
  const [employeeCode, setEmployeeCode] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  // Active View / Workflow State
  const [activeTab, setActiveTab] = useState<'MY_TICKETS' | 'ACTIVE_TICKET'>('MY_TICKETS');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isLoadingTickets, setIsLoadingTickets] = useState<boolean>(false);

  // Check-in & GPS state
  const [machineTokenInput, setMachineTokenInput] = useState<string>('');
  const [isGettingGps, setIsGettingGps] = useState<boolean>(false);
  const [currentGps, setCurrentGps] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [manualReason, setManualReason] = useState<string>('');
  const [checkInResult, setCheckInResult] = useState<TechnicianCheckInRecord | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState<boolean>(false);
  const [checkInError, setCheckInError] = useState<string | null>(null);

  // Evidence state
  const [evidenceType, setEvidenceType] = useState<string>('BEFORE_PHOTO');
  const [evidenceCaption, setEvidenceCaption] = useState<string>('');
  const [evidenceFile, setEvidenceFile] = useState<string | null>(null);
  const [isUploadingEvidence, setIsUploadingEvidence] = useState<boolean>(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Functional Test state
  const [testType, setTestType] = useState<string>('VEND_AND_POS');
  const [testStatus, setTestStatus] = useState<'PASSED' | 'FAILED'>('PASSED');
  const [testNotes, setTestNotes] = useState<string>('تمت تجربة دورة إسقاط المنتج وقبول الدفع بمدى بنجاح تام');
  const [isSavingTest, setIsSavingTest] = useState<boolean>(false);

  // Spare Part Request state
  const [sparePartsCatalog, setSparePartsCatalog] = useState<SparePart[]>([]);
  const [selectedPartId, setSelectedPartId] = useState<string>('');
  const [partQty, setPartQty] = useState<number>(1);
  const [partReason, setPartReason] = useState<string>('');
  const [isRequestingPart, setIsRequestingPart] = useState<boolean>(false);
  const [partRequestMessage, setPartRequestMessage] = useState<string | null>(null);

  // Resolution state
  const [resolutionSummary, setResolutionSummary] = useState<string>('تم استبدال الحساس وفحص وحدة التبريد واختبار دورة التشغيل');
  const [rootCause, setRootCause] = useState<string>('تراكم أتربة في مروحة التبريد وتلف مكثف الباور');
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // Load technician profile & tickets
  const loadTickets = async () => {
    if (!token) return;
    setIsLoadingTickets(true);
    try {
      const res = await fetch('/technician/tickets', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTickets(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to load technician tickets:', err);
    } finally {
      setIsLoadingTickets(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadTickets();
      // Load spare parts for request dropdown
      fetch('/spare-parts')
        .then((res) => res.json())
        .then((parts) => {
          if (Array.isArray(parts)) {
            setSparePartsCatalog(parts);
            if (parts.length > 0) setSelectedPartId(parts[0].id);
          }
        })
        .catch(() => {});
    }
  }, [token]);

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError(null);

    try {
      const res = await fetch('/technician/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeCode, pin })
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'فشل تسجيل الدخول');
      }

      setToken(json.token);
      setTechnician(json.technician);
      if (typeof window !== 'undefined') {
        localStorage.setItem('vending_tech_token', json.token);
        localStorage.setItem('vending_tech_profile', JSON.stringify(json.technician));
      }
    } catch (err: any) {
      setLoginError(err.message || 'خطأ في المصادقة');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setToken('');
    setTechnician(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('vending_tech_token');
      localStorage.removeItem('vending_tech_profile');
    }
  };

  // Request GPS from browser (FIX 5: No hardcoded fallback)
  const captureGps = () => {
    if (!navigator.geolocation) {
      setGpsError('المتصفح لا يدعم تحديد الموقع الجغرافي');
      setCheckInError('المتصفح لا يدعم تحديد الموقع الجغرافي. يرجى إدخال سبب استثناء يدوي.');
      return;
    }
    setIsGettingGps(true);
    setGpsError(null);
    setCheckInError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCurrentGps({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        });
        setGpsError(null);
        setIsGettingGps(false);
      },
      (err) => {
        console.warn('GPS lookup error:', err);
        setCurrentGps(null);
        const errMsg = err.code === 1
          ? 'تم رفض إذن الوصول للموقع الجغرافي. يرجى تفعيل الموقع أو كتابة سبب استثناء يدوي.'
          : 'تعذر الحصول على إحداثيات GPS دقيقة من جهازك. يرجى كتابة سبب استثناء يدوي أدناه.';
        setGpsError(errMsg);
        setCheckInError(errMsg);
        setIsGettingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Perform Check-in
  const handleCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !token) return;

    setIsCheckingIn(true);
    setCheckInError(null);

    try {
      const res = await fetch('/technician/checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ticketId: selectedTicket.id,
          machineToken: machineTokenInput.trim() || selectedTicket.machine?.publicQrToken,
          latitude: currentGps?.lat,
          longitude: currentGps?.lng,
          accuracyMeters: currentGps?.accuracy,
          manualExceptionReason: manualReason.trim() || undefined
        })
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'فشل التحقق الميداني');
      }

      setCheckInResult(json.checkIn);
      loadTickets();
    } catch (err: any) {
      setCheckInError(err.message || 'فشل التحقق');
    } finally {
      setIsCheckingIn(false);
    }
  };

  // Evidence File Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEvidenceFile(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Upload Evidence
  const handleUploadEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !evidenceFile || !token) return;

    setIsUploadingEvidence(true);
    setUploadSuccess(null);

    try {
      const res = await fetch('/technician/evidence', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ticketId: selectedTicket.id,
          evidenceType,
          caption: evidenceCaption,
          fileData: evidenceFile
        })
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'فشل رفع الصورة');
      }

      setUploadSuccess('تم حفظ ورفع الصورة التوثيقية بنجاح!');
      setEvidenceFile(null);
      setEvidenceCaption('');
      loadTickets();
    } catch (err: any) {
      alert(err.message || 'خطأ أثناء رفع الصورة');
    } finally {
      setIsUploadingEvidence(false);
    }
  };

  // Save Functional Test
  const handleSaveFunctionalTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !token) return;

    setIsSavingTest(true);
    try {
      const res = await fetch('/technician/functional-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ticketId: selectedTicket.id,
          testType,
          status: testStatus,
          notes: testNotes
        })
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.message);
      }

      alert('تم حفظ نتيجة الفحص التشغيلي بنجاح!');
      loadTickets();
    } catch (err: any) {
      alert(err.message || 'فشل حفظ الفحص');
    } finally {
      setIsSavingTest(false);
    }
  };

  // Request Spare Part
  const handleRequestSparePart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !selectedPartId || !token) return;

    setIsRequestingPart(true);
    setPartRequestMessage(null);

    try {
      const res = await fetch('/technician/request-part', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ticketId: selectedTicket.id,
          partId: selectedPartId,
          quantity: partQty,
          reason: partReason
        })
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'فشل طلب قطعة الغيار');
      }

      setPartRequestMessage(`تم إنشاء طلب الصرف برقم ${json.partRequest.requestNumber} بنجاح!`);
      setPartReason('');
      loadTickets();
    } catch (err: any) {
      alert(err.message || 'فشل إرسال طلب قطعة الغيار');
    } finally {
      setIsRequestingPart(false);
    }
  };

  // Resolve Ticket
  const handleResolveTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !token) return;

    setIsResolving(true);
    setResolveError(null);

    try {
      const res = await fetch('/technician/resolve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ticketId: selectedTicket.id,
          resolutionSummary,
          rootCause
        })
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'فشل إنهاء التذكرة');
      }

      alert('تم إنهاء الصيانة وحل التذكرة بنجاح! تحولت التذكرة لاعتماد المدير (VERIFIED).');
      setSelectedTicket(null);
      setActiveTab('MY_TICKETS');
      loadTickets();
    } catch (err: any) {
      setResolveError(err.message || 'خطأ أثناء حل التذكرة');
    } finally {
      setIsResolving(false);
    }
  };

  // If not logged in, render Mobile Technician Login
  if (!token) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4" dir="rtl">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-2xl">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-sky-950/80 border border-sky-800 rounded-2xl flex items-center justify-center mx-auto text-sky-400">
              <Wrench className="w-7 h-7" />
            </div>
            <h1 className="text-lg font-bold text-white">بوابة الفني الميداني</h1>
            <p className="text-xs text-slate-400">تسجيل الدخول لجلسة الصيانة المتنقلة والتحقق بالـ GPS</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                الكود الوظيفي للفني (Employee Code)
              </label>
              <input
                type="text"
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                placeholder="TECH-001"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 uppercase font-mono focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                رمز المرور أو PIN
              </label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="****"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 font-mono focus:border-sky-500 focus:outline-none"
              />
            </div>

            {loginError && (
              <div className="p-3 bg-rose-950/50 border border-rose-800 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3 px-4 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-sky-600/30 transition flex items-center justify-center gap-2"
            >
              {isLoggingIn ? <RefreshCw className="w-4 h-4 animate-spin" /> : <span>دخول الفني</span>}
            </button>
          </form>

          {onBackToApp && (
            <div className="text-center pt-2">
              <button
                onClick={onBackToApp}
                className="text-xs text-slate-400 hover:text-slate-200 transition"
              >
                العودة للوحة النظام الرئيسية
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Logged-in Technician UI
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between" dir="rtl">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900 px-4 py-3 sticky top-0 z-20">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3 space-x-reverse">
            <div className="w-9 h-9 rounded-xl bg-sky-600 flex items-center justify-center text-white font-bold text-sm">
              {technician?.fullName?.slice(0, 2) || 'فني'}
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">{technician?.fullName}</h2>
              <span className="text-[11px] text-sky-400 font-mono">{technician?.employeeCode}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="تسجيل الخروج"
            >
              <LogOut className="w-4 h-4" />
            </button>
            {onBackToApp && (
              <button
                onClick={onBackToApp}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
              >
                اللوحة
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-xl w-full mx-auto p-4 space-y-5">
        {/* View Mode Switcher */}
        {selectedTicket && (
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl p-3">
            <div>
              <span className="text-xs text-slate-400 block font-mono">{selectedTicket.ticketNumber}</span>
              <h3 className="text-sm font-bold text-white">الماكينة #{selectedTicket.machine?.machineNumber}</h3>
            </div>
            <button
              onClick={() => setSelectedTicket(null)}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              قائمة التذاكر
            </button>
          </div>
        )}

        {/* 1. TICKETS LIST */}
        {!selectedTicket && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-200">التذاكر المسندة إليك ({tickets.length})</h2>
              <button
                onClick={loadTickets}
                className="text-xs p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingTickets ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {tickets.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-2 text-slate-400 text-sm">
                <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500/80 mb-2" />
                <p>لا توجد تذاكر معلقة مسندة لك حالياً.</p>
              </div>
            ) : (
              tickets.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setSelectedTicket(t)}
                  className="bg-slate-900 border border-slate-800 hover:border-sky-500/60 rounded-2xl p-4 space-y-3 cursor-pointer transition shadow-md"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs font-mono text-sky-400 font-semibold">{t.ticketNumber}</span>
                      <h4 className="text-sm font-bold text-white mt-0.5">
                        ماكينة #{t.machine?.machineNumber} — {t.title || t.category}
                      </h4>
                    </div>
                    <span
                      className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border ${
                        t.status === 'IN_PROGRESS'
                          ? 'bg-sky-950 text-sky-300 border-sky-800'
                          : t.status === 'WAITING_FOR_PART'
                          ? 'bg-amber-950 text-amber-300 border-amber-800'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>

                  <div className="text-xs text-slate-400 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span>{t.machine?.currentLocation?.fullDescription || 'منطقة الحرم الجامعي'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* 2. ACTIVE TICKET WORKFLOW */}
        {selectedTicket && (
          <div className="space-y-6">
            {/* STEP A: Field Check-in & GPS Verification */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Navigation className="w-5 h-5 text-sky-400" />
                  <h3 className="text-sm font-bold text-white">1. التحقق الميداني والـ GPS</h3>
                </div>
                {checkInResult || selectedTicket.gpsVerificationStatus ? (
                  <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    {checkInResult?.status || selectedTicket.gpsVerificationStatus}
                  </span>
                ) : (
                  <span className="text-xs text-amber-400 font-medium">مطلوب عند الوصول</span>
                )}
              </div>

              {!(checkInResult || selectedTicket.gpsVerificationStatus) ? (
                <form onSubmit={handleCheckin} className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">
                      رمز الـ QR الممسوح من الماكينة
                    </label>
                    <input
                      type="text"
                      value={machineTokenInput}
                      onChange={(e) => setMachineTokenInput(e.target.value)}
                      placeholder={selectedTicket.machine?.publicQrToken || 'امسح أو اكتب رمز الـ QR'}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={captureGps}
                      disabled={isGettingGps}
                      className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs flex items-center justify-center gap-1.5"
                    >
                      <MapPin className="w-3.5 h-3.5 text-rose-400" />
                      <span>
                        {isGettingGps
                          ? 'جارٍ قراءة إشارة الـ GPS...'
                          : currentGps
                          ? `تم تحديد الإحداثيات (الدقة: ±${Math.round(currentGps.accuracy || 0)}م)`
                          : 'التقاط إحداثيات الموقع (GPS)'}
                      </span>
                    </button>
                    {gpsError && (
                      <p className="text-[11px] text-amber-400">
                        {gpsError}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      سبب الاستثناء اليدوي (إذا كنت في موقع داخلي بدون إشارة GPS)
                    </label>
                    <input
                      type="text"
                      value={manualReason}
                      onChange={(e) => setManualReason(e.target.value)}
                      placeholder="مثال: القبو الثاني لا تتوفر فيه تغطية GPS"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100"
                    />
                  </div>

                  {checkInError && (
                    <div className="p-2.5 bg-rose-950/50 border border-rose-800 rounded-xl text-xs text-rose-300">
                      {checkInError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isCheckingIn}
                    className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold text-xs shadow-md transition"
                  >
                    {isCheckingIn ? 'جارٍ التحقق...' : 'تأكيد الوصول وبدء الصيانة'}
                  </button>
                </form>
              ) : (
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs space-y-1 text-slate-300">
                  <p>• المسافة المحسوبة: {checkInResult?.distanceMeters ?? selectedTicket.gpsDistanceMeters ?? 0} متر</p>
                  <p>• الحالة: {checkInResult?.status ?? selectedTicket.gpsVerificationStatus}</p>
                  {selectedTicket.startedAt && <p>• وقت البدء: {new Date(selectedTicket.startedAt).toLocaleTimeString('ar-SA')}</p>}
                </div>
              )}
            </div>

            {/* STEP B: Upload Evidence Photos */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Camera className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-sm font-bold text-white">2. التوثيق الميداني بالصور</h3>
                </div>
                <span className="text-xs text-slate-400">
                  {selectedTicket.evidence?.length || 0} صور مسجلة
                </span>
              </div>

              <form onSubmit={handleUploadEvidence} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={evidenceType}
                    onChange={(e) => setEvidenceType(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                  >
                    <option value="BEFORE_PHOTO">صورة العطل (قبل الإصلاح)</option>
                    <option value="AFTER_PHOTO">صورة بعد الإصلاح</option>
                    <option value="DIAGNOSTIC">صورة الشاشة / التشخيص</option>
                    <option value="COMPONENT">صورة القطعة المستبدلة</option>
                  </select>

                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileChange}
                    className="text-xs text-slate-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-slate-800 file:text-slate-200"
                  />
                </div>

                <input
                  type="text"
                  value={evidenceCaption}
                  onChange={(e) => setEvidenceCaption(e.target.value)}
                  placeholder="ملاحظة توضيحية حول الصورة..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100"
                />

                {uploadSuccess && (
                  <p className="text-xs text-emerald-400 font-medium">{uploadSuccess}</p>
                )}

                <button
                  type="submit"
                  disabled={!evidenceFile || isUploadingEvidence}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
                >
                  {isUploadingEvidence ? 'جارٍ رفع الصورة...' : 'حفظ الصورة في ملف التذكرة'}
                </button>
              </form>
            </div>

            {/* STEP C: Functional Test */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">3. الاختبار والفحص التشغيلي</h3>
                </div>
                {selectedTicket.functionalTest && (
                  <span
                    className={`text-xs font-bold ${
                      selectedTicket.functionalTest.status === 'PASSED' ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {selectedTicket.functionalTest.status}
                  </span>
                )}
              </div>

              <form onSubmit={handleSaveFunctionalTest} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={testType}
                    onChange={(e) => setTestType(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                  >
                    <option value="VEND_AND_POS">دورة بيع كاملة + مدى</option>
                    <option value="REFRIGERATION">فحص التبريد والحرارة</option>
                    <option value="MECHANICAL_DROP">فحص المواتير وحساس السقوط</option>
                    <option value="DISPLAY_KEYPAD">فحص الشاشة والأزرار</option>
                  </select>

                  <select
                    value={testStatus}
                    onChange={(e) => setTestStatus(e.target.value as any)}
                    className={`border rounded-xl px-3 py-2 text-xs font-bold ${
                      testStatus === 'PASSED'
                        ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                        : 'bg-rose-950/60 border-rose-800 text-rose-300'
                    }`}
                  >
                    <option value="PASSED">نجح الاختبار (PASSED)</option>
                    <option value="FAILED">فشل الاختبار (FAILED)</option>
                  </select>
                </div>

                <textarea
                  value={testNotes}
                  onChange={(e) => setTestNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100"
                />

                <button
                  type="submit"
                  disabled={isSavingTest}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition"
                >
                  {isSavingTest ? 'جارٍ الحفظ...' : 'تسجيل نتيجة الفحص'}
                </button>
              </form>
            </div>

            {/* STEP D: Spare Part Request */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-amber-400" />
                  <h3 className="text-sm font-bold text-white">4. طلب قطع غيار من المستودع</h3>
                </div>
              </div>

              <form onSubmit={handleRequestSparePart} className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <select
                      value={selectedPartId}
                      onChange={(e) => setSelectedPartId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                    >
                      {sparePartsCatalog.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.currentQuantity ?? 0} متوفر)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={partQty}
                      onChange={(e) => setPartQty(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 text-center"
                    />
                  </div>
                </div>

                <input
                  type="text"
                  value={partReason}
                  onChange={(e) => setPartReason(e.target.value)}
                  placeholder="سبب طلب القطعة..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100"
                />

                {partRequestMessage && (
                  <p className="text-xs text-emerald-400 font-medium">{partRequestMessage}</p>
                )}

                <button
                  type="submit"
                  disabled={isRequestingPart}
                  className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition"
                >
                  {isRequestingPart ? 'جارٍ الإرسال...' : 'إرسال طلب الصرف للمستودع'}
                </button>
              </form>
            </div>

            {/* STEP E: Ticket Resolution (Guard: Fails if functional test failed) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-white">5. إنهاء الصيانة وحل التذكرة (RESOLVED)</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  يتطلب نجاح الفحص التشغيلي قبل تحويل التذكرة لاعتماد مدير الصيانة
                </p>
              </div>

              <form onSubmit={handleResolveTicket} className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">السبب الجذري للمشكلة (Root Cause)</label>
                  <input
                    type="text"
                    value={rootCause}
                    onChange={(e) => setRootCause(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">ملخص الإجراء المنفذ</label>
                  <textarea
                    value={resolutionSummary}
                    onChange={(e) => setResolutionSummary(e.target.value)}
                    rows={2}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100"
                  />
                </div>

                {resolveError && (
                  <div className="p-2.5 bg-rose-950/50 border border-rose-800 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>{resolveError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isResolving}
                  className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-bold text-sm shadow-lg transition"
                >
                  {isResolving ? 'جارٍ إنهاء التذكرة...' : 'إنهاء الصيانة وإرسالها للاعتماد (Resolve Ticket)'}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

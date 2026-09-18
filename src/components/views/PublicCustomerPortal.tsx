import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  MapPin,
  Send,
  Search,
  Phone,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  Copy,
  Check,
  Building,
  Wrench,
  HelpCircle,
  CreditCard,
  Banknote,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { PublicMachineSummary, PublicTicketTracking, FaultCategory } from '../../types/database';

interface PublicCustomerPortalProps {
  initialToken?: string;
  initialTrackingToken?: string;
  onNavigateToAdmin?: () => void;
}

export const PublicCustomerPortal: React.FC<PublicCustomerPortalProps> = ({
  initialToken,
  initialTrackingToken,
  onNavigateToAdmin
}) => {
  // Navigation sub-state: 'REPORT' | 'TRACK' | 'SUCCESS' | 'INVALID_QR'
  const [viewMode, setViewMode] = useState<'REPORT' | 'TRACK' | 'SUCCESS' | 'INVALID_QR'>('REPORT');
  
  // Machine Token & Public Data
  const [token, setToken] = useState<string>(initialToken || '');
  const [machineData, setMachineData] = useState<PublicMachineSummary | null>(null);
  const [isLoadingMachine, setIsLoadingMachine] = useState<boolean>(true);
  const [machineError, setMachineError] = useState<string | null>(null);

  // Fault Report Form
  const [category, setCategory] = useState<FaultCategory>('CARD_POS');
  const [description, setDescription] = useState<string>('');
  const [reporterName, setReporterName] = useState<string>('');
  const [reporterPhone, setReporterPhone] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Success Result
  const [submissionResult, setSubmissionResult] = useState<{
    ticketNumber: string;
    trackingToken: string;
    status: string;
    message: string;
    createdAt: string;
  } | null>(null);

  // Tracking Lookup
  const [trackingQuery, setTrackingQuery] = useState<string>(initialTrackingToken || '');
  const [trackingData, setTrackingData] = useState<PublicTicketTracking | null>(null);
  const [isTrackingLoading, setIsTrackingLoading] = useState<boolean>(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);

  // UI helpers
  const [copied, setCopied] = useState<boolean>(false);
  const [isArabic, setIsArabic] = useState<boolean>(true);

  // Detect token from URL if not passed in props
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname;
      const search = window.location.search;
      const params = new URLSearchParams(search);

      if (pathname.includes('/public/m/')) {
        const extracted = pathname.split('/public/m/')[1]?.split('/')[0]?.split('?')[0];
        if (extracted) setToken(extracted);
      } else if (pathname.includes('/public/ticket/')) {
        const extracted = pathname.split('/public/ticket/')[1]?.split('/')[0]?.split('?')[0];
        if (extracted) {
          setTrackingQuery(extracted);
          setViewMode('TRACK');
        }
      } else {
        const queryToken = params.get('token') || params.get('qr') || params.get('machineId');
        if (queryToken) setToken(queryToken);
        const queryTrack = params.get('track');
        if (queryTrack) {
          setTrackingQuery(queryTrack);
          setViewMode('TRACK');
        }
      }
    }
  }, []);

  // Fetch sanitized machine info whenever token changes
  useEffect(() => {
    if (!token) {
      setIsLoadingMachine(false);
      return;
    }

    let isMounted = true;
    setIsLoadingMachine(true);
    setMachineError(null);

    fetch(`/public/m/${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.message || 'INVALID_QR_TOKEN');
        }
        return res.json();
      })
      .then((data: PublicMachineSummary) => {
        if (isMounted) {
          setMachineData(data);
          setIsLoadingMachine(false);
          setViewMode('REPORT');
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.warn('[PublicPortal] Machine lookup failed:', err.message);
          setMachineError(err.message);
          setIsLoadingMachine(false);
          setViewMode('INVALID_QR');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  // Handle Tracking Lookup
  const handleLookupTracking = (searchCode?: string) => {
    const code = (searchCode || trackingQuery).trim();
    if (!code) return;

    if (!code.toUpperCase().startsWith('TRK-')) {
      setTrackingData(null);
      setTrackingError(
        isArabic
          ? 'استخدم رمز التتبع الآمن الذي يبدأ بـ TRK- والموجود في إيصال البلاغ.'
          : 'Use the secure tracking token beginning with TRK- from your ticket receipt.'
      );
      return;
    }

    setIsTrackingLoading(true);
    setTrackingError(null);

    fetch(`/public/ticket/${encodeURIComponent(code)}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || 'لم يتم العثور على التذكرة');
        }
        return res.json();
      })
      .then((data: PublicTicketTracking) => {
        setTrackingData(data);
        setIsTrackingLoading(false);
        setViewMode('TRACK');
      })
      .catch((err) => {
        setTrackingError(err.message || 'لم يتم العثور على التذكرة أو الرمز غير صحيح');
        setIsTrackingLoading(false);
      });
  };

  // Trigger tracking lookup automatically if initialTrackingToken is provided
  useEffect(() => {
    if (initialTrackingToken) {
      handleLookupTracking(initialTrackingToken);
    }
  }, [initialTrackingToken]);

  // Submit Fault Report
  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (!description.trim()) {
      setSubmitError(isArabic ? 'يرجى كتابة وصف موجز للمشكلة' : 'Please describe the issue briefly.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    // Client-side idempotency key
    const cloudReportId = `CR-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    try {
      const res = await fetch(`/public/m/${encodeURIComponent(token)}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          description,
          reporterName,
          reporterPhone,
          cloudReportId
        })
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'فشل إرسال البلاغ');
      }

      setSubmissionResult(json);
      setViewMode('SUCCESS');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setSubmitError(err.message || 'حدث خطأ أثناء إرسال البلاغ. يرجى المحاولة لاحقاً.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyTrackingLink = (trackToken: string) => {
    const url = `${window.location.origin}/public/ticket/${trackToken}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const categories: { id: FaultCategory; labelAr: string; labelEn: string; icon: any; color: string }[] = [
    { id: 'CARD_POS', labelAr: 'عطل مدى / بطاقة بنكية', labelEn: 'Card / POS Payment', icon: CreditCard, color: 'text-amber-400 border-amber-500/30' },
    { id: 'PAYMENT', labelAr: 'عطل العملات الورقية/المعدنية', labelEn: 'Cash / Coin Jam', icon: Banknote, color: 'text-emerald-400 border-emerald-500/30' },
    { id: 'PRODUCT_SELECTION', labelAr: 'المنتج لم يسقط بعد الدفع', labelEn: 'Item Stuck / Not Dropped', icon: Sparkles, color: 'text-indigo-400 border-indigo-500/30' },
    { id: 'REFRIGERATION', labelAr: 'المشروبات غير باردة / التبريد', labelEn: 'Cooling / Temperature', icon: AlertTriangle, color: 'text-cyan-400 border-cyan-500/30' },
    { id: 'POWER', labelAr: 'الماكينة طافية أو الشاشة لا تعمل', labelEn: 'Power / Display Off', icon: AlertTriangle, color: 'text-rose-400 border-rose-500/30' },
    { id: 'OTHER', labelAr: 'ملاحظة أو عطل آخر', labelEn: 'Other Observation', icon: HelpCircle, color: 'text-slate-400 border-slate-700' }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased flex flex-col justify-between" dir={isArabic ? 'rtl' : 'ltr'}>
      {/* Top Banner */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-30 px-4 py-3 sm:px-6">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
              <Wrench className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-100 tracking-tight">
                {isArabic ? 'بوابة بلاغات أعطال ماكينات البيع' : 'Smart Vending Incident Portal'}
              </h1>
              <p className="text-xs text-slate-400">
                {isArabic ? 'خدمة العملاء والصيانة الميدانية المباشرة' : 'Direct Field Maintenance & Customer Care'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <button
              onClick={() => setIsArabic(!isArabic)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:border-slate-600 transition"
            >
              {isArabic ? 'English' : 'عربي'}
            </button>
            {onNavigateToAdmin && (
              <button
                onClick={onNavigateToAdmin}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-sky-950/60 border border-sky-800 text-sky-300 hover:bg-sky-900 transition"
              >
                {isArabic ? 'لوحة التحكم' : 'Staff Login'}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Navigation Switch between Report and Track */}
        <div className="grid grid-cols-2 p-1 bg-slate-900 border border-slate-800 rounded-xl text-sm font-medium">
          <button
            onClick={() => {
              if (viewMode === 'INVALID_QR' && !token) return;
              setViewMode(submissionResult ? 'SUCCESS' : 'REPORT');
            }}
            className={`py-2 px-3 rounded-lg text-center transition ${
              viewMode === 'REPORT' || viewMode === 'SUCCESS'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {isArabic ? 'إبلاغ عن عطل' : 'Report Issue'}
          </button>
          <button
            onClick={() => setViewMode('TRACK')}
            className={`py-2 px-3 rounded-lg text-center transition ${
              viewMode === 'TRACK'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {isArabic ? 'متابعة حالة بلاغ' : 'Track Status'}
          </button>
        </div>

        {/* 1. INVALID QR STATE (SECTION 9 & 11) */}
        {viewMode === 'INVALID_QR' && (
          <div className="bg-slate-900/90 border border-rose-900/50 rounded-2xl p-6 text-center space-y-4 shadow-xl">
            <div className="w-16 h-16 bg-rose-950/70 border border-rose-800/80 rounded-2xl flex items-center justify-center mx-auto text-rose-400">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-white">
                {isArabic ? 'رمز الـ QR غير صالح' : 'Invalid QR Code'}
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                {isArabic
                  ? 'عذراً، رمز الـ QR الممسوح غير مسجل في منظومة الأسطول أو انتهت صلاحيته. لم يتم العثور على ماكينة مطابقة.'
                  : 'Invalid QR code. Machine not found in fleet records.'}
              </p>
            </div>
            <div className="p-4 bg-slate-950/70 rounded-xl border border-slate-800 text-xs text-slate-400 text-right rtl:text-right ltr:text-left space-y-1">
              <p>• {isArabic ? 'تأكد من مسح الملصق الرسمي الملصق على واجهة الماكينة.' : 'Scan official sticker on machine front.'}</p>
              <p>• {isArabic ? 'في حال استمرار المشكلة، يمكنك التواصل مع مركز الاتصال والدعم.' : 'Contact customer support if this persists.'}</p>
            </div>
            <div className="pt-2">
              <button
                onClick={() => setViewMode('TRACK')}
                className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium text-sm transition"
              >
                {isArabic ? 'البحث عن بلاغ برقم التتبع' : 'Track an Existing Ticket'}
              </button>
            </div>
          </div>
        )}

        {/* 2. LOADING STATE */}
        {isLoadingMachine && viewMode === 'REPORT' && (
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-8 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-sky-400 animate-spin mx-auto" />
            <p className="text-sm text-slate-300">
              {isArabic ? 'جارٍ التحقق من بيانات الماكينة...' : 'Verifying machine credentials...'}
            </p>
          </div>
        )}

        {/* 3. REPORTING FORM (SECTION 8) */}
        {!isLoadingMachine && viewMode === 'REPORT' && (
          <div className="space-y-5">
            {/* Machine Location Card (Sanitized: NO internal IDs, NO tech names, NO costs) */}
            {machineData ? (
              <div className="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg relative overflow-hidden">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-400 flex items-center gap-1">
                      <Building className="w-3.5 h-3.5" />
                      {machineData.buildingName}
                    </span>
                    <h2 className="text-base font-bold text-white">
                      {machineData.machineType}
                    </h2>
                    <p className="text-xs text-slate-300 flex items-center gap-1.5 pt-0.5">
                      <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      {machineData.locationDescription}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800/80">
                      {isArabic ? 'ماكينة موثقة' : 'Verified Machine'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-amber-950/30 border border-amber-800/50 rounded-xl p-4 text-xs text-amber-200">
                {isArabic
                  ? 'لم يتم تحديد ماكينة عبر QR. يرجى مسح رمز الـ QR الملصق على الماكينة.'
                  : 'No machine token detected. Please scan QR code on the machine.'}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmitReport} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-5 shadow-xl">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  {isArabic ? 'ما هي المشكلة التي واجهتها؟' : 'What issue occurred?'}
                  <span className="text-rose-400 mx-1">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {categories.map((cat) => {
                    const Icon = cat.icon;
                    const isSelected = category === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategory(cat.id)}
                        className={`p-3 rounded-xl border text-right rtl:text-right ltr:text-left transition flex flex-col justify-between ${
                          isSelected
                            ? 'bg-sky-950/60 border-sky-500 text-white shadow-md'
                            : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <Icon className={`w-5 h-5 mb-2 ${cat.color}`} />
                        <span className="text-xs font-semibold leading-snug">
                          {isArabic ? cat.labelAr : cat.labelEn}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  {isArabic ? 'وصف المشكلة' : 'Issue Description'}
                  <span className="text-rose-400 mx-1">*</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder={
                    isArabic
                      ? 'مثال: تم خصم المبلغ من بطاقة مدى ولم ينزل المنتج المطلوب، الشاشة تظهر خطأ...'
                      : 'e.g. Card was charged but item stuck in dispenser...'
                  }
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    {isArabic ? 'رقم الجوال (اختياري لمتابعة البلاغ)' : 'Mobile Phone (Optional)'}
                  </label>
                  <input
                    type="tel"
                    value={reporterPhone}
                    onChange={(e) => setReporterPhone(e.target.value)}
                    placeholder="05XXXXXXXX"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    {isArabic ? 'الاسم (اختياري)' : 'Name (Optional)'}
                  </label>
                  <input
                    type="text"
                    value={reporterName}
                    onChange={(e) => setReporterName(e.target.value)}
                    placeholder={isArabic ? 'العميل الكريم' : 'Your name'}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
                  />
                </div>
              </div>

              {submitError && (
                <div className="p-3 bg-rose-950/50 border border-rose-800 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !machineData}
                className="w-full py-3.5 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white shadow-lg shadow-sky-600/30 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{isArabic ? 'جارٍ تسجيل البلاغ...' : 'Submitting...'}</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 rtl:rotate-180" />
                    <span>{isArabic ? 'إرسال البلاغ لفريق الصيانة' : 'Submit Fault Report'}</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* 4. SUCCESS SCREEN (SECTION 8) */}
        {viewMode === 'SUCCESS' && submissionResult && (
          <div className="bg-slate-900/95 border border-emerald-900/50 rounded-2xl p-6 text-center space-y-5 shadow-2xl">
            <div className="w-16 h-16 bg-emerald-950/80 border border-emerald-800 rounded-full flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-bold text-white">
                {isArabic ? 'تم استلام بلاغك بنجاح' : 'Report Received Successfully'}
              </h2>
              <p className="text-xs text-slate-300">
                {submissionResult.message ||
                  (isArabic
                    ? 'تم إرسال البلاغ مباشرة للمشرف وفريق الصيانة الميداني.'
                    : 'Dispatched directly to the field maintenance team.')}
              </p>
            </div>

            {/* Ticket Credentials */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-center space-y-3">
              <div>
                <span className="text-[11px] text-slate-400 uppercase tracking-wider block">
                  {isArabic ? 'رقم التذكرة' : 'Ticket Number'}
                </span>
                <span className="text-lg font-mono font-bold text-sky-400">
                  {submissionResult.ticketNumber}
                </span>
              </div>

              <div className="border-t border-slate-800/80 pt-3">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider block">
                  {isArabic ? 'رمز التتبع المباشر' : 'Public Tracking Token'}
                </span>
                <div className="flex items-center justify-center gap-2 mt-1">
                  <span className="text-base font-mono font-bold text-emerald-400 bg-emerald-950/50 px-3 py-1 rounded-lg border border-emerald-800/60">
                    {submissionResult.trackingToken}
                  </span>
                  <button
                    onClick={() => copyTrackingLink(submissionResult.trackingToken)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                    title={isArabic ? 'نسخ رابط التتبع' : 'Copy tracking link'}
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={() => handleLookupTracking(submissionResult.trackingToken)}
                className="w-full py-3 px-4 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold text-sm shadow-md transition flex items-center justify-center gap-2"
              >
                <span>{isArabic ? 'متابعة مسار البلاغ الآن' : 'Track Status Now'}</span>
                <ArrowRight className="w-4 h-4 rtl:rotate-180" />
              </button>

              <button
                onClick={() => {
                  setDescription('');
                  setViewMode('REPORT');
                  setSubmissionResult(null);
                }}
                className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition"
              >
                {isArabic ? 'تسجيل بلاغ آخر' : 'Submit Another Report'}
              </button>
            </div>
          </div>
        )}

        {/* 5. TICKET TRACKING SCREEN (SECTION 10) */}
        {viewMode === 'TRACK' && (
          <div className="space-y-5">
            {/* Search Input */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg">
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                {isArabic ? 'أدخل رمز التتبع الآمن' : 'Enter Secure Tracking Token'}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={trackingQuery}
                  onChange={(e) => setTrackingQuery(e.target.value)}
                  placeholder="TRK-XXXXXX"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono uppercase"
                />
                <button
                  onClick={() => handleLookupTracking()}
                  disabled={isTrackingLoading || !trackingQuery.trim()}
                  className="px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium text-sm transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isTrackingLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                  <span>{isArabic ? 'بحث' : 'Search'}</span>
                </button>
              </div>
              {trackingError && (
                <p className="text-xs text-rose-400 mt-2">{trackingError}</p>
              )}
            </div>

            {/* Sanitized Ticket Tracking Card (SECTION 10: NO internal notes, NO tech phone, NO costs) */}
            {trackingData && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
                <div className="flex items-start justify-between border-b border-slate-800 pb-3">
                  <div>
                    <span className="text-xs text-slate-400 block font-mono">
                      {trackingData.ticketNumber}
                    </span>
                    <h3 className="text-base font-bold text-white mt-0.5">
                      {isArabic ? 'حالة البلاغ' : 'Ticket Progress'}
                    </h3>
                  </div>
                  <div>
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${
                        trackingData.status === 'RESOLVED' || trackingData.status === 'VERIFIED' || trackingData.status === 'CLOSED'
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                          : trackingData.status === 'IN_PROGRESS'
                          ? 'bg-sky-950/80 text-sky-300 border-sky-800'
                          : trackingData.status === 'WAITING_FOR_PART'
                          ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                          : 'bg-indigo-950/80 text-indigo-300 border-indigo-800'
                      }`}
                    >
                      {trackingData.status === 'RESOLVED' || trackingData.status === 'VERIFIED' || trackingData.status === 'CLOSED'
                        ? isArabic ? 'تم الحل والإصلاح' : 'Resolved'
                        : trackingData.status === 'IN_PROGRESS'
                        ? isArabic ? 'قيد المعالجة الميدانية' : 'In Progress'
                        : trackingData.status === 'WAITING_FOR_PART'
                        ? isArabic ? 'بانتظار وصول قطعة الغيار' : 'Waiting For Part'
                        : isArabic ? 'بلاغ جديد - قيد الإسناد' : 'New / Dispatched'}
                    </span>
                  </div>
                </div>

                {/* Location Summary */}
                <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/80 text-xs space-y-1 text-slate-300">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Building className="w-3.5 h-3.5 text-sky-400" />
                    <span>{trackingData.machineSummary?.buildingName || 'موقع الماكينة'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <MapPin className="w-3.5 h-3.5 text-rose-400" />
                    <span>{trackingData.machineSummary?.locationDescription || 'منطقة الحرم الجامعي'}</span>
                  </div>
                </div>

                {/* Timestamps */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 bg-slate-950/40 rounded-lg border border-slate-800/50">
                    <span className="text-slate-500 block text-[10px]">
                      {isArabic ? 'تاريخ التسجيل' : 'Created At'}
                    </span>
                    <span className="text-slate-300 font-mono">
                      {new Date(trackingData.createdAt).toLocaleDateString('ar-SA')}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-950/40 rounded-lg border border-slate-800/50">
                    <span className="text-slate-500 block text-[10px]">
                      {isArabic ? 'آخر تحديث' : 'Last Updated'}
                    </span>
                    <span className="text-slate-300 font-mono">
                      {new Date(trackingData.updatedAt).toLocaleDateString('ar-SA')}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer Support Info */}
      <footer className="border-t border-slate-800/80 bg-slate-900/60 p-4 text-center text-xs text-slate-400 space-y-1">
        <p className="flex items-center justify-center gap-2">
          <Phone className="w-3.5 h-3.5 text-sky-400" />
          <span>{isArabic ? 'خدمة العملاء والدعم الفني:' : 'Customer Care:'} 800-123-4567</span>
        </p>
        <p className="text-[11px] text-slate-500">
          Smart Vending Maintenance Platform © 2026
        </p>
      </footer>
    </div>
  );
};

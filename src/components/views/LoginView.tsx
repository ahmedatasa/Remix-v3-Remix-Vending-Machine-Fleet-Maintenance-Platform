import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Mail,
  Lock,
  ArrowRight,
  Building2,
  User,
  Phone,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  KeyRound,
  RotateCcw
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Button } from '../common/Button';
import { LanguageToggle } from '../layout/LanguageToggle';
import { ThemeToggle } from '../layout/ThemeToggle';
import { NavigationTab } from '../../types';

interface LoginViewProps {
  onSuccessLogin?: () => void;
  onNavigate?: (tab: NavigationTab, id?: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onSuccessLogin }) => {
  const {
    login,
    registerInitialAdmin,
    isInitialSetupRequired,
    companyName: storedCompanyName,
    isLoading
  } = useAuth();
  const { language, isRTL } = useLanguage();
  const isAr = language === 'ar';

  // Mode: 'setup' for initial System Admin registration, 'login' for standard login
  const [mode, setMode] = useState<'setup' | 'login'>(isInitialSetupRequired ? 'setup' : 'login');

  useEffect(() => {
    if (isInitialSetupRequired) {
      setMode('setup');
    }
  }, [isInitialSetupRequired]);

  // Login Form States
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Initial Admin Registration Form States
  const [companyName, setCompanyName] = useState(storedCompanyName || '');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState(isAr ? 'الرياض' : 'Riyadh');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsConfirmed, setTermsConfirmed] = useState(true);
  const [setupError, setSetupError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handle Standard Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    if (!loginEmail.trim()) {
      setLoginError(isAr ? 'يرجى إدخال البريد الإلكتروني' : 'Please enter your email');
      return;
    }

    const res = await login(loginEmail.trim(), loginPassword);
    if (res.success) {
      if (onSuccessLogin) onSuccessLogin();
    } else {
      setLoginError(
        res.error || (isAr ? 'بيانات الدخول غير صحيحة أو الحساب غير مسجل' : 'Invalid credentials or user not registered')
      );
    }
  };

  // Handle Initial Super Admin Registration
  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError('');

    if (!companyName.trim()) {
      setSetupError(isAr ? 'يرجى إدخال اسم الشركة أو المنشأة' : 'Please enter company name');
      return;
    }
    if (!fullName.trim()) {
      setSetupError(isAr ? 'يرجى إدخال اسم مدير النظام الكامل' : 'Please enter admin full name');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setSetupError(isAr ? 'يرجى إدخال بريد إلكتروني صالح' : 'Please enter a valid email address');
      return;
    }
    if (!password || password.length < 6) {
      setSetupError(isAr ? 'كلمة المرور يجب أن لا تقل عن 6 خانات' : 'Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setSetupError(isAr ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match');
      return;
    }
    if (!termsConfirmed) {
      setSetupError(
        isAr ? 'يرجى تأكيد إقرار مسؤولية إدارة المنظومة' : 'Please acknowledge administrative authority'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await registerInitialAdmin({
        companyName: companyName.trim(),
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        city: city.trim(),
        password
      });

      if (res.success) {
        if (onSuccessLogin) onSuccessLogin();
      } else {
        setSetupError(res.error || (isAr ? 'فشل تسجيل مدير النظام' : 'Failed to register admin'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8 relative overflow-hidden font-sans">
      {/* Background ambient accents */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top right language and theme controls */}
      <div className="absolute top-6 right-6 flex items-center gap-2 z-20">
        <LanguageToggle />
        <ThemeToggle />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-xl relative z-10">
        <div className="flex items-center justify-center gap-3 mb-3">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-emerald-600 flex items-center justify-center text-white shadow-xl shadow-blue-600/20 border border-blue-400/20">
            <ShieldCheck className="w-8 h-8" />
          </div>
        </div>
        <h2 className="text-center text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
          {mode === 'setup'
            ? isAr
              ? 'تسجيل مدير النظام الرئيسي للشركة'
              : 'Register System Administrator'
            : isAr
            ? 'تسجيل الدخول إلى منظومة الأسطول'
            : 'Fleet System Sign In'}
        </h2>
        <p className="mt-2 text-center text-xs sm:text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
          {mode === 'setup'
            ? isAr
              ? 'بيئة نقية ومستقلة: تم تفريغ كافة الحسابات الافتراضية. يرجى تسجيل بيانات مدير النظام صاحب الصلاحيات الكاملة لإضافة المستخدمين وإدارة المنظومة.'
              : 'Clean slate architecture: All demo accounts have been purged. Register your enterprise Super Admin to independently manage company users.'
            : isAr
            ? storedCompanyName || 'منظومة إدارة وصيانة أسطول أجهزة البيع الذاتي'
            : storedCompanyName || 'Automated Vending Fleet Maintenance Platform'}
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-xl relative z-10">
        <div className="bg-slate-900/90 border border-slate-800 py-7 px-6 shadow-2xl rounded-2xl sm:px-10 backdrop-blur-xl">
          {/* Tab / Switcher between Setup and Login if not strictly forced */}
          {!isInitialSetupRequired && (
            <div className="flex items-center justify-center mb-6 p-1 bg-slate-950/80 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setMode('login')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  mode === 'login'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isAr ? 'تسجيل الدخول' : 'Sign In'}
              </button>
              <button
                type="button"
                onClick={() => setMode('setup')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  mode === 'setup'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isAr ? 'تسجيل مدير نظام جديد' : 'New Admin Registration'}
              </button>
            </div>
          )}

          {/* MODE: INITIAL ADMIN REGISTRATION */}
          {mode === 'setup' && (
            <div>
              {/* Notice Banner */}
              <div className="mb-6 p-4 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-200/90 leading-relaxed">
                  <span className="font-bold text-blue-100 block mb-1">
                    {isAr
                      ? 'صلاحيات مستقلة لكل شركة (Enterprise Autonomy)'
                      : 'Independent Enterprise Governance'}
                  </span>
                  {isAr
                    ? 'هذا الحساب سيكون مدير النظام الرئيسي (Super Administrator) للشركة ولديه الصلاحيات الحصرية لإنشاء حسابات الفنيين، مدراء الصيانة، ومسؤولي المستودع، واستيراد البيانات الحقيقية.'
                    : 'This account will become the Super Administrator with full privileges to create users, invite technicians, and import baseline data.'}
                </div>
              </div>

              {setupError && (
                <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{setupError}</span>
                </div>
              )}

              <form className="space-y-4" onSubmit={handleSetupSubmit}>
                {/* Company Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {isAr ? 'اسم الشركة / المنشأة *' : 'Company / Organization Name *'}
                  </label>
                  <div className="relative">
                    <div
                      className={`absolute inset-y-0 ${
                        isRTL ? 'right-0 pr-3' : 'left-0 pl-3'
                      } flex items-center pointer-events-none text-slate-500`}
                    >
                      <Building2 className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      required
                      placeholder={isAr ? 'مثال: شركة أسطول التوزيع الذكي' : 'e.g. Apex Vending Fleet Corp'}
                      value={companyName}
                      onChange={e => setCompanyName(e.target.value)}
                      className={`w-full bg-slate-950 border border-slate-700 rounded-lg py-2.5 ${
                        isRTL ? 'pr-9 pl-3' : 'pl-9 pr-3'
                      } text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500`}
                    />
                  </div>
                </div>

                {/* Admin Full Name & City */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {isAr ? 'اسم مدير النظام الكامل *' : 'System Admin Full Name *'}
                    </label>
                    <div className="relative">
                      <div
                        className={`absolute inset-y-0 ${
                          isRTL ? 'right-0 pr-3' : 'left-0 pl-3'
                        } flex items-center pointer-events-none text-slate-500`}
                      >
                        <User className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        required
                        placeholder={isAr ? 'مثال: سلطان القحطاني' : 'e.g. John Doe'}
                        value={fullName}
                        onChange={e => setFullName(e.target.value)}
                        className={`w-full bg-slate-950 border border-slate-700 rounded-lg py-2.5 ${
                          isRTL ? 'pr-9 pl-3' : 'pl-9 pr-3'
                        } text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {isAr ? 'المدينة / المقر الرئيسي' : 'City / Headquarters'}
                    </label>
                    <div className="relative">
                      <div
                        className={`absolute inset-y-0 ${
                          isRTL ? 'right-0 pr-3' : 'left-0 pl-3'
                        } flex items-center pointer-events-none text-slate-500`}
                      >
                        <MapPin className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        placeholder={isAr ? 'الرياض' : 'Riyadh'}
                        value={city}
                        onChange={e => setCity(e.target.value)}
                        className={`w-full bg-slate-950 border border-slate-700 rounded-lg py-2.5 ${
                          isRTL ? 'pr-9 pl-3' : 'pl-9 pr-3'
                        } text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500`}
                      />
                    </div>
                  </div>
                </div>

                {/* Email & Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {isAr ? 'البريد الإلكتروني المهني *' : 'Admin Email Address *'}
                    </label>
                    <div className="relative">
                      <div
                        className={`absolute inset-y-0 ${
                          isRTL ? 'right-0 pr-3' : 'left-0 pl-3'
                        } flex items-center pointer-events-none text-slate-500`}
                      >
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        required
                        placeholder="admin@company.com"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className={`w-full bg-slate-950 border border-slate-700 rounded-lg py-2.5 ${
                          isRTL ? 'pr-9 pl-3' : 'pl-9 pr-3'
                        } text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {isAr ? 'رقم الهاتف / الجوال' : 'Phone Number'}
                    </label>
                    <div className="relative">
                      <div
                        className={`absolute inset-y-0 ${
                          isRTL ? 'right-0 pr-3' : 'left-0 pl-3'
                        } flex items-center pointer-events-none text-slate-500`}
                      >
                        <Phone className="w-4 h-4" />
                      </div>
                      <input
                        type="tel"
                        placeholder="+966 50 123 4567"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        className={`w-full bg-slate-950 border border-slate-700 rounded-lg py-2.5 ${
                          isRTL ? 'pr-9 pl-3' : 'pl-9 pr-3'
                        } text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500`}
                      />
                    </div>
                  </div>
                </div>

                {/* Password & Confirm Password */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {isAr ? 'كلمة المرور *' : 'Password *'}
                    </label>
                    <div className="relative">
                      <div
                        className={`absolute inset-y-0 ${
                          isRTL ? 'right-0 pr-3' : 'left-0 pl-3'
                        } flex items-center pointer-events-none text-slate-500`}
                      >
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type="password"
                        required
                        placeholder="••••••••"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className={`w-full bg-slate-950 border border-slate-700 rounded-lg py-2.5 ${
                          isRTL ? 'pr-9 pl-3' : 'pl-9 pr-3'
                        } text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {isAr ? 'تأكيد كلمة المرور *' : 'Confirm Password *'}
                    </label>
                    <div className="relative">
                      <div
                        className={`absolute inset-y-0 ${
                          isRTL ? 'right-0 pr-3' : 'left-0 pl-3'
                        } flex items-center pointer-events-none text-slate-500`}
                      >
                        <KeyRound className="w-4 h-4" />
                      </div>
                      <input
                        type="password"
                        required
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        className={`w-full bg-slate-950 border border-slate-700 rounded-lg py-2.5 ${
                          isRTL ? 'pr-9 pl-3' : 'pl-9 pr-3'
                        } text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500`}
                      />
                    </div>
                  </div>
                </div>

                {/* Confirmation Checkbox */}
                <div className="pt-2">
                  <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={termsConfirmed}
                      onChange={e => setTermsConfirmed(e.target.checked)}
                      className="mt-0.5 rounded bg-slate-950 border-slate-700 text-blue-600 focus:ring-blue-500 shrink-0"
                    />
                    <span className="leading-relaxed">
                      {isAr
                        ? 'أقر بصفتي مدير النظام الرئيسي بمسؤولية إدارة حسابات المستخدمين وصلاحيات الشركة وتفعيل بيانات الأسطول الحقيقية.'
                        : 'I acknowledge my authority as Super Administrator to manage user permissions and company fleet baselines.'}
                    </span>
                  </label>
                </div>

                <div className="pt-4">
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    fullWidth
                    isLoading={isSubmitting || isLoading}
                    icon={CheckCircle2}
                    iconPosition="end"
                  >
                    {isAr
                      ? 'تسجيل مدير النظام وبدء تشغيل المنظومة'
                      : 'Register Admin & Launch Fleet Platform'}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* MODE: STANDARD LOGIN */}
          {mode === 'login' && (
            <div>
              {loginError && (
                <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <form className="space-y-4" onSubmit={handleLoginSubmit}>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {isAr ? 'البريد الإلكتروني' : 'Email Address'}
                  </label>
                  <div className="relative">
                    <div
                      className={`absolute inset-y-0 ${
                        isRTL ? 'right-0 pr-3' : 'left-0 pl-3'
                      } flex items-center pointer-events-none text-slate-500`}
                    >
                      <Mail className="h-4 w-4" />
                    </div>
                    <input
                      type="email"
                      required
                      placeholder="admin@company.com"
                      value={loginEmail}
                      onChange={e => setLoginEmail(e.target.value)}
                      className={`w-full bg-slate-950 border border-slate-700 rounded-lg py-2.5 ${
                        isRTL ? 'pr-9 pl-3' : 'pl-9 pr-3'
                      } text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {isAr ? 'كلمة المرور' : 'Password'}
                  </label>
                  <div className="relative">
                    <div
                      className={`absolute inset-y-0 ${
                        isRTL ? 'right-0 pr-3' : 'left-0 pl-3'
                      } flex items-center pointer-events-none text-slate-500`}
                    >
                      <Lock className="h-4 w-4" />
                    </div>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={e => setLoginPassword(e.target.value)}
                      className={`w-full bg-slate-950 border border-slate-700 rounded-lg py-2.5 ${
                        isRTL ? 'pr-9 pl-3' : 'pl-9 pr-3'
                      } text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500`}
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    fullWidth
                    isLoading={isLoading}
                    icon={ArrowRight}
                    iconPosition="end"
                  >
                    {isAr ? 'تسجيل الدخول' : 'Sign In'}
                  </Button>
                </div>
              </form>

              {/* Helper note */}
              <div className="mt-6 pt-5 border-t border-slate-800/80 text-center">
                <button
                  type="button"
                  onClick={() => setMode('setup')}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors inline-flex items-center gap-1.5 cursor-pointer font-medium"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    {isAr
                      ? 'هل تريد تسجيل مدير نظام جديد لشركة أخرى؟'
                      : 'Want to register a new admin for another company?'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

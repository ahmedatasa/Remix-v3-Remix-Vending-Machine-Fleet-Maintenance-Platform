import React from 'react';
import { ShieldAlert, Lock, ArrowRight, ArrowLeft, Shield, AlertTriangle } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { NavigationTab } from '../../types';
import { Button } from './Button';

interface AccessDeniedViewProps {
  requestedTab?: NavigationTab;
  onNavigate: (tab: NavigationTab) => void;
}

export const AccessDeniedView: React.FC<AccessDeniedViewProps> = ({
  requestedTab = 'dashboard',
  onNavigate
}) => {
  const { isRTL } = useLanguage();
  const { user, getRoleBadgeInfo } = useAuth();
  const roleInfo = getRoleBadgeInfo(user?.role);

  const getTabLabel = (tab: NavigationTab) => {
    switch (tab) {
      case 'users':
        return isRTL ? 'إدارة المستخدمين والأذونات' : 'User Management & Permissions';
      case 'settings':
        return isRTL ? 'إعدادات النظام والنسخ الأساسية' : 'System Configuration & Baseline';
      case 'import-export':
        return isRTL ? 'استيراد وتصدير قاعدة البيانات' : 'Data Pipeline & Excel Import/Export';
      case 'import-history':
        return isRTL ? 'سجل عمليات الاستيراد' : 'Import Execution History';
      case 'audit-logs':
        return isRTL ? 'سجلات الرقابة والتدقيق الأمني' : 'Security Audit & Compliance Logs';
      case 'technicians':
        return isRTL ? 'إدارة طاقم الفنيين والاعتمادات' : 'Technicians Roster & Certifications';
      case 'inventory':
        return isRTL ? 'التعديل المباشر لمخزون المستودع' : 'Warehouse Inventory Balance Management';
      case 'suppliers':
        return isRTL ? 'عقود وبيانات الموردين' : 'Supplier Contracts & Vendors';
      default:
        return tab;
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Background ambient accent */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 text-center">
          {/* Lock Icon */}
          <div className="mx-auto w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-5 shadow-lg shadow-rose-500/5">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 tracking-tight">
            {isRTL ? 'تم تقييد الوصول وفقاً للصلاحيات' : 'Access Restricted by Enterprise Policy'}
          </h2>
          
          <p className="text-sm text-slate-400 mb-6 leading-relaxed max-w-md mx-auto">
            {isRTL
              ? 'وفقاً لسياسة الحوكمة المؤسسية المعتمدة (Enterprise RBAC)، لا يمتلك هذا الحساب الصلاحية للدخول إلى هذا القسم أو تعديل بياناته لمنع أي تلاعب غير مصرح به أو الإخلال بسلامة النظام.'
              : 'Under enterprise role-based access control (RBAC), your account is not authorized to access or modify records in this section to prevent tampering and preserve data integrity.'}
          </p>

          {/* User Details & Scope Box */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4 text-start mb-6 space-y-3 font-sans">
            <div className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60">
              <span className="text-slate-400">{isRTL ? 'المستخدم الحالي:' : 'Active User:'}</span>
              <span className="text-slate-200 font-medium">{user?.fullName || user?.email}</span>
            </div>

            <div className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60">
              <span className="text-slate-400">{isRTL ? 'الدور الوظيفي:' : 'Assigned Enterprise Role:'}</span>
              <span className={`px-2.5 py-0.5 rounded-full border text-[11px] font-medium ${roleInfo.color}`}>
                {isRTL ? roleInfo.titleAr : roleInfo.titleEn}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60">
              <span className="text-slate-400">{isRTL ? 'القسم المطلوب:' : 'Restricted Section:'}</span>
              <span className="text-rose-300 font-semibold">{getTabLabel(requestedTab)}</span>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-slate-400">{isRTL ? 'حالة الحماية:' : 'Protection Status:'}</span>
              <span className="inline-flex items-center gap-1.5 text-emerald-400 text-[11px] font-mono">
                <Shield className="w-3.5 h-3.5" />
                {isRTL ? 'محمي وموثق في سجل الأمان' : 'Enforced & Audit Logged'}
              </span>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              variant="primary"
              size="md"
              icon={isRTL ? ArrowRight : ArrowLeft}
              onClick={() => onNavigate('dashboard')}
              className="w-full sm:w-auto"
            >
              {isRTL ? 'العودة إلى لوحة التحكم' : 'Return to Dashboard'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

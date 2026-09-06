import React, { useState, useRef, useEffect } from 'react';
import {
  User,
  LogOut,
  ChevronDown,
  ShieldCheck,
  Building2,
  UserPlus,
  RotateCcw,
  Users
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Badge } from '../common/Badge';
import { ConfirmActionModal } from '../common/ConfirmActionModal';

export const UserMenu: React.FC<{ onNavigate?: (tab: any) => void }> = ({ onNavigate }) => {
  const { user, logout, isAdmin, canAdminUsers, companyName, resetAllUsers, canAccessTab, getRoleBadgeInfo } = useAuth();
  const { t, language } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  const isAr = language === 'ar';
  const roleInfo = getRoleBadgeInfo(user.role);

  const handleResetUsers = async () => {
    await resetAllUsers();
    setShowResetConfirm(false);
    setIsOpen(false);
  };

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2.5 p-1.5 rounded-xl border border-slate-700/80 bg-slate-800/60 hover:bg-slate-800 text-slate-200 transition-colors cursor-pointer"
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white font-bold text-xs shadow-sm">
            {user.fullName ? user.fullName.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="hidden md:block text-left rtl:text-right">
            <div className="text-xs font-semibold text-slate-200 leading-tight">
              {user.fullName || user.name}
            </div>
            <div className="text-[10px] text-slate-400 font-medium">
              {isAr ? roleInfo.titleAr : roleInfo.titleEn}
            </div>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        </button>

        {isOpen && (
          <div className="absolute right-0 rtl:right-auto rtl:left-0 mt-2 w-72 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl z-50 overflow-hidden">
            {/* User & Company Header */}
            <div className="p-4 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-sm">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-slate-100 truncate">
                    {user.fullName || user.name}
                  </h4>
                  <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold ${roleInfo.color}`}>
                      {isAr ? roleInfo.titleAr : roleInfo.titleEn}
                    </span>
                    {companyName && (
                      <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                        {companyName}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="p-2 border-b border-slate-800 space-y-1">
              {canAccessTab('users') && onNavigate && (
                <button
                  type="button"
                  onClick={() => {
                    onNavigate('users');
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer text-left rtl:text-right"
                >
                  <Users className="w-4 h-4 text-blue-400" />
                  <span>{isAr ? 'إدارة مستخدمي الشركة وصلاحياتهم' : 'Manage Company Users'}</span>
                </button>
              )}

              {canAdminUsers && (
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(true)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer text-left rtl:text-right"
                >
                  <RotateCcw className="w-4 h-4 text-amber-400" />
                  <span>{isAr ? 'تهيئة المنظومة لشركة جديدة' : 'Reset & Onboard New Company'}</span>
                </button>
              )}
            </div>

            {/* Logout */}
            <div className="p-2 bg-slate-950/40">
              <button
                type="button"
                onClick={() => {
                  logout();
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>{t('signOut')}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Reset Confirmation Modal */}
      <ConfirmActionModal
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={async () => {
          await handleResetUsers();
        }}
        title={isAr ? 'تفريغ بيانات المستخدمين وإعادة التهيئة' : 'Reset Users & Re-initialize'}
        description={
          isAr
            ? 'هل أنت متأكد من تفريغ كافة حسابات المستخدمين وإعادة النظام إلى وضع التهيئة النظيفة؟ سيتيح لك هذا تسجيل مدير نظام لشركة جديدة بشكل مستقل تماماً.'
            : 'Are you sure you want to clear all user accounts and return the system to clean onboarding mode? This enables onboarding a completely independent company.'
        }
        actionType="PURGE"
      />
    </>
  );
};

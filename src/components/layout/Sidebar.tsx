import React from 'react';
import {
  LayoutDashboard,
  Cpu,
  Building2,
  MapPin,
  Ticket,
  Wrench,
  CalendarCheck,
  Package,
  Boxes,
  ClipboardList,
  Truck,
  BarChart3,
  FileSpreadsheet,
  History,
  Users,
  ShieldAlert,
  Settings,
  QrCode,
  ChevronLeft,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { NavigationTab } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  currentTab: NavigationTab;
  onNavigate: (tab: NavigationTab) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenQRScanner: () => void;
}

interface NavItem {
  id: NavigationTab;
  labelKey: string;
  icon: any;
  requiredRoles?: string[];
  badge?: string | number;
  section?: 'operations' | 'maintenance' | 'inventory' | 'intelligence' | 'admin';
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onNavigate,
  isCollapsed,
  onToggleCollapse,
  onOpenQRScanner
}) => {
  const { t, isRTL } = useLanguage();
  const { user, canAccessTab } = useAuth();

  const navItems: NavItem[] = [
    // Core Fleet Operations
    { id: 'dashboard', labelKey: 'dashboard', icon: LayoutDashboard, section: 'operations' },
    { id: 'machines', labelKey: 'machines', icon: Cpu, section: 'operations' },
    { id: 'buildings', labelKey: 'buildings', icon: Building2, section: 'operations' },
    { id: 'locations', labelKey: 'locations', icon: MapPin, section: 'operations' },

    // Maintenance Engine
    { id: 'tickets', labelKey: 'tickets', icon: Ticket, section: 'maintenance' },
    { id: 'technicians', labelKey: 'technicians', icon: Wrench, section: 'maintenance' },
    { id: 'maintenance', labelKey: 'maintenance', icon: CalendarCheck, section: 'maintenance' },

    // Inventory & Supply Chain
    { id: 'spare-parts', labelKey: 'spareParts', icon: Package, section: 'inventory' },
    { id: 'inventory', labelKey: 'inventory', icon: Boxes, section: 'inventory' },
    { id: 'part-requests', labelKey: 'partRequests', icon: ClipboardList, section: 'inventory' },
    { id: 'suppliers', labelKey: 'suppliers', icon: Truck, section: 'inventory' },

    // Intelligence & Data Center
    { id: 'reports', labelKey: 'reports', icon: BarChart3, section: 'intelligence' },
    { id: 'import-export', labelKey: 'importExport', icon: FileSpreadsheet, section: 'intelligence' },
    { id: 'import-history', labelKey: 'importHistory', icon: History, section: 'intelligence' },

    // Admin & Governance
    { id: 'users', labelKey: 'users', icon: Users, section: 'admin' },
    { id: 'audit-logs', labelKey: 'auditLogs', icon: ShieldAlert, section: 'admin' },
    { id: 'settings', labelKey: 'settings', icon: Settings, section: 'admin' },
    { id: 'public-portal', labelKey: 'publicPortal', icon: QrCode, section: 'admin' }
  ];

  const sectionTitles = {
    operations: isRTL ? 'إدارة الأسطول والمواقع' : 'Fleet Operations',
    maintenance: isRTL ? 'الصيانة والدعم الميداني' : 'Field Maintenance',
    inventory: isRTL ? 'المخزون وقطع الغيار' : 'Inventory & Parts',
    intelligence: isRTL ? 'التقارير وخط البيانات' : 'Intelligence & Pipeline',
    admin: isRTL ? 'النظام والرقابة' : 'System & Governance'
  };

  const visibleNavItems = navItems.filter(item => {
    return canAccessTab(item.id);
  });

  const sections: Array<keyof typeof sectionTitles> = ['operations', 'maintenance', 'inventory', 'intelligence', 'admin'];

  return (
    <aside
      className={`fixed top-0 bottom-0 ${isRTL ? 'right-0' : 'left-0'} z-30 flex flex-col bg-slate-900 border-${isRTL ? 'l' : 'r'} border-slate-800 transition-all duration-300 ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between px-4 h-16 border-b border-slate-800/80 bg-slate-950/40">
        {!isCollapsed && (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-100 tracking-tight leading-none">
                {t('appName')}
              </h1>
              <p className="text-[10px] text-slate-400 mt-1 font-mono">Enterprise v2.4</p>
            </div>
          </div>
        )}

        {isCollapsed && (
          <div className="mx-auto w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white">
            <Cpu className="w-5 h-5" />
          </div>
        )}

        <button
          onClick={onToggleCollapse}
          className="hidden md:flex p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
        >
          {isRTL ? (
            isCollapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
          ) : (
            isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Quick QR Scanner Action Bar */}
      <div className="p-3 border-b border-slate-800/60 bg-slate-950/20">
        <button
          onClick={onOpenQRScanner}
          className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md shadow-blue-900/30 transition-all duration-200 cursor-pointer ${
            isCollapsed ? 'px-0' : ''
          }`}
          title="Scan Machine QR Code"
        >
          <QrCode className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span>{t('qrScanner')}</span>}
        </button>
      </div>

      {/* Navigation Links with Sections */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {sections.map(secKey => {
          const items = visibleNavItems.filter(item => item.section === secKey);
          if (items.length === 0) return null;

          return (
            <div key={secKey} className="space-y-1">
              {!isCollapsed && (
                <span className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  {sectionTitles[secKey]}
                </span>
              )}
              {items.map(item => {
                const Icon = item.icon;
                const isActive = currentTab === item.id || (item.id === 'machines' && currentTab === 'machine-detail') || (item.id === 'tickets' && currentTab === 'ticket-detail') || (item.id === 'technicians' && currentTab === 'technician-detail');

                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    title={isCollapsed ? t(item.labelKey) : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 cursor-pointer group ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/40 font-semibold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`} />
                    {!isCollapsed && (
                      <span className="truncate flex-1 text-left rtl:text-right">
                        {t(item.labelKey)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Footer info */}
      {!isCollapsed && (
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/40">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[11px]">
            <Sparkles className="w-3.5 h-3.5 shrink-0 animate-pulse" />
            <span className="truncate">PostgreSQL & FastAPI Live</span>
          </div>
        </div>
      )}
    </aside>
  );
};

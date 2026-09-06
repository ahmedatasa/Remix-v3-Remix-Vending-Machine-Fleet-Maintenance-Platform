import React from 'react';
import { Menu, Search, Plus, Sparkles, QrCode } from 'lucide-react';
import { LanguageToggle } from './LanguageToggle';
import { ThemeToggle } from './ThemeToggle';
import { NotificationDropdown } from './NotificationDropdown';
import { UserMenu } from './UserMenu';
import { useLanguage } from '../../context/LanguageContext';
import { NavigationTab } from '../../types';

interface HeaderProps {
  currentTab: NavigationTab;
  onNavigate: (tab: NavigationTab) => void;
  onToggleMobileMenu: () => void;
  onOpenQuickTicket: () => void;
  onOpenSearch: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onNavigate,
  onToggleMobileMenu,
  onOpenQuickTicket,
  onOpenSearch
}) => {
  const { t, isRTL } = useLanguage();

  const getPageTitle = () => {
    switch (currentTab) {
      case 'dashboard': return t('dashboard');
      case 'machines': return t('machines');
      case 'machine-detail': return t('machineDetail');
      case 'buildings': return t('buildings');
      case 'locations': return t('locations');
      case 'tickets': return t('tickets');
      case 'ticket-detail': return t('ticketDetail');
      case 'technicians': return t('technicians');
      case 'technician-detail': return t('technicianDetail');
      case 'maintenance': return t('maintenance');
      case 'spare-parts': return t('spareParts');
      case 'inventory': return t('inventory');
      case 'part-requests': return t('partRequests');
      case 'suppliers': return t('suppliers');
      case 'reports': return t('reports');
      case 'import-export': return t('importExport');
      case 'users': return t('users');
      case 'audit-logs': return t('auditLogs');
      case 'settings': return t('settings');
      case 'public-portal': return t('publicPortal');
      default: return t('appName');
    }
  };

  return (
    <header className="sticky top-0 z-20 h-16 bg-slate-900/90 border-b border-slate-800 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between gap-4">
      {/* Left: Mobile Toggle & Page Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileMenu}
          className="md:hidden p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight">
            {getPageTitle()}
          </h2>
        </div>
      </div>

      {/* Center: Global Search Bar Shortcut */}
      <div className="hidden lg:flex items-center flex-1 max-w-md mx-4">
        <button
          onClick={onOpenSearch}
          className="w-full flex items-center justify-between px-3.5 py-1.5 rounded-xl border border-slate-800 bg-slate-950/60 hover:bg-slate-950 text-slate-400 text-xs transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-slate-500" />
            <span>{t('search')} (Machines, Tickets, Parts, SKUs...)</span>
          </div>
          <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-400 border border-slate-700">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right: Actions, Language, Theme, Notifs & User */}
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={onOpenQuickTicket}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm shadow-blue-900/30 transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t('newTicket')}</span>
        </button>

        <LanguageToggle />
        <ThemeToggle />
        <NotificationDropdown onNavigateTab={onNavigate} />
        <UserMenu onNavigate={onNavigate} />
      </div>
    </header>
  );
};

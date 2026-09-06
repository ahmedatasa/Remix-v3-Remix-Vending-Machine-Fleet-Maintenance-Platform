import React, { useState, useRef, useEffect } from 'react';
import { Bell, CheckCheck, AlertTriangle, Package, Ticket as TicketIcon, Layers } from 'lucide-react';
import { useNotification, InAppNotification } from '../../context/NotificationContext';
import { useLanguage } from '../../context/LanguageContext';
import { NavigationTab } from '../../types';

interface NotificationDropdownProps {
  onNavigateTab: (tab: NavigationTab, id?: string) => void;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({ onNavigateTab }) => {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotification();
  const { t, formatDate } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getIcon = (type: InAppNotification['type']) => {
    switch (type) {
      case 'TICKET_CREATED':
      case 'TICKET_ASSIGNED':
        return <TicketIcon className="w-4 h-4 text-blue-400" />;
      case 'LOW_STOCK':
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      case 'PART_REQUEST':
        return <Package className="w-4 h-4 text-purple-400" />;
      default:
        return <Layers className="w-4 h-4 text-slate-400" />;
    }
  };

  const handleNotificationClick = (n: InAppNotification) => {
    markAsRead(n.id);
    if (n.linkTab) {
      onNavigateTab(n.linkTab as NavigationTab, n.linkId);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg border border-slate-700/80 bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-slate-100 transition-colors cursor-pointer"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/60">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold text-slate-100">{t('notifications')}</h4>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5 text-blue-400" />
                <span>{t('markAllRead')}</span>
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                {t('noNotifications')}
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`p-3.5 flex items-start gap-3 hover:bg-slate-800/50 cursor-pointer transition-colors ${
                    !n.isRead ? 'bg-blue-500/5' : ''
                  }`}
                >
                  <div className="p-2 rounded-lg bg-slate-800 border border-slate-700/60 shrink-0">
                    {getIcon(n.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <h5 className={`text-xs font-medium truncate ${!n.isRead ? 'text-slate-100 font-semibold' : 'text-slate-300'}`}>
                        {n.title}
                      </h5>
                      {!n.isRead && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                      {n.message}
                    </p>
                    <span className="text-[10px] text-slate-500 block mt-1">
                      {formatDate(n.createdAt)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

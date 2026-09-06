import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { ToastMessage } from '../types';

export interface InAppNotification {
  id: string;
  title: string;
  message: string;
  type: 'TICKET_CREATED' | 'TICKET_ASSIGNED' | 'TICKET_ESCALATED' | 'LOW_STOCK' | 'LOW_STOCK_WARNING' | 'SYSTEM' | 'SYSTEM_ALERT' | 'PART_REQUEST' | 'PART_REQUEST_PENDING';
  isRead: boolean;
  createdAt: string;
  linkTab?: string;
  linkId?: string;
}

interface NotificationContextType {
  toasts: ToastMessage[];
  showToast: (title: string, message: string, type?: 'success' | 'error' | 'warning' | 'info', duration?: number) => void;
  removeToast: (id: string) => void;
  notifications: InAppNotification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  addInAppNotification: (notif: Omit<InAppNotification, 'id' | 'createdAt' | 'isRead'>) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [notifications, setNotifications] = useState<InAppNotification[]>([
    {
      id: 'notif-1',
      title: 'Critical Ticket Created',
      message: 'Machine VM-B01-F02-01 reported payment gateway failure.',
      type: 'TICKET_CREATED',
      isRead: false,
      createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      linkTab: 'ticket-detail',
      linkId: 'TCK-2026-0001'
    },
    {
      id: 'notif-2',
      title: 'Low Stock Alert',
      message: 'Part SP-VAL-001 (Coin Optical Sensor) reached minimum threshold (2 left).',
      type: 'LOW_STOCK',
      isRead: false,
      createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      linkTab: 'spare-parts'
    },
    {
      id: 'notif-3',
      title: 'Part Request Approved',
      message: 'Refrigeration Compressor Request #REQ-8821 approved by Warehouse.',
      type: 'PART_REQUEST',
      isRead: true,
      createdAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
      linkTab: 'part-requests'
    }
  ]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((
    title: string,
    message: string,
    type: 'success' | 'error' | 'warning' | 'info' = 'info',
    duration: number = 4000
  ) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newToast: ToastMessage = { id, title, message, type, duration };
    setToasts(prev => [...prev, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    showToast('Notifications', 'All notifications marked as read', 'success', 2000);
  };

  const addInAppNotification = (notif: Omit<InAppNotification, 'id' | 'createdAt' | 'isRead'>) => {
    const item: InAppNotification = {
      id: `notif-${Date.now()}`,
      createdAt: new Date().toISOString(),
      isRead: false,
      ...notif
    };
    setNotifications(prev => [item, ...prev]);
    showToast(item.title, item.message, 'info');
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <NotificationContext.Provider value={{
      toasts,
      showToast,
      removeToast,
      notifications,
      unreadCount,
      markAsRead,
      markAllAsRead,
      addInAppNotification
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

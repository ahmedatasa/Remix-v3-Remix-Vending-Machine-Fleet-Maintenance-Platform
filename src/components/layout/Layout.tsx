import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { GlobalSearchModal } from './GlobalSearchModal';
import { QRScannerModal } from '../common/QRScannerModal';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useLanguage } from '../../context/LanguageContext';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { NavigationTab, FaultCategory, TicketPriority, Machine } from '../../types';
import { api } from '../../services/api';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

interface LayoutProps {
  currentTab?: NavigationTab;
  activeTab?: NavigationTab;
  onNavigate: (tab: NavigationTab, id?: string) => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({
  currentTab,
  activeTab,
  onNavigate,
  children
}) => {
  const effectiveTab: NavigationTab = currentTab || activeTab || 'dashboard';
  const { isRTL, t } = useLanguage();
  const { toasts, removeToast, showToast, addInAppNotification } = useNotification();
  const { user } = useAuth();

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);

  // Dynamic Fleet Machines
  const [machines, setMachines] = useState<Machine[]>([]);

  // Quick Ticket Modal State
  const [isQuickTicketOpen, setIsQuickTicketOpen] = useState(false);
  const [quickMachineId, setQuickMachineId] = useState('');
  const [quickCategory, setQuickCategory] = useState<FaultCategory>('REFRIGERATION');
  const [quickPriority, setQuickPriority] = useState<TicketPriority>('HIGH');
  const [quickDescription, setQuickDescription] = useState('');
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);

  const loadMachines = async () => {
    try {
      const data = await api.getMachines();
      if (Array.isArray(data)) {
        setMachines(data);
        if (data.length > 0 && !quickMachineId) {
          setQuickMachineId(data[0].id);
        }
      }
    } catch {
      // Fallback
    }
  };

  useEffect(() => {
    loadMachines();
    const handleUpdate = () => {
      loadMachines();
    };
    window.addEventListener('vending-fleet-data-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('vending-fleet-data-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const handleCreateQuickTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickDescription.trim()) return;

    setIsSubmittingTicket(true);
    try {
      const effectiveMachineId = quickMachineId || (machines.length > 0 ? machines[0].id : undefined);
      const newTck = await api.createTicket({
        machineId: effectiveMachineId,
        category: quickCategory,
        priority: quickPriority,
        description: quickDescription,
        reporterName: user?.fullName || 'Dispatcher Operator',
        source: 'MANUAL'
      });

      showToast(
        t('success'),
        `Ticket ${newTck.ticketNumber} created successfully!`,
        'success'
      );

      addInAppNotification({
        title: `Ticket Created: ${newTck.ticketNumber}`,
        message: `${newTck.description.substring(0, 60)}...`,
        type: 'TICKET_CREATED',
        linkTab: 'ticket-detail',
        linkId: newTck.id
      });

      setIsQuickTicketOpen(false);
      setQuickDescription('');
      onNavigate('ticket-detail', newTck.id);
    } catch (err) {
      showToast(t('error'), 'Failed to create ticket', 'error');
    } finally {
      setIsSubmittingTicket(false);
    }
  };

  const handleQRMachineSelected = (code: string, targetMode?: 'technician' | 'machine' | 'customer' | 'part-request') => {
    const clean = code.trim().toUpperCase();
    const found = machines.find(
      m =>
        m.publicId?.toUpperCase() === clean ||
        m.machineNumber?.toUpperCase() === clean ||
        m.id?.toUpperCase() === clean ||
        (m.publicQrId && m.publicQrId.toUpperCase() === clean)
    );

    if (targetMode === 'machine' && found) {
      onNavigate('machine-detail', found.id);
      showToast('Machine Recognized', `Navigated to ${found.machineNumber} (${found.publicId})`, 'info');
      return;
    }

    if (targetMode === 'technician') {
      const machineNum = found ? found.machineNumber : code;
      onNavigate('public-portal', `${machineNum}?mode=technician`);
      showToast(isRTL ? 'بوابة الفني الميداني' : 'Technician QR Portal', isRTL ? `تم مسح كود الماكينة #${machineNum}` : `Scanned Machine #${machineNum}`, 'success');
      return;
    }

    if (targetMode === 'part-request') {
      const machineNum = found ? found.machineNumber : code;
      onNavigate('public-portal', `${machineNum}?mode=part-request`);
      showToast(isRTL ? 'بوابة طلب قطع الغيار' : 'Spare Parts Request', isRTL ? `تم فتح طلب قطع غيار للماكينة #${machineNum}` : `Opened Part Request for #${machineNum}`, 'success');
      return;
    }

    if (targetMode === 'customer') {
      const machineNum = found ? found.machineNumber : code;
      onNavigate('public-portal', `${machineNum}?mode=customer`);
      return;
    }

    // Default fallback
    if (found) {
      onNavigate('public-portal', `${found.machineNumber}?mode=technician`);
    } else {
      onNavigate('public-portal', code);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-blue-600 selection:text-white">
      {/* Desktop & Mobile Sidebar */}
      <Sidebar
        currentTab={effectiveTab}
        onNavigate={tab => {
          onNavigate(tab);
          setIsMobileMenuOpen(false);
        }}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        onOpenQRScanner={() => setIsQRScannerOpen(true)}
      />

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ${
          isRTL
            ? isSidebarCollapsed ? 'mr-20' : 'mr-64'
            : isSidebarCollapsed ? 'ml-20' : 'ml-64'
        }`}
      >
        <Header
          currentTab={effectiveTab}
          onNavigate={onNavigate}
          onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          onOpenQuickTicket={() => setIsQuickTicketOpen(true)}
          onOpenSearch={() => setIsSearchOpen(true)}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Global Search Modal */}
      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectResult={(tab, id) => onNavigate(tab, id)}
      />

      {/* QR Scanner Modal */}
      <QRScannerModal
        isOpen={isQRScannerOpen}
        onClose={() => setIsQRScannerOpen(false)}
        onSelectMachine={handleQRMachineSelected}
      />

      {/* Quick Ticket Creation Modal */}
      <Modal
        isOpen={isQuickTicketOpen}
        onClose={() => setIsQuickTicketOpen(false)}
        title={t('newTicket')}
        subtitle="Quick dispatch ticket creation for immediate field maintenance"
        maxWidth="lg"
      >
        <form onSubmit={handleCreateQuickTicket} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              {t('machineNumber')}
            </label>
            <select
              value={quickMachineId}
              onChange={e => setQuickMachineId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
            >
              {machines.length === 0 ? (
                <option value="">لا توجد ماكينات مسجلة حالياً</option>
              ) : (
                machines.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.machineNumber} — {m.currentLocation?.fullDescription || m.currentLocation?.areaZone || 'الموقع الرئيسي'} ({m.status})
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {t('category')}
              </label>
              <select
                value={quickCategory}
                onChange={e => setQuickCategory(e.target.value as FaultCategory)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="REFRIGERATION">Refrigeration & Cooling</option>
                <option value="CARD_READER">Payment / Card Reader</option>
                <option value="PRODUCT_DISPENSING">Product Dispensing / Jam</option>
                <option value="COFFEE_BREWING">Coffee Brewer & Water</option>
                <option value="POWER_ELECTRICAL">Power & Electrical</option>
                <option value="SOFTWARE">Software & DEX Telemetry</option>
                <option value="VANDALISM">Vandalism & Glass</option>
                <option value="OTHER">Other / General</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {t('priority')}
              </label>
              <select
                value={quickPriority}
                onChange={e => setQuickPriority(e.target.value as TicketPriority)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="CRITICAL">Critical (2h SLA)</option>
                <option value="HIGH">High (4h SLA)</option>
                <option value="MEDIUM">Medium (8h SLA)</option>
                <option value="LOW">Low (24h SLA)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              {t('description')}
            </label>
            <textarea
              required
              rows={3}
              value={quickDescription}
              onChange={e => setQuickDescription(e.target.value)}
              placeholder="Describe machine behavior, fault symptom, error code on display..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsQuickTicketOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSubmittingTicket}
            >
              {t('createTicket')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Floating Toast Notification Container */}
      <div className={`fixed bottom-4 ${isRTL ? 'left-4' : 'right-4'} z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none`}>
        {toasts.map(toast => {
          const iconMap = {
            success: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
            warning: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
            error: <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />,
            info: <Info className="w-4 h-4 text-blue-400 shrink-0" />
          };

          return (
            <div
              key={toast.id}
              className="pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl bg-slate-900/95 border border-slate-700/80 shadow-2xl backdrop-blur-md text-slate-100 transition-all duration-300 transform translate-y-0"
            >
              {iconMap[toast.type]}
              <div className="flex-1 min-w-0">
                <h5 className="text-xs font-bold text-slate-100">{toast.title}</h5>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">{toast.message}</p>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-slate-400 hover:text-slate-200 p-0.5 rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

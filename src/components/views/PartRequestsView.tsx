import React, { useState, useEffect, useMemo } from 'react';
import {
  ClipboardList,
  Plus,
  CheckCircle2,
  XCircle,
  Truck,
  Package,
  Clock,
  Send,
  User,
  ShoppingBag,
  ArrowDownLeft,
  Filter,
  Eye,
  Edit2,
  Trash2,
  Ban,
  Bell,
  AlertCircle,
  Check,
  Layers,
  ArrowRight,
  Warehouse,
  Info,
  ExternalLink
} from 'lucide-react';
import { DataTable, Column } from '../common/DataTable';
import { StatusBadge } from '../common/StatusBadge';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { ConfirmActionModal } from '../common/ConfirmActionModal';
import { useLanguage } from '../../context/LanguageContext';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { PartRequest, NavigationTab, PartRequestStatus } from '../../types';
import { api } from '../../services/api';

interface PartRequestsViewProps {
  onNavigate: (tab: NavigationTab, id?: string) => void;
}

export const PartRequestsView: React.FC<PartRequestsViewProps> = ({ onNavigate }) => {
  const { t, formatDate, isRTL } = useLanguage();
  const { showToast } = useNotification();
  const { canManageInventory, isAdmin } = useAuth();

  const [requests, setRequests] = useState<any[]>([]);
  const [liveTickets, setLiveTickets] = useState<any[]>([]);
  const [liveSpareParts, setLiveSpareParts] = useState<any[]>([]);
  const [liveSuppliers, setLiveSuppliers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [activeCategory, setActiveCategory] = useState<'ACTIVE_PENDING' | 'ISSUED' | 'ALL' | 'CANCELLED_REJECTED'>('ACTIVE_PENDING');

  // New Request Modal
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [ticketId, setTicketId] = useState('');
  const [partId, setPartId] = useState('');
  const [isCustomPart, setIsCustomPart] = useState(false);
  const [customPartName, setCustomPartName] = useState('');
  const [customPartSku, setCustomPartSku] = useState('');
  const [customUnitCost, setCustomUnitCost] = useState('');
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');

  // Edit Request Modal
  const [editingReq, setEditingReq] = useState<any | null>(null);

  // Approve Smart Modal
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [approveTargetReq, setApproveTargetReq] = useState<any | null>(null);

  // Mark Ordered Modal
  const [isOrderOpen, setIsOrderOpen] = useState(false);
  const [orderTargetReq, setOrderTargetReq] = useState<any | null>(null);
  const [poNumber, setPoNumber] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [expectedDate, setExpectedDate] = useState(new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0]);

  // Receive Delivery Modal (إذن استلام وتوريد للمخزن)
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [receiveTargetReq, setReceiveTargetReq] = useState<any | null>(null);
  const [receivedQty, setReceivedQty] = useState(1);
  const [deliveryNoteNumber, setDeliveryNoteNumber] = useState('');
  const [storageLocation, setStorageLocation] = useState('Central Warehouse Depot');
  const [inspectionNotes, setInspectionNotes] = useState('تم الفحص والتأكد من مطابقة المواصفات الفنية');

  // Issue to Tech Modal (أمر صرف وتسليم للصيانة)
  const [isIssueOpen, setIsIssueOpen] = useState(false);
  const [issueTargetReq, setIssueTargetReq] = useState<any | null>(null);
  const [issueNotes, setIssueNotes] = useState('تم تسليم القطعة للفني لمباشرة واستكمال أعمال الإصلاح');

  // Request Detail Modal
  const [detailReq, setDetailReq] = useState<any | null>(null);

  // Confirmation Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    warningMessage?: string;
    requireReason?: boolean;
    referenceCounts?: Array<{ label: string; count: number }>;
    isDeactivation?: boolean;
    onConfirm: (reason?: string) => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: async () => {}
  });

  const loadRequests = async (showLoading = true) => {
    try {
      if (showLoading) setIsLoading(true);
      const [reqData, partsData, ticketsData, supData] = await Promise.all([
        api.getPartRequests(),
        api.getSpareParts().catch(() => []),
        api.getTickets().catch(() => []),
        api.getSuppliers().catch(() => [])
      ]);
      setRequests(reqData);
      setLiveSpareParts(partsData || []);
      setLiveTickets(ticketsData || []);
      setLiveSuppliers(supData || []);

      if (!ticketId && ticketsData && ticketsData.length > 0) {
        setTicketId(ticketsData[0].id);
      }
      if (!partId && partsData && partsData.length > 0) {
        setPartId(partsData[0].id);
      }
      if (!supplierId && supData && supData.length > 0) {
        setSupplierId(supData[0].id);
      }
    } catch {
      if (showLoading) {
        showToast(t('error'), 'Failed to load part requests', 'error');
      }
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRequests(true);

    let debounceTimer: any = null;
    const handleUpdate = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadRequests(false);
      }, 300);
    };

    window.addEventListener('vending-fleet-data-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      clearTimeout(debounceTimer);
      window.removeEventListener('vending-fleet-data-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const handleUpdateStatus = async (
    id: string,
    status: PartRequestStatus,
    payload?: {
      poNumber?: string;
      supplierId?: string;
      expectedDeliveryDate?: string;
      comment?: string;
      actor?: string;
      autoReplenish?: boolean;
      autoIssue?: boolean;
      storageLocation?: string;
      deliveryNoteNumber?: string;
      unitCost?: number;
    }
  ) => {
    try {
      await api.updatePartRequestStatus(id, status, payload);
      
      if (status === 'RECEIVED') {
        showToast(
          'تم الاستلام والتوريد للمخزن 📦',
          'تم تسجيل القطعة في دليل قطع الغيار وإيداع الكمية بالرصيد وإرسال إشعار فوري لقسم الصيانة بتوفر القطعة!',
          'success',
          5000
        );
      } else if (status === 'ISSUED') {
        showToast(
          'تم صرف القطعة واستئناف التذكرة ⚡',
          'تم خصم الكمية من المستودع وتحويل حالة البلاغ تلقائياً إلى [قيد الإصلاح - IN_PROGRESS] مع إشعار الصيانة!',
          'success',
          5000
        );
      } else if (status === 'ORDERED') {
        showToast(
          'تم إصدار أمر الشراء 📑',
          `تم تسجيل أمر الشراء ${payload?.poNumber || ''} من المورد بنجاح!`,
          'success'
        );
      } else {
        showToast(t('success'), `Part request transitioned to ${status}!`, 'success');
      }

      await loadRequests();
      setIsApproveOpen(false);
      setIsOrderOpen(false);
      setIsReceiveOpen(false);
      setIsIssueOpen(false);
    } catch (err: any) {
      showToast(t('error'), err.message || 'Failed to update request status', 'error');
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const selectedPart = liveSpareParts.find(p => p.id === partId);
      await api.createPartRequest({
        ticketId: ticketId || liveTickets[0]?.id,
        sparePartId: isCustomPart ? undefined : (partId || liveSpareParts[0]?.id),
        partName: isCustomPart ? customPartName : (selectedPart?.nameAr || selectedPart?.name),
        partNumber: isCustomPart ? customPartSku : selectedPart?.partNumber,
        unitCost: isCustomPart ? Number(customUnitCost) : selectedPart?.unitCost,
        quantity: Number(qty),
        notes
      });
      showToast(t('success'), 'تم تقديم طلب قطعة الغيار إلى إدارة المخزن والمشتريات بنجاح!', 'success');
      setIsNewOpen(false);
      setCustomPartName('');
      setCustomPartSku('');
      setCustomUnitCost('');
      setIsCustomPart(false);
      await loadRequests();
    } catch (err: any) {
      showToast(t('error'), err.message || 'Failed to submit request', 'error');
    }
  };

  const handleUpdateReq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReq) return;

    try {
      await api.updatePartRequest(editingReq.id, {
        quantity: Number(editingReq.quantity),
        notes: editingReq.notes,
        status: editingReq.status,
        poNumber: editingReq.poNumber,
        supplierId: editingReq.supplierId
      });
      showToast(t('success'), `Requisition ${editingReq.requestNumber || editingReq.id} updated!`, 'success');
      setEditingReq(null);
      await loadRequests();
    } catch (err: any) {
      showToast(t('error'), err.message || 'Failed to update requisition', 'error');
    }
  };

  const handlePromptCancelReq = (req: any) => {
    setConfirmModal({
      isOpen: true,
      title: `إلغاء طلب القطعة: ${req.requestNumber || req.id}`,
      description: `هل أنت متأكد من رغبتك في إلغاء هذا الطلب؟ سيتم توثيق سبب الإلغاء في سجل التدقيق.`,
      warningMessage: 'سيتم إغلاق الطلب دون صرف أو توريد أي قطع غيار.',
      requireReason: true,
      onConfirm: async (reason?: string) => {
        await api.cancelPartRequest(req.id, reason);
        showToast(t('success'), `Requisition ${req.requestNumber || req.id} cancelled!`, 'success');
        await loadRequests();
      }
    });
  };

  const handlePromptDeleteReq = (req: any) => {
    setConfirmModal({
      isOpen: true,
      title: `حذف سجل الطلب: ${req.requestNumber || req.id}`,
      description: `هل أنت متأكد من حذف هذا السجل نهائياً من النظام؟`,
      warningMessage: req.status === 'ISSUED' ? 'تنبيه: تم صرف قطع غيار لهذا الطلب مسبقاً.' : undefined,
      requireReason: true,
      onConfirm: async (reason?: string) => {
        await api.deletePartRequest(req.id, false, reason);
        showToast(t('success'), `Requisition deleted!`, 'success');
        await loadRequests();
      }
    });
  };

  const openApproveModal = (req: any) => {
    setApproveTargetReq(req);
    setIsApproveOpen(true);
  };

  const openOrderModal = (req: any) => {
    setOrderTargetReq(req);
    setPoNumber(req.poNumber || `PO-2026-${Math.floor(1000 + Math.random() * 9000)}`);
    setSupplierId(req.supplierId || liveSuppliers[0]?.id || '');
    setExpectedDate(new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0]);
    setIsOrderOpen(true);
  };

  const openReceiveModal = (req: any) => {
    setReceiveTargetReq(req);
    setReceivedQty(req.quantity || 1);
    setDeliveryNoteNumber(`DN-${Math.floor(10000 + Math.random() * 90000)}`);
    setStorageLocation(req.sparePart?.shelfLocation || 'Rack A-02');
    setInspectionNotes('تم الفحص الفني والمطابقة وإيداع الشحنة بالمستودع');
    setIsReceiveOpen(true);
  };

  const openIssueModal = (req: any) => {
    setIssueTargetReq(req);
    setIssueNotes('تم تسليم القطعة لفني الصيانة لاستئناف أعمال الإصلاح بالبلاغ');
    setIsIssueOpen(true);
  };

  const counts = useMemo(() => {
    const active = requests.filter(r => ['REQUESTED', 'PENDING', 'APPROVED', 'ORDERED', 'RECEIVED'].includes(r.status)).length;
    const issued = requests.filter(r => r.status === 'ISSUED').length;
    const cancelledOrRejected = requests.filter(r => ['CANCELLED', 'REJECTED'].includes(r.status)).length;
    return {
      all: requests.length,
      active,
      issued,
      cancelledOrRejected
    };
  }, [requests]);

  const filteredRequests = requests.filter(r => {
    if (statusFilter !== 'ALL') {
      if (r.status !== statusFilter) return false;
    } else {
      if (activeCategory === 'ACTIVE_PENDING') {
        if (!['REQUESTED', 'PENDING', 'APPROVED', 'ORDERED', 'RECEIVED'].includes(r.status)) return false;
      } else if (activeCategory === 'ISSUED') {
        if (r.status !== 'ISSUED') return false;
      } else if (activeCategory === 'CANCELLED_REJECTED') {
        if (!['CANCELLED', 'REJECTED'].includes(r.status)) return false;
      }
    }
    return true;
  });

  const columns: Column<any>[] = [
    {
      key: 'requestNumber',
      header: isRTL ? 'رقم الطلب والتاريخ' : 'Requisition #',
      sortable: true,
      render: row => (
        <div>
          <span className="font-mono font-bold text-slate-100 text-xs">{row.requestNumber || row.id}</span>
          <span className="text-[11px] text-slate-400 block font-mono">{formatDate(row.createdAt)}</span>
        </div>
      )
    },
    {
      key: 'sparePart',
      header: isRTL ? 'قطعة الغيار المطلوبة' : t('spareParts'),
      render: row => (
        <div>
          <span className="font-mono font-bold text-slate-100 text-xs">
            {row.sparePart?.partNumber || row.partNumber}
          </span>
          <span className="text-[11px] text-slate-300 block truncate max-w-xs font-medium">
            {row.sparePart?.name || row.partName}
          </span>
        </div>
      )
    },
    {
      key: 'quantity',
      header: isRTL ? 'الكمية وحالة المخزن' : 'Qty & Warehouse Stock',
      sortable: true,
      render: row => {
        const available = row.sparePart?.currentQuantity ?? 0;
        const isSufficient = available >= (row.quantity || 1);
        return (
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-xs text-blue-400">{row.quantity} قطعة</span>
            </div>
            <div className="mt-0.5">
              {isSufficient ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3 h-3" /> متوفر بالمخزن ({available})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] text-rose-400 font-medium">
                  <AlertCircle className="w-3 h-3" /> غير متوفر (المتاح: {available})
                </span>
              )}
            </div>
          </div>
        );
      }
    },
    {
      key: 'ticket',
      header: isRTL ? 'البلاغ / الماكينة' : 'Ticket / Machine',
      render: row => (
        <div>
          {row.ticketId ? (
            <button
              onClick={() => onNavigate('ticket-detail', row.ticketId)}
              className="text-xs font-mono text-blue-400 hover:text-blue-300 underline cursor-pointer inline-flex items-center gap-1"
            >
              {row.ticket?.ticketNumber || row.ticketNumber || 'Ticket'}
              <ExternalLink className="w-3 h-3" />
            </button>
          ) : (
            <span className="text-xs text-slate-500 font-mono">غير مرتبط</span>
          )}
          {row.machineNumber && (
            <span className="text-[10px] text-slate-400 font-mono block">{row.machineNumber}</span>
          )}
        </div>
      )
    },
    {
      key: 'status',
      header: t('status'),
      sortable: true,
      render: row => {
        const colorMap: Record<string, { bg: string; text: string; labelAr: string }> = {
          REQUESTED: { bg: 'bg-amber-500/20 border-amber-500/30', text: 'text-amber-300', labelAr: 'بانتظار الموافقة' },
          PENDING: { bg: 'bg-amber-500/20 border-amber-500/30', text: 'text-amber-300', labelAr: 'قيد الطلب' },
          APPROVED: { bg: 'bg-blue-500/20 border-blue-500/30', text: 'text-blue-300', labelAr: 'تمت الموافقة' },
          ORDERED: { bg: 'bg-purple-500/20 border-purple-500/30', text: 'text-purple-300', labelAr: 'مطلوبة من المورد (PO)' },
          RECEIVED: { bg: 'bg-indigo-500/20 border-indigo-500/30', text: 'text-indigo-300', labelAr: 'وصلت بالمخزن (جاهزة للصرف)' },
          ISSUED: { bg: 'bg-emerald-500/20 border-emerald-500/30', text: 'text-emerald-300', labelAr: 'تم الصرف واستئناف العمل' },
          REJECTED: { bg: 'bg-rose-500/20 border-rose-500/30', text: 'text-rose-300', labelAr: 'مرفوض' },
          CANCELLED: { bg: 'bg-slate-700 border-slate-600', text: 'text-slate-400', labelAr: 'ملغي' }
        };
        const st = colorMap[row.status] || { bg: 'bg-slate-800 border-slate-700', text: 'text-slate-300', labelAr: row.status };
        return (
          <div className="flex flex-col gap-0.5">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border font-mono ${st.bg} ${st.text}`}>
              {row.status}
            </span>
            {isRTL && <span className="text-[10px] text-slate-400 font-medium">{st.labelAr}</span>}
          </div>
        );
      }
    },
    {
      key: 'actions',
      header: isRTL ? 'إجراءات التوريد والصرف' : t('actions'),
      className: 'text-right rtl:text-left',
      render: row => {
        const available = row.sparePart?.currentQuantity ?? 0;
        const isStockAvailable = available >= (row.quantity || 1);

        return (
          <div className="flex items-center justify-end gap-1.5 flex-wrap" onClick={e => e.stopPropagation()}>
            <Button
              variant="outline"
              size="sm"
              icon={Eye}
              onClick={() => setDetailReq(row)}
            >
              {isRTL ? 'التفاصيل' : 'Details'}
            </Button>

            {canManageInventory && (
              <>
                {(row.status === 'REQUESTED' || row.status === 'PENDING') && (
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      icon={CheckCircle2}
                      onClick={() => openApproveModal(row)}
                    >
                      {isRTL ? 'موافقة على الطلب' : 'Approve'}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleUpdateStatus(row.id, 'REJECTED')}
                    >
                      {isRTL ? 'رفض' : 'Reject'}
                    </Button>
                  </>
                )}

                {row.status === 'APPROVED' && (
                  <>
                    {isStockAvailable ? (
                      <Button
                        variant="success"
                        size="sm"
                        icon={Truck}
                        onClick={() => openIssueModal(row)}
                      >
                        {isRTL ? 'أمر صرف فوري للصيانة' : 'Issue to Tech'}
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        icon={ShoppingBag}
                        onClick={() => openOrderModal(row)}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        {isRTL ? 'طلب من المورد (أمر شراء)' : 'Order from Supplier'}
                      </Button>
                    )}
                  </>
                )}

                {row.status === 'ORDERED' && (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={ArrowDownLeft}
                    onClick={() => openReceiveModal(row)}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    {isRTL ? 'إذن استلام وتوريد للمخزن' : 'Receive Inbound Stock'}
                  </Button>
                )}

                {row.status === 'RECEIVED' && (
                  <Button
                    variant="success"
                    size="sm"
                    icon={Truck}
                    onClick={() => openIssueModal(row)}
                  >
                    {isRTL ? 'صرف للصيانة واستئناف العمل' : 'Issue to Tech & Resume'}
                  </Button>
                )}

                {row.status === 'ISSUED' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {isRTL ? 'مكتمل (تم الصرف والإصلاح)' : 'Fulfilled & Issued'}
                  </span>
                )}

                {row.status === 'CANCELLED' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-slate-500/15 text-slate-400 border border-slate-700">
                    <Ban className="w-3.5 h-3.5" />
                    {isRTL ? 'طلب ملغي' : 'Cancelled'}
                  </span>
                )}

                {row.status === 'REJECTED' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {isRTL ? 'طلب مرفوض' : 'Rejected'}
                  </span>
                )}

                {/* Edit & Delete Controls */}
                <button
                  onClick={() => setEditingReq({ ...row })}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Edit Requisition"
                >
                  <Edit2 className="w-4 h-4" />
                </button>

                {row.status !== 'CANCELLED' && row.status !== 'ISSUED' && (
                  <button
                    onClick={() => handlePromptCancelReq(row)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Cancel Requisition"
                  >
                    <Ban className="w-4 h-4" />
                  </button>
                )}

                <button
                  onClick={() => handlePromptDeleteReq(row)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Delete Record"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        );
      }
    }
  ];

  return (
    <div className="space-y-6">
      {/* Interactive Maintenance & Warehouse Lifecycle Pipeline */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400">
              <Warehouse className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                {isRTL ? 'دورة الربط والتكامل بين قسم الصيانة وإدارة المخزن' : 'Maintenance & Warehouse Integration Pipeline'}
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {isRTL ? 'ربط مباشر ومؤتمت' : 'Real-time Linked'}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {isRTL
                  ? 'متابعة حركة قطع الغيار من طلب الفني، حتى أمر الشراء والتوريد للمخزن، وصولاً لأمر الصرف واستئناف أعمال الإصلاح تلقائياً.'
                  : 'Track replacement parts from technician requisition to supplier PO, inbound receipt, and automatic ticket resumption upon issuance.'}
              </p>
            </div>
          </div>

          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => setIsNewOpen(true)}
          >
            {isRTL ? 'تقديم طلب قطعة غيار جديد' : 'New Requisition'}
          </Button>
        </div>

        {/* 5-Stage Stepper Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          <div className="p-3 bg-slate-950/70 border border-amber-500/30 rounded-lg relative">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-amber-400">1. طلب القطعة</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300">REQUESTED</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              يقدم فني الصيانة طلب القطعة من شاشة البلاغ، وتتحول التذكرة إلى (بانتظار قطعة غيار).
            </p>
          </div>

          <div className="p-3 bg-slate-950/70 border border-blue-500/30 rounded-lg relative">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-blue-400">2. اعتماد المخزن</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300">APPROVED</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              يقوم أمين المستودع بالموافقة وفحص الرصيد الفعلي في المخزن.
            </p>
          </div>

          <div className="p-3 bg-slate-950/70 border border-purple-500/30 rounded-lg relative">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-purple-400">3. أمر شراء المورد (PO)</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300">ORDERED</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              في حال عدم توفر الرصيد، يتم إصدار أمر شراء خارجي من المورد المعتمد وتحديد موعد التوريد.
            </p>
          </div>

          <div className="p-3 bg-slate-950/70 border border-indigo-500/30 rounded-lg relative">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-indigo-400">4. إذن استلام وتوريد للمخزن</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300">RECEIVED</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              عند وصول القطعة، يتم فحصها وإيداعها بالمخزن وإرسال بلاغ فوري لقسم الصيانة بجاهزية الصرف.
            </p>
          </div>

          <div className="p-3 bg-slate-950/70 border border-emerald-500/30 rounded-lg relative">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-emerald-400">5. أمر صرف واستئناف العمل</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300">ISSUED</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              يتم تسليم القطعة للفني وتحديث حالة البلاغ تلقائياً إلى قيد العمل (IN_PROGRESS) لإكمال الإصلاح.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Category Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setActiveCategory('ACTIVE_PENDING');
              setStatusFilter('ALL');
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
              activeCategory === 'ACTIVE_PENDING' && statusFilter === 'ALL'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{isRTL ? 'طلبات تتطلب إجراء (نشطة)' : 'Active / Pending Action'}</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500/30 text-amber-200">
              {counts.active}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveCategory('ISSUED');
              setStatusFilter('ALL');
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
              activeCategory === 'ISSUED' && statusFilter === 'ALL'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{isRTL ? 'طلبات مصروفة ومكتملة' : 'Fulfilled & Issued'}</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500/30 text-emerald-200">
              {counts.issued}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveCategory('ALL');
              setStatusFilter('ALL');
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
              activeCategory === 'ALL' && statusFilter === 'ALL'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{isRTL ? 'كافة الطلبات' : 'All Requests'}</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-slate-700 text-slate-300">
              {counts.all}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveCategory('CANCELLED_REJECTED');
              setStatusFilter('ALL');
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
              activeCategory === 'CANCELLED_REJECTED' && statusFilter === 'ALL'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
            }`}
          >
            <Ban className="w-3.5 h-3.5" />
            <span>{isRTL ? 'ملغية ومرفوضة' : 'Cancelled / Rejected'}</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500/30 text-rose-200">
              {counts.cancelledOrRejected}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 hidden sm:inline">{isRTL ? 'تصفية محددة:' : 'Filter:'}</span>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">{isRTL ? 'كافة الحالات' : 'Status: All'}</option>
            <option value="REQUESTED">REQUESTED (مطلوبة)</option>
            <option value="APPROVED">APPROVED (معتمدة)</option>
            <option value="ORDERED">ORDERED (تم طلبها من المورد)</option>
            <option value="RECEIVED">RECEIVED (وصلت بالمخزن)</option>
            <option value="ISSUED">ISSUED (تم الصرف واستئناف الصيانة)</option>
            <option value="REJECTED">REJECTED (مرفوضة)</option>
            <option value="CANCELLED">CANCELLED (ملغاة)</option>
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filteredRequests}
        isLoading={isLoading}
        searchPlaceholder={isRTL ? 'بحث في قائمة طلبات قطع الغيار...' : 'Search requisition queue...'}
      />

      {/* Smart Approve Modal (فحص توفر الرصيد وتحديد مسار الصرف أو الشراء) */}
      <Modal
        isOpen={isApproveOpen}
        onClose={() => setIsApproveOpen(false)}
        title={isRTL ? 'اعتماد طلب قطعة الغيار وفحص المخزن' : 'Approve Spare Part Requisition'}
        subtitle={`طلب رقم: ${approveTargetReq?.requestNumber || approveTargetReq?.id}`}
        maxWidth="md"
      >
        {approveTargetReq && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">قطعة الغيار المطلوبة:</span>
                <span className="font-bold text-slate-100 font-mono">
                  {approveTargetReq.sparePart?.partNumber || approveTargetReq.partNumber} - {approveTargetReq.partName || approveTargetReq.sparePart?.name}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">الكمية المطلوبة:</span>
                <span className="font-mono font-bold text-blue-400">{approveTargetReq.quantity} قطعة</span>
              </div>
              <div className="flex justify-between items-center border-t border-slate-800/80 pt-2">
                <span className="text-slate-400">الرصيد الفعلي المتوفر بالمخزن:</span>
                <span className="font-mono font-bold text-slate-200">
                  {approveTargetReq.sparePart?.currentQuantity ?? 0} قطعة
                </span>
              </div>
            </div>

            {/* Stock Decision Notice */}
            {(approveTargetReq.sparePart?.currentQuantity ?? 0) >= (approveTargetReq.quantity || 1) ? (
              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-300 space-y-1">
                <div className="flex items-center gap-2 font-bold text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>القطعة متوفرة حالياً في رصيد المستودع!</span>
                </div>
                <p className="text-[11px] text-emerald-200/80">
                  يمكنك الموافقة وصرف القطعة فوراً للفني لاستئناف أعمال الصيانة والإصلاح بالبلاغ المرتبط.
                </p>
              </div>
            ) : (
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 space-y-1">
                <div className="flex items-center gap-2 font-bold text-amber-400">
                  <AlertCircle className="w-4 h-4" />
                  <span>تنبيه: القطعة غير متوفرة برصيد كافٍ في المخزن!</span>
                </div>
                <p className="text-[11px] text-amber-200/80">
                  الرصيد الحالي ({approveTargetReq.sparePart?.currentQuantity ?? 0}) أقل من المطلوب ({approveTargetReq.quantity}). يلزم اعتماد الطلب وإصدار أمر شراء (PO) لتوريدها من المورد.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsApproveOpen(false)}>
                {t('cancel')}
              </Button>
              
              {(approveTargetReq.sparePart?.currentQuantity ?? 0) >= (approveTargetReq.quantity || 1) ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleUpdateStatus(approveTargetReq.id, 'APPROVED')}
                  >
                    موافقة مبدئية فقط
                  </Button>
                  <Button
                    type="button"
                    variant="success"
                    size="sm"
                    icon={Truck}
                    onClick={() => handleUpdateStatus(approveTargetReq.id, 'ISSUED')}
                  >
                    موافقة وإصدار أمر صرف فوري للصيانة
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleUpdateStatus(approveTargetReq.id, 'APPROVED')}
                  >
                    موافقة مبدئية
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    icon={ShoppingBag}
                    className="bg-purple-600 hover:bg-purple-700"
                    onClick={() => {
                      setIsApproveOpen(false);
                      openOrderModal(approveTargetReq);
                    }}
                  >
                    موافقة وفتح أمر شراء من المورد (PO)
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Order PO Modal (أمر شراء وتوريد من المورد) */}
      <Modal
        isOpen={isOrderOpen}
        onClose={() => setIsOrderOpen(false)}
        title={isRTL ? 'إصدار أمر شراء وتوريد من المورد (Purchase Order)' : 'Place Purchase Order'}
        subtitle={`طلب رقم: ${orderTargetReq?.requestNumber || orderTargetReq?.id}`}
        maxWidth="md"
      >
        {orderTargetReq && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">قطعة الغيار:</span>
                <span className="font-semibold text-slate-200 font-mono">{orderTargetReq.partName || orderTargetReq.sparePart?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">الكمية المطلوبة للتوريد:</span>
                <span className="font-mono font-bold text-blue-400">{orderTargetReq.quantity} قطعة</span>
              </div>
              {orderTargetReq.ticketNumber && (
                <div className="flex justify-between">
                  <span className="text-slate-400">البلاغ المرتبط:</span>
                  <span className="font-mono text-slate-300">{orderTargetReq.ticketNumber}</span>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                رقم أمر الشراء (PO #) *
              </label>
              <input
                type="text"
                value={poNumber}
                onChange={e => setPoNumber(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                المورد المعتمد *
              </label>
              <select
                value={supplierId || (liveSuppliers[0]?.id || '')}
                onChange={e => setSupplierId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              >
                {liveSuppliers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.leadTimeDays ? `(مدة التوريد: ${s.leadTimeDays} أيام)` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                تاريخ التوريد المتوقع
              </label>
              <input
                type="date"
                value={expectedDate}
                onChange={e => setExpectedDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-300 text-[11px] flex items-center gap-2">
              <Info className="w-4 h-4 flex-shrink-0" />
              <span>سيتم توثيق أمر الشراء في سجل البلاغ وإشعار قسم الصيانة بموعد التوريد المتوقع.</span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsOrderOpen(false)}>
                {t('cancel')}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                icon={ShoppingBag}
                className="bg-purple-600 hover:bg-purple-700"
                onClick={() =>
                  handleUpdateStatus(orderTargetReq.id, 'ORDERED', {
                    poNumber: poNumber || `PO-${Date.now().toString().slice(-6)}`,
                    supplierId: supplierId || (liveSuppliers[0]?.id || ''),
                    expectedDeliveryDate: expectedDate
                  })
                }
              >
                تأكيد إصدار أمر الشراء
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Inbound Delivery Receipt Modal (إذن استلام وتوريد للمخزن وإرسال بلاغ للصيانة) */}
      <Modal
        isOpen={isReceiveOpen}
        onClose={() => setIsReceiveOpen(false)}
        title={isRTL ? 'إذن استلام وتوريد للمخزن وفحص الشحنة' : 'Inbound Stock Receipt Voucher'}
        subtitle={`استلام توريد أمر الشراء: ${receiveTargetReq?.poNumber || 'PO-VOUCHER'}`}
        maxWidth="md"
      >
        {receiveTargetReq && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">القطعة المورّدة:</span>
                <span className="font-bold text-slate-100 font-mono">{receiveTargetReq.partName || receiveTargetReq.sparePart?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">المورد:</span>
                <span className="text-slate-300">{receiveTargetReq.supplier?.name || 'المورد المعتمد'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">أمر الشراء المرجعي:</span>
                <span className="font-mono text-purple-400 font-bold">{receiveTargetReq.poNumber || 'N/A'}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  الكمية المستلمة والمفحوصة *
                </label>
                <input
                  type="number"
                  min={1}
                  value={receivedQty}
                  onChange={e => setReceivedQty(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  رقم إذن الاستلام / بوليصة الشحن *
                </label>
                <input
                  type="text"
                  placeholder="DN-2026-001"
                  value={deliveryNoteNumber}
                  onChange={e => setDeliveryNoteNumber(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                موقع التخزين / الرف في المستودع
              </label>
              <input
                type="text"
                value={storageLocation}
                onChange={e => setStorageLocation(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                ملاحظات الفحص الفني
              </label>
              <textarea
                rows={2}
                value={inspectionNotes}
                onChange={e => setInspectionNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            {/* Crucial Notification Highlight */}
            <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/30 rounded-xl space-y-1">
              <div className="flex items-center gap-2 font-bold text-indigo-300">
                <Bell className="w-4 h-4 text-indigo-400" />
                <span>إرسال إشعار فوري وتحديث بلاغ الصيانة</span>
              </div>
              <p className="text-[11px] text-indigo-200/80 leading-relaxed">
                بمجرد تأكيد الاستلام، سيتم تلقائياً إدراج القطعة في دليل قطع الغيار وإيداع الكمية بالرصيد، وإرسال إشعار فوري لقسم الصيانة والدعم الفني بأن القطعة جاهزة للصرف لاستكمال الإصلاح.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsReceiveOpen(false)}>
                {t('cancel')}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                icon={ArrowDownLeft}
                className="bg-indigo-600 hover:bg-indigo-700"
                onClick={() =>
                  handleUpdateStatus(receiveTargetReq.id, 'RECEIVED', {
                    poNumber: receiveTargetReq.poNumber || deliveryNoteNumber || `PO-${Date.now().toString().slice(-6)}`,
                    deliveryNoteNumber: deliveryNoteNumber || `DN-${Date.now().toString().slice(-6)}`,
                    storageLocation,
                    comment: `تم استلام الشحنة وتوريدها للمخزن بموجب إذن توريد ${deliveryNoteNumber || 'N/A'} (${storageLocation}): ${inspectionNotes}`
                  })
                }
              >
                تأكيد إذن التوريد وإيداع المخزن
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Issue to Tech Modal (أمر صرف وتسليم للصيانة واستئناف التذكرة) */}
      <Modal
        isOpen={isIssueOpen}
        onClose={() => setIsIssueOpen(false)}
        title={isRTL ? 'إصدار أمر صرف وتسليم لقسم الصيانة' : 'Issue Parts to Maintenance'}
        subtitle={`طلب رقم: ${issueTargetReq?.requestNumber || issueTargetReq?.id}`}
        maxWidth="md"
      >
        {issueTargetReq && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">قطعة الغيار:</span>
                <span className="font-bold text-slate-100 font-mono">
                  {issueTargetReq.partName || issueTargetReq.sparePart?.name} ({issueTargetReq.quantity}x)
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">البلاغ المرتبط:</span>
                <span className="font-mono font-bold text-blue-400">{issueTargetReq.ticketNumber || issueTargetReq.ticketId || 'TCK-ACTIVE'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">الماكينة:</span>
                <span className="font-mono text-slate-300">{issueTargetReq.machineNumber || 'N/A'}</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                ملاحظات الصرف والتسليم للفني
              </label>
              <textarea
                rows={2}
                value={issueNotes}
                onChange={e => setIssueNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-1">
              <div className="flex items-center gap-2 font-bold text-emerald-300">
                <Truck className="w-4 h-4 text-emerald-400" />
                <span>استئناف حالة البلاغ تلقائياً إلى [قيد الإصلاح]</span>
              </div>
              <p className="text-[11px] text-emerald-200/80 leading-relaxed">
                سيتم خصم الكمية من رصيد المستودع، وتسجيل حركة الصرف، وتحديث حالة البلاغ فورياً إلى (قيد الإصلاح - IN_PROGRESS) مع إضافة إشعار وإجراء صيانة تلقائي.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsIssueOpen(false)}>
                {t('cancel')}
              </Button>
              <Button
                type="button"
                variant="success"
                size="sm"
                icon={Truck}
                onClick={() =>
                  handleUpdateStatus(issueTargetReq.id, 'ISSUED', {
                    comment: issueNotes
                  })
                }
              >
                تأكيد أمر الصرف واستئناف البلاغ
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* New Requisition Modal */}
      <Modal
        isOpen={isNewOpen}
        onClose={() => setIsNewOpen(false)}
        title={isRTL ? 'تقديم طلب قطعة غيار جديدة' : 'Submit Part Requisition'}
        subtitle={isRTL ? 'إرسال طلب مكونات بديلة من المستودع المركزي أو المشتريات' : 'Request replacement components from central inventory or procurement'}
        maxWidth="md"
      >
        <form onSubmit={handleCreateRequest} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              {isRTL ? 'البلاغ المرتبط *' : 'Associated Incident Ticket *'}
            </label>
            <select
              value={ticketId || (liveTickets[0]?.id || '')}
              onChange={e => setTicketId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
            >
              {liveTickets.map(tck => (
                <option key={tck.id} value={tck.id}>
                  {tck.ticketNumber || tck.id} — {tck.machine?.machineNumber || tck.machineId || 'الماكينة'} ({tck.title || (typeof tck.category === 'object' && tck.category ? ((tck.category as any).nameAr || (tck.category as any).name || 'عام') : (tck.category || 'عام'))})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between p-2 bg-slate-900 border border-slate-800 rounded-lg">
            <span className="text-xs text-slate-300">
              {isCustomPart ? 'طلب قطعة جديدة غير مدرجة بالدليل' : 'اختيار قطعة من دليل قطع الغيار'}
            </span>
            <button
              type="button"
              onClick={() => setIsCustomPart(!isCustomPart)}
              className="text-xs text-blue-400 hover:text-blue-300 font-semibold underline"
            >
              {isCustomPart ? '← اختر من الدليل' : '+ طلب قطعة غير موجودة بالدليل'}
            </button>
          </div>

          {!isCustomPart ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  {isRTL ? 'قطعة الغيار *' : 'Spare Part SKU *'}
                </label>
                <select
                  value={partId || (liveSpareParts[0]?.id || '')}
                  onChange={e => setPartId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  {liveSpareParts.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.partNumber} - {p.nameAr || p.name} (رصيد المخزن: {p.currentQuantity || 0})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  {isRTL ? 'الكمية المطلوبة *' : 'Quantity Needed *'}
                </label>
                <input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={e => setQty(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3 p-3 bg-slate-950 border border-blue-500/30 rounded-xl">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  اسم القطعة المطلوبة بالتفصيل *
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: مضخة مياه ضغط عالي 24V أو شاشة لمس 10 بوصة"
                  value={customPartName}
                  onChange={e => setCustomPartName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    رقم القطعة / الكود المرجعي (إن وجد)
                  </label>
                  <input
                    type="text"
                    placeholder="SKU-CUSTOM-001"
                    value={customPartSku}
                    onChange={e => setCustomPartSku(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    الكمية المطلوبة *
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={qty}
                    onChange={e => setQty(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  التكلفة التقديرية (ريال / SAR)
                </label>
                <input
                  type="number"
                  placeholder="150"
                  value={customUnitCost}
                  onChange={e => setCustomUnitCost(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              {isRTL ? 'ملاحظات الأهمية والاستخدام' : 'Urgency / Delivery Notes'}
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={isRTL ? 'اكتب سبب طلب القطعة والحاجة العاجلة لها...' : 'Provide context on why this part is urgently needed...'}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsNewOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="primary" size="sm">
              {isRTL ? 'إرسال الطلب للمخزن' : 'Submit Request'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Requisition Modal */}
      {editingReq && (
        <Modal
          isOpen={!!editingReq}
          onClose={() => setEditingReq(null)}
          title={`Edit Requisition ${editingReq.requestNumber || editingReq.id}`}
          maxWidth="md"
        >
          <form onSubmit={handleUpdateReq} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Quantity *
                </label>
                <input
                  type="number"
                  min={1}
                  value={editingReq.quantity}
                  onChange={e => setEditingReq({ ...editingReq, quantity: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Requisition Status
                </label>
                <select
                  value={editingReq.status}
                  onChange={e => setEditingReq({ ...editingReq, status: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="REQUESTED">REQUESTED</option>
                  <option value="APPROVED">APPROVED</option>
                  <option value="ORDERED">ORDERED</option>
                  <option value="RECEIVED">RECEIVED</option>
                  <option value="ISSUED">ISSUED</option>
                  <option value="REJECTED">REJECTED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Purchase Order #
              </label>
              <input
                type="text"
                value={editingReq.poNumber || ''}
                onChange={e => setEditingReq({ ...editingReq, poNumber: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Notes
              </label>
              <textarea
                rows={2}
                value={editingReq.notes || ''}
                onChange={e => setEditingReq({ ...editingReq, notes: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditingReq(null)}>
                {t('cancel')}
              </Button>
              <Button type="submit" variant="primary" size="sm">
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Details & Requisition Timeline Modal */}
      <Modal
        isOpen={!!detailReq}
        onClose={() => setDetailReq(null)}
        title={isRTL ? 'تفاصيل وسجل دورة حياة طلب قطعة الغيار' : 'Part Requisition Audit & Timeline'}
        subtitle={`طلب رقم: ${detailReq?.requestNumber || detailReq?.id}`}
        maxWidth="lg"
      >
        {detailReq && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-slate-950 border border-slate-800 rounded-lg">
              <div>
                <span className="text-slate-400 block text-[11px]">رمز القطعة SKU</span>
                <strong className="text-slate-200 font-mono">{detailReq.partNumber || detailReq.sparePart?.partNumber}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">الكمية المطلوبة</span>
                <strong className="text-blue-400 font-mono">{detailReq.quantity} قطعة</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">حالة الطلب الحالية</span>
                <span className="font-bold text-amber-400 font-mono">{detailReq.status}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">البلاغ المرتبط</span>
                <strong className="text-slate-200 font-mono">{detailReq.ticketNumber || 'N/A'}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">الماكينة</span>
                <strong className="text-slate-200 font-mono">{detailReq.machineNumber || 'N/A'}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">أمر الشراء / التوريد</span>
                <strong className="text-purple-400 font-mono">{detailReq.poNumber || 'None'}</strong>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-slate-200 mb-2">{isRTL ? 'خط زمن الأحداث والتدقيق' : 'Audit & Lifecycle Event History'}</h4>
              <div className="space-y-2">
                {(detailReq.timeline || [
                  { status: detailReq.status, timestamp: detailReq.createdAt, actor: 'Technician', comment: detailReq.reason || 'Requisition filed' }
                ]).map((tl: any, i: number) => (
                  <div key={i} className="p-2.5 rounded bg-slate-900 border border-slate-800 flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-slate-200">{tl.status}</span>
                        <span className="text-[11px] text-slate-400">— {tl.actor}</span>
                      </div>
                      <p className="text-slate-300 text-[11px] mt-0.5">{tl.comment || 'Status transitioned'}</p>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">{formatDate(tl.timestamp)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDetailReq(null)}>
                {isRTL ? 'إغلاق' : 'Close'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirmation Modal */}
      <ConfirmActionModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        description={confirmModal.description}
        warningMessage={confirmModal.warningMessage}
        requireReason={confirmModal.requireReason}
        referenceCounts={confirmModal.referenceCounts}
        isDeactivation={confirmModal.isDeactivation}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
      />
    </div>
  );
};

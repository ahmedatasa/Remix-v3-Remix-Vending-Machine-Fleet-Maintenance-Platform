import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CalendarClock,
  History,
  PackageCheck,
  Plus,
  Scale,
  XCircle
} from 'lucide-react';
import { Button } from '../common/Button';
import { DataTable, Column } from '../common/DataTable';
import { Modal } from '../common/Modal';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useNotification } from '../../context/NotificationContext';
import {
  CommercialInventoryBatch,
  CommercialInventoryMovement,
  CommercialInventorySummary,
  CommercialProduct,
  NavigationTab,
  Supplier
} from '../../types';
import { api } from '../../services/api';

interface CommercialInventoryViewProps {
  onNavigate: (tab: NavigationTab, id?: string) => void;
}

const emptySummary: CommercialInventorySummary = {
  totalUnits: 0,
  totalValuation: 0,
  activeBatchCount: 0,
  nearExpiryBatchCount: 0,
  expiredBatchCount: 0,
  depletedBatchCount: 0,
  lowStockProductCount: 0,
  productCount: 0
};

const emptyReceipt = {
  productId: '',
  lotNumber: '',
  supplierId: '',
  productionDate: '',
  expiryDate: '',
  quantity: 0,
  unitCost: 0,
  notes: ''
};

const statusClass: Record<string, string> = {
  ACTIVE: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  NEAR_EXPIRY: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  EXPIRED: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  DEPLETED: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
  NO_EXPIRY: 'text-sky-400 bg-sky-500/10 border-sky-500/30'
};

export const CommercialInventoryView: React.FC<CommercialInventoryViewProps> = () => {
  const { isRTL } = useLanguage();
  const { showToast } = useNotification();
  const { canManageInventory } = useAuth();

  const [summary, setSummary] = useState<CommercialInventorySummary>(emptySummary);
  const [batches, setBatches] = useState<CommercialInventoryBatch[]>([]);
  const [movements, setMovements] = useState<CommercialInventoryMovement[]>([]);
  const [products, setProducts] = useState<CommercialProduct[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<CommercialInventoryBatch | null>(null);
  const [receipt, setReceipt] = useState({ ...emptyReceipt });
  const [adjustment, setAdjustment] = useState({ quantityDelta: 0, reason: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [summaryData, batchRows, movementRows, productRows, supplierRows] = await Promise.all([
        api.getCommercialInventorySummary(),
        api.getCommercialInventoryBatches(true),
        api.getCommercialInventoryMovements(200),
        api.getProducts(false),
        api.getSuppliers(false)
      ]);
      setSummary(summaryData);
      setBatches(batchRows);
      setMovements(movementRows);
      setProducts(productRows);
      setSuppliers(supplierRows);
    } catch (error: any) {
      showToast(isRTL ? 'خطأ' : 'Error', error?.message || 'Failed to load commercial inventory', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const productMap = useMemo(() => new Map(products.map(product => [product.id, product])), [products]);

  const openReceipt = () => {
    setReceipt({ ...emptyReceipt });
    setReceiveOpen(true);
  };

  const openAdjustment = (batch: CommercialInventoryBatch) => {
    setSelectedBatch(batch);
    setAdjustment({ quantityDelta: 0, reason: '', notes: '' });
    setAdjustOpen(true);
  };

  const submitReceipt = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await api.receiveCommercialInventory({
        ...receipt,
        supplierId: receipt.supplierId || undefined,
        productionDate: receipt.productionDate || undefined,
        expiryDate: receipt.expiryDate || undefined,
        quantity: Number(receipt.quantity),
        unitCost: Number(receipt.unitCost)
      });
      showToast(isRTL ? 'تم الاستلام' : 'Received', isRTL ? 'تم إضافة الدفعة للمخزن بنجاح' : 'Batch received successfully', 'success');
      setReceiveOpen(false);
      await loadData();
    } catch (error: any) {
      showToast(isRTL ? 'خطأ' : 'Error', error?.message || 'Failed to receive stock', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const submitAdjustment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedBatch) return;
    setSubmitting(true);
    try {
      await api.adjustCommercialInventory({
        batchId: selectedBatch.id,
        quantityDelta: Number(adjustment.quantityDelta),
        reason: adjustment.reason,
        notes: adjustment.notes || undefined
      });
      showToast(isRTL ? 'تم التعديل' : 'Adjusted', isRTL ? 'تم تعديل رصيد الدفعة' : 'Batch balance adjusted', 'success');
      setAdjustOpen(false);
      await loadData();
    } catch (error: any) {
      showToast(isRTL ? 'خطأ' : 'Error', error?.message || 'Failed to adjust stock', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const writeOffExpired = async (batch: CommercialInventoryBatch) => {
    if (!window.confirm(isRTL ? 'تأكيد إعدام كامل الكمية المنتهية؟' : 'Write off the full expired quantity?')) return;
    try {
      await api.writeOffExpiredCommercialBatch(batch.id);
      showToast(isRTL ? 'تم الإعدام' : 'Written off', isRTL ? 'تم إعدام المخزون المنتهي وتسجيل الحركة' : 'Expired stock written off and logged', 'success');
      await loadData();
    } catch (error: any) {
      showToast(isRTL ? 'خطأ' : 'Error', error?.message || 'Failed to write off expired stock', 'error');
    }
  };

  const batchColumns: Column<CommercialInventoryBatch>[] = [
    {
      key: 'productId',
      header: isRTL ? 'المنتج' : 'Product',
      sortable: true,
      render: row => {
        const product = row.product || productMap.get(row.productId);
        return (
          <div>
            <div className="text-xs font-semibold text-slate-100">{isRTL ? (product?.nameAr || product?.name) : product?.name}</div>
            <div className="text-[10px] font-mono text-slate-500">{product?.sku || row.productId}</div>
          </div>
        );
      }
    },
    {
      key: 'lotNumber',
      header: isRTL ? 'الدفعة / LOT' : 'Batch / Lot',
      sortable: true,
      render: row => <span className="font-mono text-xs text-slate-200">{row.lotNumber}</span>
    },
    {
      key: 'quantityOnHand',
      header: isRTL ? 'الرصيد' : 'On Hand',
      sortable: true,
      render: row => <span className="font-mono text-xs font-bold text-sky-400">{Number(row.quantityOnHand || 0)}</span>
    },
    {
      key: 'expiryDate',
      header: isRTL ? 'تاريخ الصلاحية' : 'Expiry',
      sortable: true,
      render: row => (
        <div>
          <div className="text-xs text-slate-200">{row.expiryDate || '—'}</div>
          {row.daysToExpiry !== null && row.daysToExpiry !== undefined && (
            <div className="text-[10px] text-slate-500">{row.daysToExpiry >= 0 ? `${row.daysToExpiry} ${isRTL ? 'يوم' : 'days'}` : `${Math.abs(row.daysToExpiry)} ${isRTL ? 'يوم منتهية' : 'days expired'}`}</div>
          )}
        </div>
      )
    },
    {
      key: 'status',
      header: isRTL ? 'الحالة' : 'Status',
      render: row => <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${statusClass[row.status || 'ACTIVE'] || statusClass.ACTIVE}`}>{row.status || 'ACTIVE'}</span>
    },
    {
      key: 'supplierId',
      header: isRTL ? 'المورد' : 'Supplier',
      render: row => <span className="text-xs text-slate-300">{row.supplier?.name || '—'}</span>
    },
    {
      key: 'actions',
      header: isRTL ? 'إجراءات' : 'Actions',
      render: row => canManageInventory ? (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => openAdjustment(row)}>{isRTL ? 'تعديل' : 'Adjust'}</Button>
          {row.status === 'EXPIRED' && Number(row.quantityOnHand || 0) > 0 && (
            <Button size="sm" variant="danger" onClick={() => writeOffExpired(row)}>{isRTL ? 'إعدام' : 'Write off'}</Button>
          )}
        </div>
      ) : null
    }
  ];

  const inputClass = 'w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100">{isRTL ? 'مخزون البضاعة والصلاحية' : 'Commercial Inventory & Expiry'}</h2>
          <p className="text-xs text-slate-400 mt-1">{isRTL ? 'إدارة دفعات منتجات البيع، الاستلام، الصلاحية، الحركات ومنع الرصيد السالب.' : 'Batch stock, receiving, expiry, movements and negative-stock prevention.'}</p>
        </div>
        {canManageInventory && <Button variant="primary" size="sm" icon={Plus} onClick={openReceipt}>{isRTL ? 'استلام دفعة' : 'Receive Batch'}</Button>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <StatCard icon={Archive} label={isRTL ? 'إجمالي الوحدات' : 'Total Units'} value={summary.totalUnits} />
        <StatCard icon={PackageCheck} label={isRTL ? 'دفعات نشطة' : 'Active Batches'} value={summary.activeBatchCount} />
        <StatCard icon={CalendarClock} label={isRTL ? 'قرب انتهاء' : 'Near Expiry'} value={summary.nearExpiryBatchCount} />
        <StatCard icon={XCircle} label={isRTL ? 'منتهية' : 'Expired'} value={summary.expiredBatchCount} />
        <StatCard icon={AlertTriangle} label={isRTL ? 'أقل من الحد' : 'Low Stock'} value={summary.lowStockProductCount} />
        <StatCard icon={Scale} label={isRTL ? 'قيمة المخزون' : 'Valuation'} value={Number(summary.totalValuation || 0).toFixed(2)} />
      </div>

      <div>
        <h3 className="text-sm font-bold text-slate-200 mb-3">{isRTL ? 'دفعات المخزون' : 'Inventory Batches'}</h3>
        <DataTable columns={batchColumns} data={batches} isLoading={loading} searchPlaceholder={isRTL ? 'بحث بالمنتج أو رقم الدفعة...' : 'Search product or lot...'} />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2"><History className="w-4 h-4 text-slate-400" /><h3 className="text-sm font-bold text-slate-200">{isRTL ? 'سجل حركات المخزون' : 'Stock Movement Ledger'}</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-950/50 text-slate-400"><tr><th className="px-4 py-2 text-left">{isRTL ? 'التاريخ' : 'Date'}</th><th className="px-4 py-2 text-left">{isRTL ? 'المنتج' : 'Product'}</th><th className="px-4 py-2 text-left">LOT</th><th className="px-4 py-2 text-left">{isRTL ? 'الحركة' : 'Movement'}</th><th className="px-4 py-2 text-left">{isRTL ? 'الكمية' : 'Qty'}</th><th className="px-4 py-2 text-left">{isRTL ? 'الرصيد' : 'Balance'}</th></tr></thead>
            <tbody>
              {movements.length === 0 ? <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">{isRTL ? 'لا توجد حركات حتى الآن' : 'No stock movements yet'}</td></tr> : movements.map(row => (
                <tr key={row.id} className="border-t border-slate-800/70">
                  <td className="px-4 py-2 text-slate-400">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2 text-slate-200">{isRTL ? (row.product?.nameAr || row.product?.name) : row.product?.name}</td>
                  <td className="px-4 py-2 font-mono text-slate-400">{row.batch?.lotNumber || row.batchId}</td>
                  <td className="px-4 py-2 text-slate-300">{row.type}</td>
                  <td className={`px-4 py-2 font-mono font-bold ${row.quantityChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{row.quantityChange > 0 ? '+' : ''}{row.quantityChange}</td>
                  <td className="px-4 py-2 font-mono text-sky-400">{row.balanceAfter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={receiveOpen} onClose={() => setReceiveOpen(false)} title={isRTL ? 'استلام دفعة بضاعة' : 'Receive Commercial Batch'} maxWidth="2xl">
        <form onSubmit={submitReceipt} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label={isRTL ? 'المنتج *' : 'Product *'}><select required value={receipt.productId} onChange={e => setReceipt({ ...receipt, productId: e.target.value, unitCost: Number(productMap.get(e.target.value)?.purchaseCost || 0) })} className={inputClass}><option value="">{isRTL ? 'اختر المنتج' : 'Select product'}</option>{products.map(product => <option key={product.id} value={product.id}>{product.sku} — {isRTL ? (product.nameAr || product.name) : product.name}</option>)}</select></Field>
            <Field label={isRTL ? 'رقم الدفعة / LOT *' : 'Lot Number *'}><input required value={receipt.lotNumber} onChange={e => setReceipt({ ...receipt, lotNumber: e.target.value })} className={inputClass} /></Field>
            <Field label={isRTL ? 'المورد' : 'Supplier'}><select value={receipt.supplierId} onChange={e => setReceipt({ ...receipt, supplierId: e.target.value })} className={inputClass}><option value="">{isRTL ? 'بدون مورد محدد' : 'No supplier selected'}</option>{suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></Field>
            <Field label={isRTL ? 'الكمية *' : 'Quantity *'}><input required min="0.0001" step="0.0001" type="number" value={receipt.quantity} onChange={e => setReceipt({ ...receipt, quantity: Number(e.target.value) })} className={inputClass} /></Field>
            <Field label={isRTL ? 'تكلفة الوحدة' : 'Unit Cost'}><input min="0" step="0.01" type="number" value={receipt.unitCost} onChange={e => setReceipt({ ...receipt, unitCost: Number(e.target.value) })} className={inputClass} /></Field>
            <Field label={isRTL ? 'تاريخ الإنتاج' : 'Production Date'}><input type="date" value={receipt.productionDate} onChange={e => setReceipt({ ...receipt, productionDate: e.target.value })} className={inputClass} /></Field>
            <Field label={isRTL ? 'تاريخ الصلاحية' : 'Expiry Date'}><input type="date" value={receipt.expiryDate} onChange={e => setReceipt({ ...receipt, expiryDate: e.target.value })} className={inputClass} /></Field>
            <Field label={isRTL ? 'ملاحظات' : 'Notes'}><input value={receipt.notes} onChange={e => setReceipt({ ...receipt, notes: e.target.value })} className={inputClass} /></Field>
          </div>
          <div className="flex justify-end gap-2"><Button type="button" size="sm" variant="secondary" onClick={() => setReceiveOpen(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button><Button type="submit" size="sm" isLoading={submitting}>{isRTL ? 'تسجيل الاستلام' : 'Receive Stock'}</Button></div>
        </form>
      </Modal>

      <Modal isOpen={adjustOpen} onClose={() => setAdjustOpen(false)} title={isRTL ? 'تعديل رصيد دفعة' : 'Adjust Batch Balance'} maxWidth="md">
        <form onSubmit={submitAdjustment} className="space-y-4">
          <div className="text-xs text-slate-400">{selectedBatch?.product?.sku || selectedBatch?.productId} · LOT {selectedBatch?.lotNumber} · {isRTL ? 'الرصيد الحالي' : 'Current'}: {selectedBatch?.quantityOnHand}</div>
          <Field label={isRTL ? 'التغيير في الكمية (+ أو -) *' : 'Quantity Delta (+ or -) *'}><input required step="0.0001" type="number" value={adjustment.quantityDelta} onChange={e => setAdjustment({ ...adjustment, quantityDelta: Number(e.target.value) })} className={inputClass} /></Field>
          <Field label={isRTL ? 'السبب *' : 'Reason *'}><input required value={adjustment.reason} onChange={e => setAdjustment({ ...adjustment, reason: e.target.value })} className={inputClass} /></Field>
          <Field label={isRTL ? 'ملاحظات' : 'Notes'}><input value={adjustment.notes} onChange={e => setAdjustment({ ...adjustment, notes: e.target.value })} className={inputClass} /></Field>
          <div className="flex justify-end gap-2"><Button type="button" size="sm" variant="secondary" onClick={() => setAdjustOpen(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button><Button type="submit" size="sm" isLoading={submitting}>{isRTL ? 'حفظ التعديل' : 'Save Adjustment'}</Button></div>
        </form>
      </Modal>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <div><label className="text-xs font-semibold text-slate-300 block mb-1">{label}</label>{children}</div>;

const StatCard: React.FC<{ icon: any; label: string; value: string | number }> = ({ icon: Icon, label, value }) => (
  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
    <div className="flex items-center gap-2 text-slate-500"><Icon className="w-4 h-4" /><span className="text-[10px] uppercase tracking-wide">{label}</span></div>
    <div className="mt-2 text-lg font-bold text-slate-100 font-mono">{value}</div>
  </div>
);

import React, { useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck,
  PackagePlus,
  RotateCcw,
  Scale,
  Store,
  Trash2,
  Truck
} from 'lucide-react';
import { Button } from '../common/Button';
import { DataTable, Column } from '../common/DataTable';
import { Modal } from '../common/Modal';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useNotification } from '../../context/NotificationContext';
import {
  CommercialInventoryBatch,
  CommercialProduct,
  Machine,
  MachineStockMovement,
  MachineStockRecord,
  MachineStockSummary,
  NavigationTab,
  RefillVisit
} from '../../types';
import { api } from '../../services/api';

interface MachineStockViewProps {
  onNavigate: (tab: NavigationTab, id?: string) => void;
}

const emptySummary: MachineStockSummary = {
  totalUnitsInMachines: 0,
  machinesWithStock: 0,
  stockedProductCount: 0,
  openVisitCount: 0,
  movementCount: 0
};

const inputClass = 'w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500';

export const MachineStockView: React.FC<MachineStockViewProps> = () => {
  const { isRTL } = useLanguage();
  const { showToast } = useNotification();
  const { canManageInventory } = useAuth();

  const [summary, setSummary] = useState<MachineStockSummary>(emptySummary);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [products, setProducts] = useState<CommercialProduct[]>([]);
  const [batches, setBatches] = useState<CommercialInventoryBatch[]>([]);
  const [records, setRecords] = useState<MachineStockRecord[]>([]);
  const [movements, setMovements] = useState<MachineStockMovement[]>([]);
  const [visits, setVisits] = useState<RefillVisit[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [startOpen, setStartOpen] = useState(false);
  const [startNotes, setStartNotes] = useState('');
  const [countOpen, setCountOpen] = useState(false);
  const [countDraft, setCountDraft] = useState({ productId: '', countedQuantity: 0, reason: '', notes: '' });
  const [refillOpen, setRefillOpen] = useState(false);
  const [refillDraft, setRefillDraft] = useState({ batchId: '', quantity: 0, countedBefore: '', notes: '' });
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnDraft, setReturnDraft] = useState({ productId: '', batchId: '', quantity: 0, reason: '', notes: '' });
  const [wasteOpen, setWasteOpen] = useState(false);
  const [wasteDraft, setWasteDraft] = useState({ productId: '', quantity: 0, reason: '', notes: '' });

  const loadBase = async () => {
    const [summaryData, machineRows, productRows, batchRows] = await Promise.all([
      api.getMachineStockSummary(),
      api.getMachines(),
      api.getProducts(false),
      api.getCommercialInventoryBatches(true)
    ]);
    setSummary(summaryData);
    setMachines(machineRows.filter((machine: Machine) => machine.isDeleted !== true));
    setProducts(productRows);
    setBatches(batchRows);
    if (!selectedMachineId && machineRows.length > 0) {
      setSelectedMachineId(machineRows[0].id);
    }
  };

  const loadMachine = async (machineId: string) => {
    if (!machineId) {
      setRecords([]);
      setMovements([]);
      setVisits([]);
      return;
    }
    const [stockRows, movementRows, visitRows] = await Promise.all([
      api.getMachineStockRecords(machineId),
      api.getMachineStockMovements(machineId, 300),
      api.getRefillVisits(machineId)
    ]);
    setRecords(stockRows);
    setMovements(movementRows);
    setVisits(visitRows);
  };

  const refresh = async (machineId = selectedMachineId) => {
    setLoading(true);
    try {
      await loadBase();
      await loadMachine(machineId);
    } catch (error: any) {
      showToast(isRTL ? 'خطأ' : 'Error', error?.message || 'Failed to load machine stock', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh('');
  }, []);

  useEffect(() => {
    if (selectedMachineId) loadMachine(selectedMachineId).catch((error: any) => {
      showToast(isRTL ? 'خطأ' : 'Error', error?.message || 'Failed to load selected machine', 'error');
    });
  }, [selectedMachineId]);

  const selectedMachine = useMemo(
    () => machines.find(machine => machine.id === selectedMachineId),
    [machines, selectedMachineId]
  );

  const openVisit = useMemo(
    () => visits.find(visit => visit.status === 'OPEN'),
    [visits]
  );

  const productMap = useMemo(
    () => new Map(products.map(product => [product.id, product])),
    [products]
  );

  const eligibleBatches = useMemo(
    () => batches.filter(batch =>
      Number(batch.quantityOnHand || 0) > 0 &&
      ['ACTIVE', 'NEAR_EXPIRY', 'NO_EXPIRY', undefined].includes(batch.status as any)
    ),
    [batches]
  );

  const finishMutation = async () => {
    await Promise.all([loadBase(), loadMachine(selectedMachineId)]);
  };

  const startVisit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedMachineId) return;
    setSubmitting(true);
    try {
      await api.startRefillVisit({ machineId: selectedMachineId, notes: startNotes || undefined });
      showToast(isRTL ? 'تم بدء الزيارة' : 'Visit started', isRTL ? 'تم فتح زيارة الجرد والتعبئة للماكينة' : 'Machine count/refill visit opened', 'success');
      setStartOpen(false);
      setStartNotes('');
      await finishMutation();
    } catch (error: any) {
      showToast(isRTL ? 'خطأ' : 'Error', error?.message || 'Failed to start visit', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const submitCount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!openVisit) return;
    setSubmitting(true);
    try {
      await api.countMachineStock(openVisit.id, {
        productId: countDraft.productId,
        countedQuantity: Number(countDraft.countedQuantity),
        reason: countDraft.reason || undefined,
        notes: countDraft.notes || undefined
      });
      setCountOpen(false);
      setCountDraft({ productId: '', countedQuantity: 0, reason: '', notes: '' });
      showToast(isRTL ? 'تم تسجيل الجرد' : 'Count saved', isRTL ? 'تم حفظ الرصيد الفعلي وتسجيل فرق الجرد' : 'Physical count and variance recorded', 'success');
      await finishMutation();
    } catch (error: any) {
      showToast(isRTL ? 'خطأ' : 'Error', error?.message || 'Failed to save count', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const submitRefill = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!openVisit) return;
    setSubmitting(true);
    try {
      await api.refillMachineStock(openVisit.id, {
        batchId: refillDraft.batchId,
        quantity: Number(refillDraft.quantity),
        countedBefore: refillDraft.countedBefore === '' ? undefined : Number(refillDraft.countedBefore),
        notes: refillDraft.notes || undefined
      });
      setRefillOpen(false);
      setRefillDraft({ batchId: '', quantity: 0, countedBefore: '', notes: '' });
      showToast(isRTL ? 'تمت التعبئة' : 'Refilled', isRTL ? 'تم نقل الكمية من المخزن إلى الماكينة' : 'Stock transferred from warehouse to machine', 'success');
      await finishMutation();
    } catch (error: any) {
      showToast(isRTL ? 'خطأ' : 'Error', error?.message || 'Failed to refill machine', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const submitReturn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!openVisit) return;
    setSubmitting(true);
    try {
      await api.returnMachineStock(openVisit.id, {
        productId: returnDraft.productId,
        batchId: returnDraft.batchId,
        quantity: Number(returnDraft.quantity),
        reason: returnDraft.reason || undefined,
        notes: returnDraft.notes || undefined
      });
      setReturnOpen(false);
      setReturnDraft({ productId: '', batchId: '', quantity: 0, reason: '', notes: '' });
      showToast(isRTL ? 'تم المرتجع' : 'Returned', isRTL ? 'تم إرجاع الكمية إلى دفعة المخزن' : 'Quantity returned to warehouse batch', 'success');
      await finishMutation();
    } catch (error: any) {
      showToast(isRTL ? 'خطأ' : 'Error', error?.message || 'Failed to return stock', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const submitWaste = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!openVisit) return;
    setSubmitting(true);
    try {
      await api.recordMachineStockWaste(openVisit.id, {
        productId: wasteDraft.productId,
        quantity: Number(wasteDraft.quantity),
        reason: wasteDraft.reason,
        notes: wasteDraft.notes || undefined
      });
      setWasteOpen(false);
      setWasteDraft({ productId: '', quantity: 0, reason: '', notes: '' });
      showToast(isRTL ? 'تم تسجيل التالف' : 'Waste recorded', isRTL ? 'تم خصم التالف من رصيد الماكينة وتسجيل الحركة' : 'Waste deducted and logged', 'success');
      await finishMutation();
    } catch (error: any) {
      showToast(isRTL ? 'خطأ' : 'Error', error?.message || 'Failed to record waste', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const completeVisit = async () => {
    if (!openVisit) return;
    if (!window.confirm(isRTL ? 'إنهاء زيارة الجرد والتعبئة الحالية؟' : 'Complete the current count/refill visit?')) return;
    try {
      await api.completeRefillVisit(openVisit.id);
      showToast(isRTL ? 'تم إنهاء الزيارة' : 'Visit completed', isRTL ? 'تم إغلاق الزيارة مع الاحتفاظ بجميع الحركات' : 'Visit closed with full movement history retained', 'success');
      await finishMutation();
    } catch (error: any) {
      showToast(isRTL ? 'خطأ' : 'Error', error?.message || 'Failed to complete visit', 'error');
    }
  };

  const stockColumns: Column<MachineStockRecord>[] = [
    { key: 'productId', header: isRTL ? 'المنتج' : 'Product', render: row => (
      <div><div className="text-xs font-semibold text-slate-100">{isRTL ? (row.product?.nameAr || row.product?.name) : (row.product?.name || row.product?.nameAr)}</div><div className="text-[10px] font-mono text-slate-500">{row.product?.sku || row.productId}</div></div>
    )},
    { key: 'quantityOnHand', header: isRTL ? 'الرصيد بالماكينة' : 'Machine Qty', render: row => <span className="font-mono text-sm text-emerald-400">{Number(row.quantityOnHand || 0)}</span> },
    { key: 'lastCountedAt', header: isRTL ? 'آخر جرد' : 'Last Count', render: row => <span className="text-xs text-slate-400">{row.lastCountedAt ? new Date(row.lastCountedAt).toLocaleString() : '—'}</span> },
    { key: 'lastRefilledAt', header: isRTL ? 'آخر تعبئة' : 'Last Refill', render: row => <span className="text-xs text-slate-400">{row.lastRefilledAt ? new Date(row.lastRefilledAt).toLocaleString() : '—'}</span> }
  ];

  const movementColumns: Column<MachineStockMovement>[] = [
    { key: 'createdAt', header: isRTL ? 'الوقت' : 'Time', render: row => <span className="text-[11px] text-slate-400">{new Date(row.createdAt).toLocaleString()}</span> },
    { key: 'type', header: isRTL ? 'الحركة' : 'Movement', render: row => <span className="text-xs font-semibold text-slate-200">{row.type}</span> },
    { key: 'productId', header: isRTL ? 'المنتج' : 'Product', render: row => <span className="text-xs">{isRTL ? (row.product?.nameAr || row.product?.name) : (row.product?.name || row.product?.nameAr)}</span> },
    { key: 'quantityChange', header: isRTL ? 'التغيير' : 'Change', render: row => <span className={`font-mono text-xs ${Number(row.quantityChange) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{Number(row.quantityChange) > 0 ? '+' : ''}{row.quantityChange}</span> },
    { key: 'balanceAfter', header: isRTL ? 'الرصيد بعد' : 'Balance', render: row => <span className="font-mono text-xs">{row.balanceAfter}</span> },
    { key: 'actorName', header: isRTL ? 'المنفذ' : 'Actor', render: row => <span className="text-xs text-slate-400">{row.actorName || '—'}</span> }
  ];

  const returnBatches = batches.filter(batch => !returnDraft.productId || batch.productId === returnDraft.productId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100">{isRTL ? 'مخزون الماكينات والجرد والتعبئة' : 'Machine Stock, Count & Refill'}</h2>
          <p className="text-xs text-slate-400 mt-1">{isRTL ? 'نقل البضاعة من المخزن إلى الماكينة وتسجيل الجرد الفعلي والمرتجع والتالف.' : 'Transfer warehouse stock to machines with physical counts, returns and waste tracking.'}</p>
        </div>
        <select value={selectedMachineId} onChange={e => setSelectedMachineId(e.target.value)} className={`${inputClass} lg:w-80`}>
          <option value="">{isRTL ? 'اختر الماكينة' : 'Select machine'}</option>
          {machines.map(machine => <option key={machine.id} value={machine.id}>#{machine.machineNumber} — {machine.machineType}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Metric icon={Store} label={isRTL ? 'وحدات داخل الماكينات' : 'Units in Machines'} value={summary.totalUnitsInMachines} />
        <Metric icon={Truck} label={isRTL ? 'ماكينات بها مخزون' : 'Machines Stocked'} value={summary.machinesWithStock} />
        <Metric icon={PackagePlus} label={isRTL ? 'منتجات موزعة' : 'Products Stocked'} value={summary.stockedProductCount} />
        <Metric icon={ClipboardCheck} label={isRTL ? 'زيارات مفتوحة' : 'Open Visits'} value={summary.openVisitCount} />
        <Metric icon={Scale} label={isRTL ? 'إجمالي الحركات' : 'Movements'} value={summary.movementCount} />
      </div>

      {selectedMachine && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <div className="text-sm font-bold text-slate-100">{isRTL ? 'الماكينة' : 'Machine'} #{selectedMachine.machineNumber}</div>
            <div className="text-xs text-slate-400 mt-1">{selectedMachine.machineType} · {selectedMachine.serialNumber || 'No serial'}</div>
            <div className="text-[11px] mt-2">{openVisit ? <span className="text-emerald-400">{isRTL ? `زيارة مفتوحة: ${openVisit.id}` : `Open visit: ${openVisit.id}`}</span> : <span className="text-slate-500">{isRTL ? 'لا توجد زيارة مفتوحة' : 'No open visit'}</span>}</div>
          </div>
          {canManageInventory && (
            <div className="flex flex-wrap gap-2">
              {!openVisit ? (
                <Button size="sm" variant="primary" onClick={() => setStartOpen(true)}>{isRTL ? 'بدء زيارة' : 'Start Visit'}</Button>
              ) : (
                <>
                  <Button size="sm" variant="secondary" onClick={() => setCountOpen(true)}>{isRTL ? 'تسجيل جرد' : 'Count'}</Button>
                  <Button size="sm" variant="primary" onClick={() => setRefillOpen(true)}>{isRTL ? 'تعبئة' : 'Refill'}</Button>
                  <Button size="sm" variant="secondary" onClick={() => setReturnOpen(true)}>{isRTL ? 'مرتجع' : 'Return'}</Button>
                  <Button size="sm" variant="secondary" onClick={() => setWasteOpen(true)}>{isRTL ? 'تالف' : 'Waste'}</Button>
                  <Button size="sm" variant="primary" onClick={completeVisit}>{isRTL ? 'إنهاء الزيارة' : 'Complete Visit'}</Button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div>
        <h3 className="text-sm font-bold text-slate-200 mb-3">{isRTL ? 'الرصيد الحالي داخل الماكينة' : 'Current Machine Stock'}</h3>
        <DataTable columns={stockColumns} data={records} isLoading={loading} searchPlaceholder={isRTL ? 'بحث في منتجات الماكينة...' : 'Search machine products...'} />
      </div>

      <div>
        <h3 className="text-sm font-bold text-slate-200 mb-3">{isRTL ? 'سجل الحركات' : 'Movement Ledger'}</h3>
        <DataTable columns={movementColumns} data={movements} isLoading={loading} searchPlaceholder={isRTL ? 'بحث في الحركات...' : 'Search movements...'} />
      </div>

      <Modal isOpen={startOpen} onClose={() => setStartOpen(false)} title={isRTL ? 'بدء زيارة جرد وتعبئة' : 'Start Count / Refill Visit'}>
        <form onSubmit={startVisit} className="space-y-4"><Field label={isRTL ? 'ملاحظات الزيارة' : 'Visit Notes'}><textarea value={startNotes} onChange={e => setStartNotes(e.target.value)} className={inputClass} rows={3} /></Field><SubmitRow onCancel={() => setStartOpen(false)} loading={submitting} isRTL={isRTL} submitLabel={isRTL ? 'بدء الزيارة' : 'Start Visit'} /></form>
      </Modal>

      <Modal isOpen={countOpen} onClose={() => setCountOpen(false)} title={isRTL ? 'تسجيل الجرد الفعلي' : 'Record Physical Count'}>
        <form onSubmit={submitCount} className="space-y-3"><ProductSelect products={products} value={countDraft.productId} onChange={value => setCountDraft({ ...countDraft, productId: value })} isRTL={isRTL} /><NumberField label={isRTL ? 'الكمية الفعلية الموجودة' : 'Counted Quantity'} value={countDraft.countedQuantity} onChange={value => setCountDraft({ ...countDraft, countedQuantity: value })} /><Field label={isRTL ? 'سبب فرق الجرد / مرجع الزيارة' : 'Count Reason / Reference'}><input value={countDraft.reason} onChange={e => setCountDraft({ ...countDraft, reason: e.target.value })} className={inputClass} /></Field><Field label={isRTL ? 'ملاحظات' : 'Notes'}><input value={countDraft.notes} onChange={e => setCountDraft({ ...countDraft, notes: e.target.value })} className={inputClass} /></Field><SubmitRow onCancel={() => setCountOpen(false)} loading={submitting} isRTL={isRTL} submitLabel={isRTL ? 'حفظ الجرد' : 'Save Count'} /></form>
      </Modal>

      <Modal isOpen={refillOpen} onClose={() => setRefillOpen(false)} title={isRTL ? 'تعبئة الماكينة من المخزن' : 'Refill Machine from Warehouse'}>
        <form onSubmit={submitRefill} className="space-y-3"><Field label={isRTL ? 'دفعة المخزن *' : 'Warehouse Batch *'}><select required value={refillDraft.batchId} onChange={e => setRefillDraft({ ...refillDraft, batchId: e.target.value })} className={inputClass}><option value="">{isRTL ? 'اختر الدفعة' : 'Select batch'}</option>{eligibleBatches.map(batch => { const product = batch.product || productMap.get(batch.productId); return <option key={batch.id} value={batch.id}>{product?.sku} — {isRTL ? (product?.nameAr || product?.name) : (product?.name || product?.nameAr)} — LOT {batch.lotNumber} — QTY {batch.quantityOnHand}</option>; })}</select></Field><NumberField label={isRTL ? 'كمية التعبئة *' : 'Refill Quantity *'} value={refillDraft.quantity} onChange={value => setRefillDraft({ ...refillDraft, quantity: value })} min={1} /><Field label={isRTL ? 'الجرد قبل التعبئة (اختياري)' : 'Count Before Refill (optional)'}><input type="number" min="0" value={refillDraft.countedBefore} onChange={e => setRefillDraft({ ...refillDraft, countedBefore: e.target.value })} className={inputClass} /></Field><Field label={isRTL ? 'ملاحظات' : 'Notes'}><input value={refillDraft.notes} onChange={e => setRefillDraft({ ...refillDraft, notes: e.target.value })} className={inputClass} /></Field><SubmitRow onCancel={() => setRefillOpen(false)} loading={submitting} isRTL={isRTL} submitLabel={isRTL ? 'تنفيذ التعبئة' : 'Refill'} /></form>
      </Modal>

      <Modal isOpen={returnOpen} onClose={() => setReturnOpen(false)} title={isRTL ? 'إرجاع بضاعة إلى المخزن' : 'Return Stock to Warehouse'}>
        <form onSubmit={submitReturn} className="space-y-3"><ProductSelect products={products} value={returnDraft.productId} onChange={value => setReturnDraft({ ...returnDraft, productId: value, batchId: '' })} isRTL={isRTL} /><Field label={isRTL ? 'الدفعة المستهدفة *' : 'Target Warehouse Batch *'}><select required value={returnDraft.batchId} onChange={e => setReturnDraft({ ...returnDraft, batchId: e.target.value })} className={inputClass}><option value="">{isRTL ? 'اختر الدفعة' : 'Select batch'}</option>{returnBatches.map(batch => <option key={batch.id} value={batch.id}>LOT {batch.lotNumber} — {batch.expiryDate || 'No expiry'}</option>)}</select></Field><NumberField label={isRTL ? 'الكمية *' : 'Quantity *'} value={returnDraft.quantity} onChange={value => setReturnDraft({ ...returnDraft, quantity: value })} min={1} /><Field label={isRTL ? 'السبب' : 'Reason'}><input value={returnDraft.reason} onChange={e => setReturnDraft({ ...returnDraft, reason: e.target.value })} className={inputClass} /></Field><Field label={isRTL ? 'ملاحظات' : 'Notes'}><input value={returnDraft.notes} onChange={e => setReturnDraft({ ...returnDraft, notes: e.target.value })} className={inputClass} /></Field><SubmitRow onCancel={() => setReturnOpen(false)} loading={submitting} isRTL={isRTL} submitLabel={isRTL ? 'تسجيل المرتجع' : 'Return Stock'} /></form>
      </Modal>

      <Modal isOpen={wasteOpen} onClose={() => setWasteOpen(false)} title={isRTL ? 'تسجيل تالف بالماكينة' : 'Record Machine Waste'}>
        <form onSubmit={submitWaste} className="space-y-3"><ProductSelect products={products} value={wasteDraft.productId} onChange={value => setWasteDraft({ ...wasteDraft, productId: value })} isRTL={isRTL} /><NumberField label={isRTL ? 'الكمية التالفة *' : 'Waste Quantity *'} value={wasteDraft.quantity} onChange={value => setWasteDraft({ ...wasteDraft, quantity: value })} min={1} /><Field label={isRTL ? 'سبب التالف *' : 'Waste Reason *'}><input required value={wasteDraft.reason} onChange={e => setWasteDraft({ ...wasteDraft, reason: e.target.value })} className={inputClass} /></Field><Field label={isRTL ? 'ملاحظات' : 'Notes'}><input value={wasteDraft.notes} onChange={e => setWasteDraft({ ...wasteDraft, notes: e.target.value })} className={inputClass} /></Field><SubmitRow onCancel={() => setWasteOpen(false)} loading={submitting} isRTL={isRTL} submitLabel={isRTL ? 'تسجيل التالف' : 'Record Waste'} /></form>
      </Modal>
    </div>
  );
};

const Metric: React.FC<{ icon: any; label: string; value: number }> = ({ icon: Icon, label, value }) => <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"><div className="flex items-center gap-2 text-slate-400"><Icon className="w-4 h-4" /><span className="text-[10px]">{label}</span></div><div className="text-xl font-bold text-slate-100 mt-2">{value}</div></div>;
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <div><label className="block text-xs font-semibold text-slate-300 mb-1">{label}</label>{children}</div>;
const NumberField: React.FC<{ label: string; value: number; onChange: (value: number) => void; min?: number }> = ({ label, value, onChange, min = 0 }) => <Field label={label}><input type="number" min={min} step="1" value={value} onChange={e => onChange(Number(e.target.value))} className={inputClass} /></Field>;
const ProductSelect: React.FC<{ products: CommercialProduct[]; value: string; onChange: (value: string) => void; isRTL: boolean }> = ({ products, value, onChange, isRTL }) => <Field label={isRTL ? 'المنتج *' : 'Product *'}><select required value={value} onChange={e => onChange(e.target.value)} className={inputClass}><option value="">{isRTL ? 'اختر المنتج' : 'Select product'}</option>{products.map(product => <option key={product.id} value={product.id}>{product.sku} — {isRTL ? (product.nameAr || product.name) : (product.name || product.nameAr)}</option>)}</select></Field>;
const SubmitRow: React.FC<{ onCancel: () => void; loading: boolean; isRTL: boolean; submitLabel: string }> = ({ onCancel, loading, isRTL, submitLabel }) => <div className="flex justify-end gap-2 pt-2"><Button type="button" size="sm" variant="secondary" onClick={onCancel}>{isRTL ? 'إلغاء' : 'Cancel'}</Button><Button type="submit" size="sm" variant="primary" isLoading={loading}>{submitLabel}</Button></div>;

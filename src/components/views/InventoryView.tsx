import React, { useState, useEffect } from 'react';
import {
  Boxes,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
  Trash2,
  Package,
  Calendar,
  DollarSign,
  AlertTriangle
} from 'lucide-react';
import { DataTable, Column } from '../common/DataTable';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { useLanguage } from '../../context/LanguageContext';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { InventoryTransaction, TransactionType, NavigationTab, SparePart } from '../../types';
import { api } from '../../services/api';

interface InventoryViewProps {
  onNavigate: (tab: NavigationTab, id?: string) => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({ onNavigate }) => {
  const { t, formatDate, language } = useLanguage();
  const { showToast } = useNotification();
  const { canManageInventory } = useAuth();

  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [spareParts, setSpareParts] = useState<SparePart[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Post Transaction Modal
  const [isPostOpen, setIsPostOpen] = useState(false);
  const [partId, setPartId] = useState('');
  const [txType, setTxType] = useState<TransactionType>('RECEIVE');
  const [quantity, setQuantity] = useState(10);
  const [unitCost, setUnitCost] = useState(45);
  const [referenceNumber, setReferenceNumber] = useState('PO-2026-088');
  const [notes, setNotes] = useState('Supplier stock replenishment delivery');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAr = language === 'ar';

  const loadData = async (showLoading = true) => {
    try {
      if (showLoading) setIsLoading(true);
      const [txData, partsData] = await Promise.all([
        api.getInventoryTransactions(),
        api.getSpareParts(true)
      ]);
      setTransactions(txData);
      setSpareParts(partsData);
      if (!partId && partsData.length > 0) {
        setPartId(partsData[0].id);
        setUnitCost(partsData[0].unitCost);
      }
    } catch {
      if (showLoading) {
        showToast(t('error'), 'Failed to load inventory transactions', 'error');
      }
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData(true);

    let debounceTimer: any = null;
    const handleUpdate = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadData(false);
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

  const selectedPart = spareParts.find(p => p.id === partId);
  const projectedBalance = selectedPart ? (
    txType === 'RECEIVE' || txType === 'RETURN'
      ? selectedPart.currentQuantity + quantity
      : selectedPart.currentQuantity - quantity
  ) : 0;

  const handlePostTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partId) return;

    setIsSubmitting(true);
    try {
      await api.adjustInventory({
        sparePartId: partId,
        transactionType: txType,
        quantity: Number(quantity),
        unitCost: Number(unitCost),
        referenceNumber,
        notes
      });

      showToast(t('success'), `Stock movement logged successfully!`, 'success');
      setIsPostOpen(false);
      await loadData(false);
    } catch (err: any) {
      showToast(t('error'), err.message || 'Failed to post inventory transaction', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: Column<InventoryTransaction>[] = [
    {
      key: 'createdAt',
      header: 'Date & Time',
      sortable: true,
      render: row => (
        <span className="text-xs text-slate-300 font-mono">{formatDate(row.createdAt)}</span>
      )
    },
    {
      key: 'sparePart',
      header: t('spareParts'),
      render: row => {
        const part = row.sparePart || (row as any).part || spareParts.find(p => p.id === (row.sparePartId || (row as any).partId));
        return (
          <div>
            <span className="font-mono font-bold text-slate-100 text-xs">
              {part?.partNumber || (row as any).partNumber || 'SKU'}
            </span>
            <span className="text-[11px] text-slate-400 block truncate max-w-xs">
              {(isAr && part?.nameAr) ? part.nameAr : (part?.name || (row as any).partName || 'Spare Part')}
            </span>
          </div>
        );
      }
    },
    {
      key: 'transactionType',
      header: 'Movement Type',
      sortable: true,
      render: row => {
        const config = {
          RECEIVE: { icon: ArrowDownLeft, color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
          ISSUE: { icon: ArrowUpRight, color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
          RETURN: { icon: RotateCcw, color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
          SCRAP: { icon: Trash2, color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
          ADJUSTMENT: { icon: Boxes, color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' }
        };
        const item = config[row.transactionType] || config.ADJUSTMENT;
        const Icon = item.icon;

        return (
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border font-mono ${item.color}`}>
            <Icon className="w-3 h-3" />
            <span>{row.transactionType}</span>
          </span>
        );
      }
    },
    {
      key: 'quantity',
      header: t('stockQuantity'),
      sortable: true,
      render: row => (
        <span
          className={`font-mono font-bold text-xs ${
            row.transactionType === 'RECEIVE' || row.transactionType === 'RETURN'
              ? 'text-emerald-400'
              : 'text-rose-400'
          }`}
        >
          {row.transactionType === 'RECEIVE' || row.transactionType === 'RETURN' ? '+' : '-'}
          {row.quantity} units
        </span>
      )
    },
    {
      key: 'unitCost',
      header: t('unitCost'),
      render: row => (
        <span className="font-mono text-xs text-slate-300">
          ${row.unitCost ? row.unitCost.toFixed(2) : '0.00'}
        </span>
      )
    },
    {
      key: 'referenceNumber',
      header: 'Reference / PO',
      render: row => (
        <div>
          <span className="font-mono text-xs text-slate-300">{row.referenceNumber || 'N/A'}</span>
          {row.notes && <span className="text-[10px] text-slate-500 block truncate max-w-xs">{row.notes}</span>}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100">{t('inventory')} Ledger</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Immutable transaction ledger: Receiving, Field Issuance, Returns, and Scraps
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={Package}
            onClick={() => onNavigate('spare-parts')}
          >
            {t('spareParts')} Catalog
          </Button>

          {canManageInventory && (
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => setIsPostOpen(true)}
            >
              Post Stock Movement
            </Button>
          )}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={transactions}
        isLoading={isLoading}
        searchPlaceholder="Search inventory movements..."
      />

      {/* Post Transaction Modal */}
      <Modal
        isOpen={isPostOpen}
        onClose={() => setIsPostOpen(false)}
        title="Post Inventory Transaction"
        subtitle="Record warehouse stock movement into the immutable ledger"
        maxWidth="lg"
      >
        <form onSubmit={handlePostTransaction} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Target Spare Part SKU *
              </label>
              <select
                value={partId}
                onChange={e => {
                  setPartId(e.target.value);
                  const p = spareParts.find(x => x.id === e.target.value);
                  if (p) setUnitCost(p.unitCost);
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              >
                {spareParts.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.partNumber} - {p.name} (Stock: {p.currentQuantity})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Movement Type *
              </label>
              <select
                value={txType}
                onChange={e => setTxType(e.target.value as TransactionType)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="RECEIVE">RECEIVE (Inbound from Supplier)</option>
                <option value="ISSUE">ISSUE (Outbound to Field Technician)</option>
                <option value="RETURN">RETURN (Inbound unused from Field)</option>
                <option value="SCRAP">SCRAP (Outbound Damaged / Defective)</option>
                <option value="ADJUSTMENT">AUDIT ADJUSTMENT (Physical Stock Count)</option>
              </select>
            </div>
          </div>

          {/* Stock Projection Alert */}
          {selectedPart && (
            <div className={`p-3 rounded-lg border text-xs ${
              projectedBalance < 0
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-slate-950 border-slate-800 text-slate-300'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Current Available Balance:</span>
                <span className="font-mono font-bold text-slate-200">{selectedPart.currentQuantity} units</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-slate-400">Projected Balance After Transaction:</span>
                <span className={`font-mono font-bold ${projectedBalance < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {projectedBalance} units
                </span>
              </div>
              {projectedBalance < 0 && (
                <div className="flex items-center gap-1.5 text-rose-400 mt-2 text-[11px] font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Negative inventory is strictly prevented. Outbound quantity cannot exceed current stock.</span>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Quantity *
              </label>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={e => setQuantity(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Unit Cost ($)
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={unitCost}
                onChange={e => setUnitCost(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                PO / Doc Reference #
              </label>
              <input
                type="text"
                placeholder="PO-2026-001"
                value={referenceNumber}
                onChange={e => setReferenceNumber(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Audit Notes / Supplier Delivery Slip
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsPostOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting}>
              Post Ledger Entry
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

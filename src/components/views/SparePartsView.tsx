import React, { useState, useEffect } from 'react';
import {
  Package,
  Plus,
  AlertTriangle,
  Boxes,
  DollarSign,
  Truck,
  Layers,
  ArrowRight,
  TrendingDown,
  Edit2,
  Trash2,
  Power
} from 'lucide-react';
import { DataTable, Column } from '../common/DataTable';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { ConfirmActionModal } from '../common/ConfirmActionModal';
import { useLanguage } from '../../context/LanguageContext';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { SparePart, NavigationTab } from '../../types';
import { api } from '../../services/api';

interface SparePartsViewProps {
  onNavigate: (tab: NavigationTab, id?: string) => void;
}

export const SparePartsView: React.FC<SparePartsViewProps> = ({ onNavigate }) => {
  const { t, formatCurrency, language } = useLanguage();
  const { showToast } = useNotification();
  const { canManageInventory, isAdmin } = useAuth();

  const [parts, setParts] = useState<SparePart[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Add Part Modal
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [partNumber, setPartNumber] = useState('');
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [category, setCategory] = useState('REFRIGERATION');
  const [unitCost, setUnitCost] = useState(45);
  const [minQuantity, setMinQuantity] = useState(3);
  const [initialQty, setInitialQty] = useState(10);
  const [storageLocation, setStorageLocation] = useState('Central Warehouse Rack A-01');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Part Modal
  const [editingPart, setEditingPart] = useState<SparePart | null>(null);

  // Confirm Action Modal
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

  const isAr = language === 'ar';

  const loadParts = async (showLoading = true) => {
    try {
      if (showLoading) setIsLoading(true);
      const data = await api.getSpareParts();
      if (Array.isArray(data)) {
        setParts(data);
      }
    } catch {
      if (showLoading) {
        showToast(t('error'), 'Failed to load spare parts', 'error');
      }
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  useEffect(() => {
    loadParts(true);

    let debounceTimer: any = null;
    const handleUpdate = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadParts(false);
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

  const handleCreatePart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partNumber.trim() || !name.trim()) return;

    setIsSubmitting(true);
    try {
      const created = await api.createSparePart({
        partNumber: partNumber.trim(),
        name: name.trim(),
        nameAr: nameAr.trim(),
        category,
        unitCost: Number(unitCost),
        minimumQuantity: Number(minQuantity),
        currentQuantity: Number(initialQty),
        storageLocation
      });

      showToast(t('success'), `Spare Part SKU ${created.partNumber} created!`, 'success');
      setIsAddOpen(false);
      setPartNumber('');
      setName('');
      setNameAr('');
      await loadParts();
    } catch (err: any) {
      showToast(t('error'), err.message || 'Failed to create part', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdatePart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPart) return;

    setIsSubmitting(true);
    try {
      const updated = await api.updateSparePart(editingPart.id, {
        partNumber: editingPart.partNumber,
        name: editingPart.name,
        nameAr: editingPart.nameAr,
        category: editingPart.category,
        unitCost: Number(editingPart.unitCost),
        minimumQuantity: Number(editingPart.minimumQuantity),
        storageLocation: editingPart.storageLocation
      });

      showToast(t('success'), `Spare Part ${updated.partNumber} updated!`, 'success');
      setEditingPart(null);
      await loadParts();
    } catch (err: any) {
      showToast(t('error'), err.message || 'Failed to update part', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePromptToggleActive = async (part: SparePart) => {
    if (part.isActive === false) {
      try {
        await api.reactivateSparePart(part.id);
        showToast(t('success'), `Spare Part ${part.partNumber} reactivated!`, 'success');
        await loadParts();
      } catch (err: any) {
        showToast(t('error'), err.message || 'Failed to reactivate part', 'error');
      }
    } else {
      setConfirmModal({
        isOpen: true,
        title: `Deactivate Part SKU: ${part.partNumber}`,
        description: `Are you sure you want to deactivate ${part.name}? Deactivated parts cannot be selected in new maintenance tickets or requisitions.`,
        requireReason: true,
        isDeactivation: true,
        onConfirm: async (reason?: string) => {
          await api.deactivateSparePart(part.id, reason);
          showToast(t('success'), `Spare Part ${part.partNumber} deactivated!`, 'success');
          await loadParts();
        }
      });
    }
  };

  const handlePromptDeletePart = async (part: SparePart) => {
    setConfirmModal({
      isOpen: true,
      title: isAr ? `حذف قطعة الغيار: ${part.partNumber}` : `Delete Spare Part SKU: ${part.partNumber}`,
      description: isAr
        ? `هل أنت متأكد من رغبتك في حذف قطعة الغيار "${part.nameAr || part.name}" (${part.partNumber}) نهائياً من قاعدة البيانات؟`
        : `Are you sure you want to permanently delete part "${part.name}" (${part.partNumber}) from the database?`,
      warningMessage: isAr ? 'سيتم حذف القطعة فوراً من قائمة قطع الغيار.' : 'This will permanently remove the spare part from inventory.',
      requireReason: false,
      isDeactivation: false,
      onConfirm: async (reason?: string) => {
        try {
          await api.deleteSparePart(part.id, true, reason);
          showToast(t('success'), isAr ? `تم حذف قطعة الغيار ${part.partNumber} بنجاح!` : `Spare Part ${part.partNumber} deleted!`, 'success');
          await loadParts();
        } catch (err: any) {
          showToast(t('error'), err.message || 'Failed to delete part', 'error');
        }
      }
    });
  };

  const categoriesList = React.useMemo(() => {
    const defaultCats = [
      { id: 'ALL', label: isAr ? 'جميع الفئات' : 'All Categories' },
      { id: 'REFRIGERATION', label: isAr ? 'التبريد والتكييف' : 'Refrigeration & Cooling' },
      { id: 'PAYMENT', label: isAr ? 'أنظمة الدفع والحساسات' : 'Payment & Validation' },
      { id: 'ELECTRICAL', label: isAr ? 'الكهرباء والطاقة' : 'Electrical & Power' },
      { id: 'BEVERAGE_SYSTEM', label: isAr ? 'أنظمة المشروبات والقهوة' : 'Beverage & Coffee' },
      { id: 'DISPENSING', label: isAr ? 'محركات واليات الصرف' : 'Dispensing Mechanics' },
      { id: 'GENERAL', label: isAr ? 'عام ومستهلكات' : 'General & Consumables' },
    ];
    
    // Add any unique categories found in parts
    const seen = new Set(defaultCats.map(c => c.id.toUpperCase()));
    parts.forEach(p => {
      const catKey = typeof p.category === 'object' && p.category !== null
        ? ((p.category as any).name || (p.category as any).id)
        : p.category;
      if (catKey && !seen.has(String(catKey).toUpperCase())) {
        seen.add(String(catKey).toUpperCase());
        defaultCats.push({
          id: String(catKey),
          label: String(catKey)
        });
      }
    });
    return defaultCats;
  }, [parts, isAr]);

  const filteredParts = parts.filter(p => {
    if (categoryFilter !== 'ALL') {
      const catKey = typeof p.category === 'object' && p.category !== null
        ? ((p.category as any).name || (p.category as any).id || (p.category as any).slug)
        : String(p.category || '');
      const catId = p.categoryId || '';
      
      const filterUpper = categoryFilter.toUpperCase();
      const matchCat = catKey?.toUpperCase() === filterUpper || catId?.toUpperCase() === filterUpper;
      if (!matchCat) return false;
    }
    return true;
  });

  const columns: Column<SparePart>[] = [
    {
      key: 'partNumber',
      header: t('partNumber'),
      sortable: true,
      render: row => (
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-slate-100 text-xs">{row.partNumber}</span>
            {row.isActive === false && (
              <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 text-[9px] font-bold border border-amber-500/30">
                DEACTIVATED
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-400 block font-mono">{row.storageLocation}</span>
        </div>
      )
    },
    {
      key: 'name',
      header: t('partName'),
      sortable: true,
      render: row => {
        const catLabel = typeof row.category === 'object' && row.category !== null
          ? ((isAr && (row.category as any).nameAr) ? (row.category as any).nameAr : ((row.category as any).name || (row.category as any).id))
          : String(row.category || '');
        return (
          <div>
            <div className="font-semibold text-slate-200 text-xs">
              {isAr && row.nameAr ? row.nameAr : row.name}
            </div>
            <span className="text-[11px] text-slate-400">{catLabel}</span>
          </div>
        );
      }
    },
    {
      key: 'currentQuantity',
      header: t('stockQuantity'),
      sortable: true,
      render: row => {
        const isLow = row.currentQuantity <= row.minimumQuantity;
        return (
          <div className="flex items-center gap-2">
            <span
              className={`font-mono font-bold text-xs px-2.5 py-0.5 rounded-full border ${
                isLow
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              }`}
            >
              {row.currentQuantity} in stock
            </span>
            {isLow && (
              <span className="text-[10px] text-rose-400 font-medium">
                (Min: {row.minimumQuantity})
              </span>
            )}
          </div>
        );
      }
    },
    {
      key: 'unitCost',
      header: t('unitCost'),
      sortable: true,
      render: row => (
        <span className="font-mono text-xs text-slate-200">${row.unitCost.toFixed(2)}</span>
      )
    },
    {
      key: 'totalValue',
      header: 'Total Value',
      render: row => (
        <span className="font-mono font-bold text-xs text-emerald-400">
          ${(row.currentQuantity * row.unitCost).toFixed(2)}
        </span>
      )
    },
    {
      key: 'actions',
      header: t('actions'),
      className: 'text-right rtl:text-left',
      render: row => {
        if (!canManageInventory) return null;
        return (
          <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setEditingPart({ ...row })}
              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors cursor-pointer"
              title="Edit Part Details"
            >
              <Edit2 className="w-4 h-4" />
            </button>

            <button
              onClick={() => handlePromptToggleActive(row)}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                row.isActive === false ? 'text-amber-400 hover:bg-amber-500/20' : 'text-slate-400 hover:text-amber-400 hover:bg-slate-800'
              }`}
              title={row.isActive === false ? 'Reactivate SKU' : 'Deactivate SKU'}
            >
              <Power className="w-4 h-4" />
            </button>

            <button
              onClick={() => handlePromptDeletePart(row)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
              title="Delete SKU"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      }
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100">{t('spareParts')}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Component SKU catalog, safety stock thresholds, and inventory valuation
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadParts(true)}
            title="Refresh spare parts catalog"
          >
            {isAr ? 'تحديث' : 'Refresh'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            icon={Boxes}
            onClick={() => onNavigate('inventory')}
          >
            {t('inventory')} Ledger
          </Button>

          {canManageInventory && (
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => setIsAddOpen(true)}
            >
              {t('addPart')}
            </Button>
          )}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filteredParts}
        isLoading={isLoading}
        searchPlaceholder={t('searchSpareParts')}
        filterComponent={
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
          >
            {categoriesList.map(c => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        }
      />

      {/* Add Part SKU Modal */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title={t('addPart')}
        subtitle="Catalog a new replacement component or consumable SKU"
        maxWidth="lg"
      >
        <form onSubmit={handleCreatePart} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {t('partNumber')} (SKU) *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. SP-VAL-009"
                value={partNumber}
                onChange={e => setPartNumber(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Category *
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="REFRIGERATION">Refrigeration & Cooling</option>
                <option value="PAYMENT">Payment Systems & Sensors</option>
                <option value="ELECTRICAL">Electrical & Power Supplies</option>
                <option value="BEVERAGE_SYSTEM">Beverage & Coffee Lines</option>
                <option value="DISPENSING">Spirals & Dispense Motors</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Part Name (English) *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Bill Validator Optical Head"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Part Name (Arabic)
              </label>
              <input
                type="text"
                placeholder="مثال: قارئ العملات الورقية"
                value={nameAr}
                onChange={e => setNameAr(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Unit Cost ($) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={unitCost}
                onChange={e => setUnitCost(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Min Safety Stock *
              </label>
              <input
                type="number"
                min="0"
                value={minQuantity}
                onChange={e => setMinQuantity(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Initial Stock Qty *
              </label>
              <input
                type="number"
                min="0"
                value={initialQty}
                onChange={e => setInitialQty(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Storage Bin / Rack Location
            </label>
            <input
              type="text"
              placeholder="Central Warehouse Bin B-04"
              value={storageLocation}
              onChange={e => setStorageLocation(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={isSubmitting}>
              {t('addPart')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Part Modal */}
      {editingPart && (
        <Modal
          isOpen={!!editingPart}
          onClose={() => setEditingPart(null)}
          title={`Edit Spare Part SKU ${editingPart.partNumber}`}
          maxWidth="lg"
        >
          <form onSubmit={handleUpdatePart} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  {t('partNumber')} (SKU) *
                </label>
                <input
                  type="text"
                  required
                  value={editingPart.partNumber}
                  onChange={e => setEditingPart({ ...editingPart, partNumber: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Category *
                </label>
                <select
                  value={typeof editingPart.category === 'object' && editingPart.category !== null ? ((editingPart.category as any).id || (editingPart.category as any).name || 'REFRIGERATION') : (editingPart.category || 'REFRIGERATION')}
                  onChange={e => setEditingPart({ ...editingPart, category: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="REFRIGERATION">Refrigeration & Cooling</option>
                  <option value="PAYMENT">Payment Systems & Sensors</option>
                  <option value="ELECTRICAL">Electrical & Power Supplies</option>
                  <option value="BEVERAGE_SYSTEM">Beverage & Coffee Lines</option>
                  <option value="DISPENSING">Spirals & Dispense Motors</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Part Name (English) *
                </label>
                <input
                  type="text"
                  required
                  value={editingPart.name}
                  onChange={e => setEditingPart({ ...editingPart, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Part Name (Arabic)
                </label>
                <input
                  type="text"
                  value={editingPart.nameAr || ''}
                  onChange={e => setEditingPart({ ...editingPart, nameAr: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Unit Cost ($) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editingPart.unitCost}
                  onChange={e => setEditingPart({ ...editingPart, unitCost: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Min Safety Stock *
                </label>
                <input
                  type="number"
                  min="0"
                  value={editingPart.minimumQuantity}
                  onChange={e => setEditingPart({ ...editingPart, minimumQuantity: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Storage Bin / Rack Location
              </label>
              <input
                type="text"
                value={editingPart.storageLocation || ''}
                onChange={e => setEditingPart({ ...editingPart, storageLocation: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditingPart(null)}>
                {t('cancel')}
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={isSubmitting}>
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}

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

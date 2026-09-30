import React, { useEffect, useMemo, useState } from 'react';
import { Edit2, Package, Plus, Power, Trash2 } from 'lucide-react';
import { DataTable, Column } from '../common/DataTable';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { useLanguage } from '../../context/LanguageContext';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { CommercialProduct, NavigationTab, Supplier } from '../../types';
import { api } from '../../services/api';

interface ProductsViewProps {
  onNavigate: (tab: NavigationTab, id?: string) => void;
}

type ProductDraft = {
  sku: string;
  barcode: string;
  name: string;
  nameAr: string;
  category: string;
  brand: string;
  unit: string;
  purchaseCost: number;
  sellingPrice: number;
  vatPercent: number;
  supplierId: string;
  shelfLifeDays: number;
  minStockLevel: number;
};

const emptyDraft: ProductDraft = {
  sku: '', barcode: '', name: '', nameAr: '', category: '', brand: '', unit: 'EA',
  purchaseCost: 0, sellingPrice: 0, vatPercent: 15, supplierId: '', shelfLifeDays: 0, minStockLevel: 0
};

export const ProductsView: React.FC<ProductsViewProps> = () => {
  const { t, isRTL } = useLanguage();
  const { showToast } = useNotification();
  const { canManageInventory } = useAuth();
  const [products, setProducts] = useState<CommercialProduct[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<CommercialProduct | null>(null);
  const [draft, setDraft] = useState<ProductDraft>({ ...emptyDraft });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [productRows, supplierRows] = await Promise.all([api.getProducts(true), api.getSuppliers(false)]);
      setProducts(productRows);
      setSuppliers(supplierRows);
    } catch (err: any) {
      showToast(t('error'), err?.message || 'Failed to load product master', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const supplierMap = useMemo(() => new Map(suppliers.map(s => [s.id, s.name])), [suppliers]);

  const openCreate = () => {
    setEditing(null);
    setDraft({ ...emptyDraft });
    setIsModalOpen(true);
  };

  const openEdit = (product: CommercialProduct) => {
    setEditing(product);
    setDraft({
      sku: product.sku || '', barcode: product.barcode || '', name: product.name || '', nameAr: product.nameAr || '',
      category: product.category || '', brand: product.brand || '', unit: product.unit || 'EA',
      purchaseCost: Number(product.purchaseCost || 0), sellingPrice: Number(product.sellingPrice || 0),
      vatPercent: Number(product.vatPercent ?? 15), supplierId: product.supplierId || '',
      shelfLifeDays: Number(product.shelfLifeDays || 0), minStockLevel: Number(product.minStockLevel || 0)
    });
    setIsModalOpen(true);
  };

  const saveProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.sku.trim() || (!draft.name.trim() && !draft.nameAr.trim())) return;
    setIsSubmitting(true);
    try {
      if (editing) {
        await api.updateProduct(editing.id, draft);
        showToast(t('success'), isRTL ? 'تم تحديث المنتج بنجاح' : 'Product updated successfully', 'success');
      } else {
        await api.createProduct(draft);
        showToast(t('success'), isRTL ? 'تم تسجيل المنتج بنجاح' : 'Product created successfully', 'success');
      }
      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      showToast(t('error'), err?.message || 'Failed to save product', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleActive = async (product: CommercialProduct) => {
    try {
      if (product.isActive === false) await api.reactivateProduct(product.id);
      else await api.deactivateProduct(product.id);
      await loadData();
    } catch (err: any) {
      showToast(t('error'), err?.message || 'Failed to update product status', 'error');
    }
  };

  const deleteProduct = async (product: CommercialProduct) => {
    const label = isRTL ? (product.nameAr || product.name || product.sku) : (product.name || product.nameAr || product.sku);
    const confirmed = window.confirm(
      isRTL
        ? `حذف المنتج «${label}»؟\n\nسيتم الحذف فقط إذا لم توجد له أي حركة أو دفعة مخزون. إذا وُجد تاريخ مخزون يجب إيقاف المنتج بدلاً من حذفه.`
        : `Delete product “${label}”?\n\nDeletion is allowed only when the product has no inventory batch or movement history. Otherwise deactivate it instead.`
    );
    if (!confirmed) return;

    try {
      await api.deleteProduct(product.id);
      showToast(t('success'), isRTL ? 'تم حذف المنتج بنجاح' : 'Product deleted successfully', 'success');
      await loadData();
    } catch (err: any) {
      const message = String(err?.message || '');
      const hasHistory = message.includes('PRODUCT_HAS_INVENTORY_HISTORY');
      showToast(
        hasHistory ? (isRTL ? 'لا يمكن حذف المنتج' : 'Product cannot be deleted') : t('error'),
        hasHistory
          ? (isRTL ? 'يوجد للمنتج سجل مخزون أو حركات. استخدم إيقاف المنتج للحفاظ على السجل.' : 'This product has inventory history. Deactivate it instead to preserve the ledger.')
          : (message || 'Failed to delete product'),
        hasHistory ? 'warning' : 'error'
      );
    }
  };

  const columns: Column<CommercialProduct>[] = [
    { key: 'sku', header: 'SKU', sortable: true, render: row => (
      <div className="flex items-center gap-3"><Package className="w-4 h-4 text-emerald-400" /><div><div className="font-mono text-xs font-bold text-slate-100">{row.sku}</div><div className="text-[10px] text-slate-500">{row.barcode || 'No barcode'}</div></div></div>
    )},
    { key: 'name', header: isRTL ? 'المنتج' : 'Product', sortable: true, render: row => (
      <div><div className="text-xs font-semibold text-slate-100">{isRTL ? (row.nameAr || row.name) : row.name}</div><div className="text-[10px] text-slate-400">{row.brand || '—'} · {row.category || 'General'}</div></div>
    )},
    { key: 'purchaseCost', header: isRTL ? 'التكلفة' : 'Cost', render: row => <span className="font-mono text-xs">{Number(row.purchaseCost || 0).toFixed(2)}</span> },
    { key: 'sellingPrice', header: isRTL ? 'سعر البيع' : 'Selling Price', render: row => <span className="font-mono text-xs text-emerald-400">{Number(row.sellingPrice || 0).toFixed(2)}</span> },
    { key: 'supplierId', header: isRTL ? 'المورد' : 'Supplier', render: row => <span className="text-xs">{row.supplier?.name || supplierMap.get(row.supplierId || '') || '—'}</span> },
    { key: 'shelfLifeDays', header: isRTL ? 'الصلاحية' : 'Shelf Life', render: row => <span className="text-xs">{row.shelfLifeDays ? `${row.shelfLifeDays} ${isRTL ? 'يوم' : 'days'}` : '—'}</span> },
    { key: 'isActive', header: isRTL ? 'الحالة' : 'Status', render: row => <span className={row.isActive === false ? 'text-amber-400 text-xs' : 'text-emerald-400 text-xs'}>{row.isActive === false ? (isRTL ? 'غير نشط' : 'INACTIVE') : (isRTL ? 'نشط' : 'ACTIVE')}</span> },
    { key: 'actions', header: t('actions'), render: row => canManageInventory ? (
      <div className="flex gap-1"><button onClick={() => openEdit(row)} className="p-1.5 text-slate-400 hover:text-blue-400" title={isRTL ? 'تعديل' : 'Edit'}><Edit2 className="w-4 h-4" /></button><button onClick={() => toggleActive(row)} className="p-1.5 text-slate-400 hover:text-amber-400" title={row.isActive === false ? (isRTL ? 'تنشيط' : 'Reactivate') : (isRTL ? 'إيقاف' : 'Deactivate')}><Power className="w-4 h-4" /></button><button onClick={() => deleteProduct(row)} className="p-1.5 text-slate-400 hover:text-red-400" title={isRTL ? 'حذف' : 'Delete'}><Trash2 className="w-4 h-4" /></button></div>
    ) : null }
  ];

  const inputClass = 'w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div><h2 className="text-xl font-bold text-slate-100">{isRTL ? 'دليل منتجات البيع' : 'Vending Product Master'}</h2><p className="text-xs text-slate-400 mt-1">{isRTL ? 'منتجات البيع منفصلة عن قطع غيار الصيانة.' : 'Commercial vending products, separate from maintenance spare parts.'}</p></div>
        {canManageInventory && <Button variant="primary" size="sm" icon={Plus} onClick={openCreate}>{isRTL ? 'إضافة منتج' : 'Add Product'}</Button>}
      </div>

      <DataTable columns={columns} data={products} isLoading={isLoading} searchPlaceholder={isRTL ? 'بحث بالاسم أو SKU أو الباركود...' : 'Search name, SKU or barcode...'} />

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editing ? (isRTL ? 'تعديل المنتج' : 'Edit Product') : (isRTL ? 'تسجيل منتج جديد' : 'Register Product')} maxWidth="2xl">
        <form onSubmit={saveProduct} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="SKU *"><input required value={draft.sku} onChange={e => setDraft({ ...draft, sku: e.target.value })} className={inputClass} /></Field>
            <Field label={isRTL ? 'الباركود' : 'Barcode'}><input value={draft.barcode} onChange={e => setDraft({ ...draft, barcode: e.target.value })} className={inputClass} /></Field>
            <Field label={isRTL ? 'الاسم العربي *' : 'Arabic Name *'}><input value={draft.nameAr} onChange={e => setDraft({ ...draft, nameAr: e.target.value })} className={inputClass} /></Field>
            <Field label={isRTL ? 'الاسم الإنجليزي' : 'English Name'}><input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} className={inputClass} /></Field>
            <Field label={isRTL ? 'التصنيف' : 'Category'}><input value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} className={inputClass} /></Field>
            <Field label={isRTL ? 'العلامة التجارية' : 'Brand'}><input value={draft.brand} onChange={e => setDraft({ ...draft, brand: e.target.value })} className={inputClass} /></Field>
            <Field label={isRTL ? 'الوحدة' : 'Unit'}><input value={draft.unit} onChange={e => setDraft({ ...draft, unit: e.target.value })} className={inputClass} /></Field>
            <Field label={isRTL ? 'المورد' : 'Supplier'}><select value={draft.supplierId} onChange={e => setDraft({ ...draft, supplierId: e.target.value })} className={inputClass}><option value="">{isRTL ? 'بدون مورد محدد' : 'No supplier selected'}</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <NumberField label={isRTL ? 'تكلفة الشراء' : 'Purchase Cost'} value={draft.purchaseCost} onChange={v => setDraft({ ...draft, purchaseCost: v })} className={inputClass} step="0.01" />
            <NumberField label={isRTL ? 'سعر البيع' : 'Selling Price'} value={draft.sellingPrice} onChange={v => setDraft({ ...draft, sellingPrice: v })} className={inputClass} step="0.01" />
            <NumberField label="VAT %" value={draft.vatPercent} onChange={v => setDraft({ ...draft, vatPercent: v })} className={inputClass} step="0.01" />
            <NumberField label={isRTL ? 'مدة الصلاحية بالأيام' : 'Shelf Life (days)'} value={draft.shelfLifeDays} onChange={v => setDraft({ ...draft, shelfLifeDays: v })} className={inputClass} />
            <NumberField label={isRTL ? 'حد المخزون الأدنى' : 'Minimum Stock Level'} value={draft.minStockLevel} onChange={v => setDraft({ ...draft, minStockLevel: v })} className={inputClass} />
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button><Button type="submit" variant="primary" size="sm" isLoading={isSubmitting}>{isRTL ? 'حفظ المنتج' : 'Save Product'}</Button></div>
        </form>
      </Modal>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <div><label className="text-xs font-semibold text-slate-300 block mb-1">{label}</label>{children}</div>;

const NumberField: React.FC<{ label: string; value: number; onChange: (value: number) => void; className: string; step?: string }> = ({ label, value, onChange, className, step = '1' }) => (
  <Field label={label}><input type="number" min="0" step={step} value={value} onChange={e => onChange(Number(e.target.value))} className={className} /></Field>
);

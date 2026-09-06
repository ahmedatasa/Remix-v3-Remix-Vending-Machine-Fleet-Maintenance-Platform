import React, { useState, useEffect } from 'react';
import {
  Truck,
  Plus,
  Phone,
  Mail,
  Clock,
  Star,
  Building2,
  FileText,
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
import { Supplier, NavigationTab } from '../../types';
import { api } from '../../services/api';

interface SuppliersViewProps {
  onNavigate: (tab: NavigationTab, id?: string) => void;
}

export const SuppliersView: React.FC<SuppliersViewProps> = ({ onNavigate }) => {
  const { t } = useLanguage();
  const { showToast } = useNotification();
  const { canManageInventory, isAdmin } = useAuth();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Add Modal State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('+966-11-');
  const [leadTime, setLeadTime] = useState(3);
  const [terms, setTerms] = useState('Net 30 Days');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Modal State
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

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

  const loadSuppliers = async () => {
    try {
      setIsLoading(true);
      const data = await api.getSuppliers();
      setSuppliers(data);
    } catch {
      // Keep state
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, []);

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      const created = await api.createSupplier({
        name: name.trim(),
        contactName: contactName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        leadTimeDays: Number(leadTime),
        paymentTerms: terms,
        rating: 4.8
      });

      showToast(t('success'), `Supplier ${created.name} added!`, 'success');
      setIsAddOpen(false);
      setName('');
      setContactName('');
      setEmail('');
      await loadSuppliers();
    } catch (err: any) {
      showToast(t('error'), err.message || 'Failed to create supplier', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSupplier) return;

    setIsSubmitting(true);
    try {
      const updated = await api.updateSupplier(editingSupplier.id, {
        name: editingSupplier.name,
        contactName: editingSupplier.contactName,
        email: editingSupplier.email,
        phone: editingSupplier.phone,
        leadTimeDays: Number(editingSupplier.leadTimeDays),
        paymentTerms: editingSupplier.paymentTerms
      });

      showToast(t('success'), `Supplier ${updated.name} updated!`, 'success');
      setEditingSupplier(null);
      await loadSuppliers();
    } catch (err: any) {
      showToast(t('error'), err.message || 'Failed to update supplier', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePromptToggleActive = async (sup: Supplier) => {
    if (sup.isActive === false) {
      try {
        await api.reactivateSupplier(sup.id);
        showToast(t('success'), `Supplier ${sup.name} reactivated!`, 'success');
        await loadSuppliers();
      } catch (err: any) {
        showToast(t('error'), err.message || 'Failed to reactivate supplier', 'error');
      }
    } else {
      setConfirmModal({
        isOpen: true,
        title: `Deactivate Supplier: ${sup.name}`,
        description: `Are you sure you want to deactivate ${sup.name}? Inactive vendors cannot be selected on new purchase orders.`,
        requireReason: true,
        isDeactivation: true,
        onConfirm: async (reason?: string) => {
          await api.deactivateSupplier(sup.id, reason);
          showToast(t('success'), `Supplier ${sup.name} deactivated!`, 'success');
          await loadSuppliers();
        }
      });
    }
  };

  const handlePromptDeleteSupplier = async (sup: Supplier) => {
    const refs = await api.checkSupplierReferences(sup.id);
    setConfirmModal({
      isOpen: true,
      title: `Delete Supplier: ${sup.name}`,
      description: refs.canDelete
        ? `Are you sure you want to delete supplier record ${sup.name}?`
        : `This supplier has active purchase orders or part requests (${refs.referenceCounts.map(r => `${r.count} ${r.label}`).join(', ')}). You cannot delete an active vendor. You can deactivate them instead.`,
      warningMessage: refs.canDelete ? 'This will archive the supplier profile.' : 'Cannot delete supplier with active PO orders.',
      requireReason: true,
      referenceCounts: refs.referenceCounts,
      isDeactivation: !refs.canDelete,
      onConfirm: async (reason?: string) => {
        if (refs.canDelete) {
          await api.deleteSupplier(sup.id, false, reason);
          showToast(t('success'), `Supplier ${sup.name} deleted!`, 'success');
        } else {
          await api.deactivateSupplier(sup.id, reason);
          showToast(t('success'), `Supplier ${sup.name} deactivated!`, 'success');
        }
        await loadSuppliers();
      }
    });
  };

  const columns: Column<Supplier>[] = [
    {
      key: 'name',
      header: t('supplierName'),
      sortable: true,
      render: row => (
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg ${row.isActive === false ? 'bg-slate-800 text-slate-500 border border-slate-700' : 'bg-blue-600/20 text-blue-400'} flex items-center justify-center font-bold text-xs`}>
            <Truck className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-100 text-xs">{row.name}</span>
              {row.isActive === false && (
                <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 text-[9px] font-bold border border-amber-500/30">
                  DEACTIVATED
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400">{row.contactName || 'Procurement Rep'}</div>
          </div>
        </div>
      )
    },
    {
      key: 'email',
      header: 'Contact Info',
      render: row => (
        <div className="space-y-0.5 text-xs">
          <div className="flex items-center gap-1 text-slate-300">
            <Mail className="w-3 h-3 text-slate-500" />
            <span>{row.email}</span>
          </div>
          <div className="flex items-center gap-1 text-slate-400 font-mono text-[11px]">
            <Phone className="w-3 h-3 text-slate-500" />
            <span>{row.phone}</span>
          </div>
        </div>
      )
    },
    {
      key: 'leadTimeDays',
      header: 'Lead Time',
      sortable: true,
      render: row => (
        <div className="flex items-center gap-1 text-xs font-mono text-slate-300">
          <Clock className="w-3.5 h-3.5 text-blue-400" />
          <span>{row.leadTimeDays} Days Avg</span>
        </div>
      )
    },
    {
      key: 'paymentTerms',
      header: 'Payment Terms',
      render: row => (
        <span className="text-xs px-2.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono">
          {row.paymentTerms}
        </span>
      )
    },
    {
      key: 'rating',
      header: 'Vendor Rating',
      render: row => (
        <div className="flex items-center gap-1 text-amber-400 font-mono text-xs font-bold">
          <Star className="w-3.5 h-3.5 fill-amber-400" />
          <span>{row.rating || 4.5} / 5.0</span>
        </div>
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
              onClick={() => setEditingSupplier({ ...row })}
              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors cursor-pointer"
              title="Edit Supplier Details"
            >
              <Edit2 className="w-4 h-4" />
            </button>

            <button
              onClick={() => handlePromptToggleActive(row)}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                row.isActive === false ? 'text-amber-400 hover:bg-amber-500/20' : 'text-slate-400 hover:text-amber-400 hover:bg-slate-800'
              }`}
              title={row.isActive === false ? 'Reactivate Supplier' : 'Deactivate Supplier'}
            >
              <Power className="w-4 h-4" />
            </button>

            <button
              onClick={() => handlePromptDeleteSupplier(row)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
              title="Delete Supplier"
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
          <h2 className="text-xl font-bold text-slate-100">{t('suppliers')}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Approved OEM hardware vendors, component suppliers, and SLA terms
          </p>
        </div>

        {canManageInventory && (
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => setIsAddOpen(true)}
          >
            Add Supplier
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={suppliers}
        isLoading={isLoading}
        searchPlaceholder="Search suppliers..."
      />

      {/* Add Supplier Modal */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Add Hardware Supplier"
        subtitle="Register verified OEM component vendor into procurement roster"
        maxWidth="md"
      >
        <form onSubmit={handleCreateSupplier} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Supplier / Company Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Crane Vending Parts International"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Contact Person
              </label>
              <input
                type="text"
                placeholder="Account Manager Name"
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Email Address *
              </label>
              <input
                type="email"
                required
                placeholder="sales@vendor.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Phone Number
              </label>
              <input
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Lead Time (Days)
              </label>
              <input
                type="number"
                min={1}
                value={leadTime}
                onChange={e => setLeadTime(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Payment Terms
            </label>
            <input
              type="text"
              value={terms}
              onChange={e => setTerms(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={isSubmitting}>
              Save Supplier
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Supplier Modal */}
      {editingSupplier && (
        <Modal
          isOpen={!!editingSupplier}
          onClose={() => setEditingSupplier(null)}
          title={`Edit Supplier ${editingSupplier.name}`}
          maxWidth="md"
        >
          <form onSubmit={handleUpdateSupplier} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Supplier / Company Name *
              </label>
              <input
                type="text"
                required
                value={editingSupplier.name}
                onChange={e => setEditingSupplier({ ...editingSupplier, name: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Contact Person
                </label>
                <input
                  type="text"
                  value={editingSupplier.contactName || ''}
                  onChange={e => setEditingSupplier({ ...editingSupplier, contactName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={editingSupplier.email}
                  onChange={e => setEditingSupplier({ ...editingSupplier, email: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={editingSupplier.phone || ''}
                  onChange={e => setEditingSupplier({ ...editingSupplier, phone: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Lead Time (Days)
                </label>
                <input
                  type="number"
                  min={1}
                  value={editingSupplier.leadTimeDays || 3}
                  onChange={e => setEditingSupplier({ ...editingSupplier, leadTimeDays: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Payment Terms
              </label>
              <input
                type="text"
                value={editingSupplier.paymentTerms || ''}
                onChange={e => setEditingSupplier({ ...editingSupplier, paymentTerms: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditingSupplier(null)}>
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

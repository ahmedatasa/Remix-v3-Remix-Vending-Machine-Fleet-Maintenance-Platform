import React, { useState, useEffect } from 'react';
import { MapPin, Building2, Layers, Cpu, Search, Plus, ExternalLink, Edit2, Trash2 } from 'lucide-react';
import { DataTable, Column } from '../common/DataTable';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { ConfirmActionModal } from '../common/ConfirmActionModal';
import { useLanguage } from '../../context/LanguageContext';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { Location, Building, Floor, Machine, NavigationTab } from '../../types';
import { api } from '../../services/api';

interface LocationsViewProps {
  onNavigate: (tab: NavigationTab, id?: string) => void;
}

export const LocationsView: React.FC<LocationsViewProps> = ({ onNavigate }) => {
  const { t, language } = useLanguage();
  const { showToast } = useNotification();
  const { canEditMachines, canDeleteRecord } = useAuth();

  const [locations, setLocations] = useState<Location[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Add Location Modal
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [bldId, setBldId] = useState('');
  const [floorId, setFloorId] = useState('');
  const [areaZone, setAreaZone] = useState('');
  const [areaZoneAr, setAreaZoneAr] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Location Modal
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);

  // Confirmation Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    warningMessage?: string;
    requireReason?: boolean;
    referenceCounts?: Array<{ label: string; count: number }>;
    onConfirm: (reason?: string) => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: async () => {}
  });

  const isAr = language === 'ar';

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [lData, bData, fData, mData] = await Promise.all([
        api.getLocations(true),
        api.getBuildings(true),
        api.getFloors(),
        api.getMachines()
      ]);
      const validLocs = Array.isArray(lData) ? lData : [];
      const validBlds = Array.isArray(bData) ? bData : [];
      const validFlrs = Array.isArray(fData) ? fData : [];
      const validMchs = Array.isArray(mData) ? mData : [];

      setLocations(validLocs);
      setBuildings(validBlds);
      setFloors(validFlrs);
      setMachines(validMchs);

      if (validBlds.length > 0 && !bldId) {
        setBldId(validBlds[0].id);
      }
      if (validFlrs.length > 0 && !floorId) {
        setFloorId(validFlrs[0].id);
      }
    } catch {
      // Keep state
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const handleUpdate = () => {
      loadData();
    };
    window.addEventListener('vending-fleet-data-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('vending-fleet-data-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!areaZone.trim()) return;

    setIsSubmitting(true);
    try {
      const created = await api.createLocation({
        buildingId: bldId,
        floorId,
        areaZone: areaZone.trim(),
        areaZoneAr: areaZoneAr.trim()
      });
      showToast(t('success'), `Location ${created.areaZone} added!`, 'success');
      setIsAddOpen(false);
      setAreaZone('');
      setAreaZoneAr('');
      await loadData();
    } catch (err: any) {
      showToast(t('error'), err.message || 'Failed to create location', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLocation) return;

    try {
      const updated = await api.updateLocation(editingLocation.id, {
        areaZone: editingLocation.areaZone,
        areaZoneAr: editingLocation.areaZoneAr,
        buildingId: editingLocation.buildingId,
        floorId: editingLocation.floorId
      });
      showToast(t('success'), `Location ${updated.areaZone} updated!`, 'success');
      setEditingLocation(null);
      await loadData();
    } catch (err: any) {
      showToast(t('error'), err.message || 'Failed to update location', 'error');
    }
  };

  const handlePromptDelete = async (loc: Location) => {
    const refs = await api.checkLocationReferences(loc.id);
    setConfirmModal({
      isOpen: true,
      title: `Delete Location Zone: ${loc.areaZone}`,
      description: refs.canDelete
        ? `Are you sure you want to permanently remove this location zone?`
        : `This location has active dependencies (${refs.referenceCounts.map(r => `${r.count} ${r.label}`).join(', ')}).`,
      warningMessage: refs.canDelete ? undefined : 'Machines located in this zone must be relocated first.',
      requireReason: true,
      referenceCounts: refs.referenceCounts,
      onConfirm: async (reason?: string) => {
        await api.deleteLocation(loc.id, false, reason);
        showToast(t('success'), `Location ${loc.areaZone} deleted!`, 'success');
        await loadData();
      }
    });
  };

  const columns: Column<Location>[] = [
    {
      key: 'fullDescription',
      header: t('location'),
      sortable: true,
      render: row => (
        <div className="flex items-start gap-2.5">
          <MapPin className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-slate-100 text-xs">
              {isAr && row.areaZoneAr ? row.areaZoneAr : row.areaZone}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {row.fullDescription || `${row.building?.name || 'Main'} - ${row.floor?.floorName || 'Floor'} - ${row.areaZone}`}
            </div>
          </div>
        </div>
      )
    },
    {
      key: 'building',
      header: t('building'),
      render: row => (
        <div className="flex items-center gap-1.5 text-xs text-slate-200">
          <Building2 className="w-3.5 h-3.5 text-slate-400" />
          <span>{row.building?.name || 'Main Campus'}</span>
        </div>
      )
    },
    {
      key: 'floor',
      header: t('floor'),
      render: row => (
        <div className="flex items-center gap-1.5 text-xs text-slate-300">
          <Layers className="w-3.5 h-3.5 text-slate-400" />
          <span>{row.floor?.floorName || 'Ground Floor'}</span>
        </div>
      )
    },
    {
      key: 'machines',
      header: t('machinesCount'),
      render: row => {
        const assignedMachines = machines.filter(m => (m.currentLocation?.id === row.id || m.locationId === row.id) && !m.isDeleted);
        return (
          <div className="flex flex-wrap gap-1.5">
            {assignedMachines.length === 0 ? (
              <span className="text-slate-500 text-[11px] italic">Vacant Zone</span>
            ) : (
              assignedMachines.map(m => (
                <button
                  key={m.id}
                  onClick={() => onNavigate('machine-detail', m.id)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 font-mono text-[10px] border border-blue-500/30 cursor-pointer"
                >
                  <Cpu className="w-3 h-3" />
                  <span>{m.machineNumber}</span>
                </button>
              ))
            )}
          </div>
        );
      }
    },
    {
      key: 'actions',
      header: t('actions'),
      className: 'text-right rtl:text-left',
      render: row => {
        if (!canEditMachines) return null;
        return (
          <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setEditingLocation({ ...row })}
              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors cursor-pointer"
              title="Edit Location"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            {canDeleteRecord && (
              <button
                onClick={() => handlePromptDelete(row)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                title="Delete Location"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        );
      }
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100">{t('locations')}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Physical deployment zones, floor placement, and vending machine allocations
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={Building2}
            onClick={() => onNavigate('buildings')}
          >
            {t('buildings')} Hierarchy
          </Button>

          {canEditMachines && (
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => setIsAddOpen(true)}
            >
              {t('addLocation')}
            </Button>
          )}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={locations}
        isLoading={isLoading}
        searchPlaceholder={t('searchLocations')}
      />

      {/* Add Location Modal */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title={t('addLocation')}
        subtitle="Define a specific physical installation zone or corner"
        maxWidth="md"
      >
        <form onSubmit={handleCreateLocation} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Building *
              </label>
              <select
                value={bldId}
                onChange={e => {
                  setBldId(e.target.value);
                  const firstFlr = floors.find(f => f.buildingId === e.target.value);
                  if (firstFlr) setFloorId(firstFlr.id);
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              >
                {buildings.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Floor *
              </label>
              <select
                value={floorId}
                onChange={e => setFloorId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              >
                {floors.filter(f => f.buildingId === bldId).map(f => (
                  <option key={f.id} value={f.id}>{f.floorName}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Area / Zone Description (English) *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Near Cafeteria Entrance Next to ATM"
              value={areaZone}
              onChange={e => setAreaZone(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Area / Zone Description (Arabic)
            </label>
            <input
              type="text"
              placeholder="مثال: بجوار مدخل الكافتيريا والصراف الآلي"
              value={areaZoneAr}
              onChange={e => setAreaZoneAr(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={isSubmitting}>
              {t('addLocation')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Location Modal */}
      {editingLocation && (
        <Modal
          isOpen={!!editingLocation}
          onClose={() => setEditingLocation(null)}
          title="Edit Location Zone"
          subtitle={`Update ${editingLocation.areaZone}`}
          maxWidth="md"
        >
          <form onSubmit={handleUpdateLocation} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Area / Zone Description (English) *
              </label>
              <input
                type="text"
                required
                value={editingLocation.areaZone}
                onChange={e => setEditingLocation({ ...editingLocation, areaZone: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Area / Zone Description (Arabic)
              </label>
              <input
                type="text"
                value={editingLocation.areaZoneAr || ''}
                onChange={e => setEditingLocation({ ...editingLocation, areaZoneAr: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditingLocation(null)}>
                {t('cancel')}
              </Button>
              <Button type="submit" variant="primary" size="sm">
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Standardized Confirmation Modal */}
      <ConfirmActionModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        description={confirmModal.description}
        warningMessage={confirmModal.warningMessage}
        requireReason={confirmModal.requireReason}
        referenceCounts={confirmModal.referenceCounts}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
      />
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  Building2,
  Plus,
  Layers,
  MapPin,
  Cpu,
  ChevronDown,
  ChevronRight,
  Edit2,
  Trash2,
  Power,
  AlertTriangle
} from 'lucide-react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { ConfirmActionModal } from '../common/ConfirmActionModal';
import { useLanguage } from '../../context/LanguageContext';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { Building, Floor, Location, Machine, NavigationTab } from '../../types';
import { api } from '../../services/api';

interface BuildingsViewProps {
  onNavigate: (tab: NavigationTab, id?: string) => void;
}

export const BuildingsView: React.FC<BuildingsViewProps> = ({ onNavigate }) => {
  const { t, language } = useLanguage();
  const { showToast } = useNotification();
  const { canEditMachines, canDeleteRecord, isAdmin } = useAuth();

  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [expandedBuildingId, setExpandedBuildingId] = useState<string | null>(null);

  // Add Building Modal
  const [isAddBuildingOpen, setIsAddBuildingOpen] = useState(false);
  const [bldName, setBldName] = useState('');
  const [bldNameAr, setBldNameAr] = useState('');
  const [bldCode, setBldCode] = useState('');
  const [bldAddress, setBldAddress] = useState('');

  // Edit Building Modal
  const [editingBuilding, setEditingBuilding] = useState<Building | null>(null);

  // Add Floor Modal
  const [isAddFloorOpen, setIsAddFloorOpen] = useState(false);
  const [targetBuildingId, setTargetBuildingId] = useState('');
  const [floorName, setFloorName] = useState('');
  const [floorNameAr, setFloorNameAr] = useState('');
  const [levelOrder, setLevelOrder] = useState(1);

  // Edit Floor Modal
  const [editingFloor, setEditingFloor] = useState<Floor | null>(null);

  // Add Location Modal
  const [isAddLocationOpen, setIsAddLocationOpen] = useState(false);
  const [locBuildingId, setLocBuildingId] = useState('');
  const [locFloorId, setLocFloorId] = useState('');
  const [areaZone, setAreaZone] = useState('');
  const [areaZoneAr, setAreaZoneAr] = useState('');

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
    isDeactivation?: boolean;
    onConfirm: (reason?: string) => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: async () => {}
  });

  const isAr = language === 'ar';

  const loadHierarchy = async () => {
    try {
      const [bData, fData, lData, mData] = await Promise.all([
        api.getBuildings(true),
        api.getFloors(),
        api.getLocations(true),
        api.getMachines()
      ]);
      const validBlds = Array.isArray(bData) ? bData : [];
      const validFlrs = Array.isArray(fData) ? fData : [];
      const validLocs = Array.isArray(lData) ? lData : [];
      const validMchs = Array.isArray(mData) ? mData : [];

      setBuildings(validBlds);
      setFloors(validFlrs);
      setLocations(validLocs);
      setMachines(validMchs);

      if (validBlds.length > 0) {
        if (!expandedBuildingId) {
          setExpandedBuildingId(validBlds[0].id);
        }
        if (!targetBuildingId) setTargetBuildingId(validBlds[0].id);
        if (!locBuildingId) setLocBuildingId(validBlds[0].id);
      }
      if (validFlrs.length > 0 && !locFloorId) {
        setLocFloorId(validFlrs[0].id);
      }
    } catch {
      // Keep state
    }
  };

  useEffect(() => {
    loadHierarchy();
    const handleUpdate = () => {
      loadHierarchy();
    };
    window.addEventListener('vending-fleet-data-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('vending-fleet-data-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const handleCreateBuilding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bldName.trim()) return;

    try {
      const newBld = await api.createBuilding({
        name: bldName.trim(),
        nameAr: bldNameAr.trim(),
        code: bldCode.trim() || `BLD-${Date.now().toString().slice(-3)}`,
        address: bldAddress.trim()
      });
      setBuildings(prev => [...prev, newBld]);
      showToast(t('success'), `Building ${newBld.name} added!`, 'success');
      setIsAddBuildingOpen(false);
      setBldName('');
      setBldNameAr('');
      setBldCode('');
      setBldAddress('');
    } catch (err: any) {
      showToast(t('error'), err.message || 'Failed to create building', 'error');
    }
  };

  const handleUpdateBuilding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBuilding) return;

    try {
      const updated = await api.updateBuilding(editingBuilding.id, {
        name: editingBuilding.name,
        nameAr: editingBuilding.nameAr,
        code: editingBuilding.code,
        address: editingBuilding.address
      });
      setBuildings(prev => prev.map(b => (b.id === updated.id ? updated : b)));
      showToast(t('success'), `Building ${updated.name} updated successfully!`, 'success');
      setEditingBuilding(null);
    } catch (err: any) {
      showToast(t('error'), err.message || 'Failed to update building', 'error');
    }
  };

  const handlePromptDeleteBuilding = async (bld: Building) => {
    const refs = await api.checkBuildingReferences(bld.id);
    setConfirmModal({
      isOpen: true,
      title: `Delete Building: ${bld.name}`,
      description: refs.canDelete
        ? `Are you sure you want to permanently remove this facility from campus registry?`
        : `This building has active dependencies (${refs.referenceCounts.map(r => `${r.count} ${r.label}`).join(', ')}). You cannot delete it until sub-resources are relocated. You may deactivate it instead.`,
      warningMessage: refs.canDelete ? 'This action will remove the building record.' : 'Cannot permanently delete with active dependencies.',
      requireReason: true,
      referenceCounts: refs.referenceCounts,
      isDeactivation: !refs.canDelete,
      onConfirm: async (reason?: string) => {
        if (refs.canDelete) {
          await api.deleteBuilding(bld.id, false, reason);
          showToast(t('success'), `Building ${bld.name} deleted!`, 'success');
        } else {
          await api.deactivateBuilding(bld.id, reason);
          showToast(t('success'), `Building ${bld.name} deactivated!`, 'success');
        }
        await loadHierarchy();
      }
    });
  };

  const handleCreateFloor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!floorName.trim()) return;

    try {
      const newFlr = await api.createFloor({
        buildingId: targetBuildingId,
        floorName: floorName.trim(),
        floorNameAr: floorNameAr.trim(),
        levelOrder: Number(levelOrder)
      });
      setFloors(prev => [...prev, newFlr]);
      showToast(t('success'), `Floor ${newFlr.floorName} added!`, 'success');
      setIsAddFloorOpen(false);
      setFloorName('');
      setFloorNameAr('');
    } catch (err: any) {
      showToast(t('error'), err.message || 'Failed to create floor', 'error');
    }
  };

  const handleUpdateFloor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFloor) return;

    try {
      const updated = await api.updateFloor(editingFloor.id, {
        floorName: editingFloor.floorName,
        floorNameAr: editingFloor.floorNameAr,
        levelOrder: editingFloor.levelOrder
      });
      setFloors(prev => prev.map(f => (f.id === updated.id ? updated : f)));
      showToast(t('success'), `Floor ${updated.floorName} updated!`, 'success');
      setEditingFloor(null);
    } catch (err: any) {
      showToast(t('error'), err.message || 'Failed to update floor', 'error');
    }
  };

  const handlePromptDeleteFloor = async (flr: Floor) => {
    const refs = await api.checkFloorReferences(flr.id);
    setConfirmModal({
      isOpen: true,
      title: `Delete Floor: ${flr.floorName}`,
      description: refs.canDelete
        ? `Are you sure you want to remove floor "${flr.floorName}"?`
        : `This floor has active dependencies (${refs.referenceCounts.map(r => `${r.count} ${r.label}`).join(', ')}).`,
      warningMessage: refs.canDelete ? undefined : 'Please reassign zones/machines before deletion.',
      requireReason: true,
      referenceCounts: refs.referenceCounts,
      onConfirm: async (reason?: string) => {
        await api.deleteFloor(flr.id, false, reason);
        showToast(t('success'), `Floor ${flr.floorName} deleted!`, 'success');
        await loadHierarchy();
      }
    });
  };

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!areaZone.trim()) return;

    try {
      const newLoc = await api.createLocation({
        buildingId: locBuildingId,
        floorId: locFloorId,
        areaZone: areaZone.trim(),
        areaZoneAr: areaZoneAr.trim()
      });
      setLocations(prev => [...prev, newLoc]);
      showToast(t('success'), `Location ${newLoc.areaZone} added!`, 'success');
      setIsAddLocationOpen(false);
      setAreaZone('');
      setAreaZoneAr('');
    } catch (err: any) {
      showToast(t('error'), err.message || 'Failed to create location', 'error');
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
      setLocations(prev => prev.map(l => (l.id === updated.id ? updated : l)));
      showToast(t('success'), `Location ${updated.areaZone} updated!`, 'success');
      setEditingLocation(null);
    } catch (err: any) {
      showToast(t('error'), err.message || 'Failed to update location', 'error');
    }
  };

  const handlePromptDeleteLocation = async (loc: Location) => {
    const refs = await api.checkLocationReferences(loc.id);
    setConfirmModal({
      isOpen: true,
      title: `Delete Location Zone: ${loc.areaZone}`,
      description: refs.canDelete
        ? `Are you sure you want to remove deployment zone "${loc.areaZone}"?`
        : `This location has active dependencies (${refs.referenceCounts.map(r => `${r.count} ${r.label}`).join(', ')}).`,
      warningMessage: refs.canDelete ? undefined : 'Machines stationed in this zone must be relocated first.',
      requireReason: true,
      referenceCounts: refs.referenceCounts,
      onConfirm: async (reason?: string) => {
        await api.deleteLocation(loc.id, false, reason);
        showToast(t('success'), `Location ${loc.areaZone} deleted!`, 'success');
        await loadHierarchy();
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100">{t('buildings')}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Campus architectural hierarchy: Buildings, Floors, and Specific Vending Zones with CRUD management
          </p>
        </div>

        {canEditMachines && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={Plus}
              onClick={() => setIsAddLocationOpen(true)}
            >
              {t('addLocation')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={Plus}
              onClick={() => setIsAddFloorOpen(true)}
            >
              {t('addFloor')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => setIsAddBuildingOpen(true)}
            >
              {t('addBuilding')}
            </Button>
          </div>
        )}
      </div>

      {/* Buildings Cards & Expandable Hierarchies */}
      <div className="space-y-4">
        {buildings.map(bld => {
          const bldFloors = floors.filter(f => f.buildingId === bld.id && !f.isDeleted);
          const bldLocations = locations.filter(l => l.buildingId === bld.id && !l.isDeleted);
          const bldMachines = machines.filter(m => (m.currentLocation?.buildingId === bld.id || m.currentLocation?.building?.id === bld.id) && !m.isDeleted);
          const isExpanded = expandedBuildingId === bld.id;

          return (
            <div
              key={bld.id}
              className={`bg-slate-900 border ${
                bld.isActive === false ? 'border-amber-500/40 opacity-75' : 'border-slate-800'
              } rounded-2xl overflow-hidden shadow-lg transition-all`}
            >
              <div
                onClick={() => setExpandedBuildingId(isExpanded ? null : bld.id)}
                className="p-5 flex items-center justify-between cursor-pointer hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-11 h-11 rounded-xl ${
                    bld.isActive === false ? 'bg-amber-600/20 border-amber-500/30 text-amber-400' : 'bg-blue-600/20 border-blue-500/30 text-blue-400'
                  } border flex items-center justify-center`}>
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-base font-bold text-slate-100">
                        {isAr && bld.nameAr ? bld.nameAr : bld.name}
                      </h3>
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono text-[10px]">
                        {bld.code}
                      </span>
                      {bld.isActive === false && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-mono text-[10px] border border-amber-500/30">
                          Inactive
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{bld.address}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="hidden sm:flex items-center gap-4 text-xs">
                    <span className="text-slate-400">
                      <strong className="text-slate-200">{bldFloors.length}</strong> {t('floorsCount')}
                    </span>
                    <span className="text-slate-400">
                      <strong className="text-slate-200">{bldLocations.length}</strong> {t('locations')}
                    </span>
                    <span className="text-slate-400">
                      <strong className="text-blue-400 font-mono">{bldMachines.length}</strong> {t('machinesCount')}
                    </span>
                  </div>

                  {/* Actions for Building */}
                  {canEditMachines && (
                    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setEditingBuilding({ ...bld })}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Edit Building Details"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {canDeleteRecord && (
                        <button
                          onClick={() => handlePromptDeleteBuilding(bld)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Delete / Deactivate Building"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}

                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  )}
                </div>
              </div>

              {/* Expandable Floor & Location Hierarchy */}
              {isExpanded && (
                <div className="px-5 pb-5 pt-2 border-t border-slate-800/80 bg-slate-950/40 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {bldFloors.map(flr => {
                      const flrLocations = bldLocations.filter(l => l.floorId === flr.id);
                      return (
                        <div key={flr.id} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Layers className="w-4 h-4 text-indigo-400" />
                              <h4 className="text-xs font-bold text-slate-200">
                                {isAr && flr.floorNameAr ? flr.floorNameAr : flr.floorName}
                              </h4>
                              <span className="text-[10px] font-mono text-slate-400">
                                (Level {flr.levelOrder})
                              </span>
                            </div>

                            {canEditMachines && (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => setEditingFloor({ ...flr })}
                                  className="p-1 rounded text-slate-400 hover:text-blue-400 hover:bg-slate-800 cursor-pointer"
                                  title="Edit Floor"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                {canDeleteRecord && (
                                  <button
                                    onClick={() => handlePromptDeleteFloor(flr)}
                                    className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 cursor-pointer"
                                    title="Delete Floor"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="space-y-2">
                            {flrLocations.length === 0 ? (
                              <span className="text-[11px] text-slate-500 italic block">
                                No specific zones registered on this floor yet.
                              </span>
                            ) : (
                              flrLocations.map(loc => {
                                const locMachines = machines.filter(m => (m.currentLocation?.id === loc.id || m.locationId === loc.id) && !m.isDeleted);
                                return (
                                  <div
                                    key={loc.id}
                                    className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between"
                                  >
                                    <div className="flex items-center gap-2">
                                      <MapPin className="w-3.5 h-3.5 text-blue-400" />
                                      <span className="text-xs text-slate-300">
                                        {isAr && loc.areaZoneAr ? loc.areaZoneAr : loc.areaZone}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {locMachines.map(m => (
                                        <button
                                          key={m.id}
                                          onClick={() => onNavigate('machine-detail', m.id)}
                                          className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 text-[10px] font-mono border border-blue-500/30 cursor-pointer"
                                        >
                                          <Cpu className="w-3 h-3" />
                                          <span>{m.machineNumber}</span>
                                        </button>
                                      ))}

                                      {canEditMachines && (
                                        <div className="flex items-center gap-1 ml-2">
                                          <button
                                            onClick={() => setEditingLocation({ ...loc })}
                                            className="p-1 rounded text-slate-400 hover:text-blue-400 cursor-pointer"
                                            title="Edit Zone"
                                          >
                                            <Edit2 className="w-3 h-3" />
                                          </button>
                                          {canDeleteRecord && (
                                            <button
                                              onClick={() => handlePromptDeleteLocation(loc)}
                                              className="p-1 rounded text-slate-400 hover:text-rose-400 cursor-pointer"
                                              title="Delete Zone"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Building Modal */}
      <Modal
        isOpen={isAddBuildingOpen}
        onClose={() => setIsAddBuildingOpen(false)}
        title={t('addBuilding')}
        subtitle="Register campus complex or administrative facility"
        maxWidth="md"
      >
        <form onSubmit={handleCreateBuilding} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Building Name (English) *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Science & Innovation Tower"
              value={bldName}
              onChange={e => setBldName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Building Name (Arabic)
            </label>
            <input
              type="text"
              placeholder="مثال: برج العلوم والابتكار"
              value={bldNameAr}
              onChange={e => setBldNameAr(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Building Code *
              </label>
              <input
                type="text"
                required
                placeholder="BLD-SCI"
                value={bldCode}
                onChange={e => setBldCode(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Campus / Address
              </label>
              <input
                type="text"
                placeholder="South Gate Campus"
                value={bldAddress}
                onChange={e => setBldAddress(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddBuildingOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="primary" size="sm">
              {t('addBuilding')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Building Modal */}
      {editingBuilding && (
        <Modal
          isOpen={!!editingBuilding}
          onClose={() => setEditingBuilding(null)}
          title="Edit Building Details"
          subtitle={`Modify parameters for ${editingBuilding.name}`}
          maxWidth="md"
        >
          <form onSubmit={handleUpdateBuilding} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Building Name (English) *
              </label>
              <input
                type="text"
                required
                value={editingBuilding.name}
                onChange={e => setEditingBuilding({ ...editingBuilding, name: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Building Name (Arabic)
              </label>
              <input
                type="text"
                value={editingBuilding.nameAr || ''}
                onChange={e => setEditingBuilding({ ...editingBuilding, nameAr: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Building Code *
                </label>
                <input
                  type="text"
                  required
                  value={editingBuilding.code}
                  onChange={e => setEditingBuilding({ ...editingBuilding, code: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Campus / Address
                </label>
                <input
                  type="text"
                  value={editingBuilding.address || ''}
                  onChange={e => setEditingBuilding({ ...editingBuilding, address: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditingBuilding(null)}>
                {t('cancel')}
              </Button>
              <Button type="submit" variant="primary" size="sm">
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add Floor Modal */}
      <Modal
        isOpen={isAddFloorOpen}
        onClose={() => setIsAddFloorOpen(false)}
        title={t('addFloor')}
        subtitle="Add a floor level to an existing building"
        maxWidth="md"
      >
        <form onSubmit={handleCreateFloor} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Select Building *
            </label>
            <select
              value={targetBuildingId}
              onChange={e => setTargetBuildingId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
            >
              {buildings.map(b => (
                <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Floor Name (English) *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Ground Floor - East Wing"
              value={floorName}
              onChange={e => setFloorName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Floor Name (Arabic)
            </label>
            <input
              type="text"
              placeholder="مثال: الدور الأرضي - الجناح الشرقي"
              value={floorNameAr}
              onChange={e => setFloorNameAr(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Level Order Number
            </label>
            <input
              type="number"
              value={levelOrder}
              onChange={e => setLevelOrder(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddFloorOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="primary" size="sm">
              {t('addFloor')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Floor Modal */}
      {editingFloor && (
        <Modal
          isOpen={!!editingFloor}
          onClose={() => setEditingFloor(null)}
          title="Edit Floor Level"
          subtitle={`Update floor ${editingFloor.floorName}`}
          maxWidth="md"
        >
          <form onSubmit={handleUpdateFloor} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Floor Name (English) *
              </label>
              <input
                type="text"
                required
                value={editingFloor.floorName}
                onChange={e => setEditingFloor({ ...editingFloor, floorName: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Floor Name (Arabic)
              </label>
              <input
                type="text"
                value={editingFloor.floorNameAr || ''}
                onChange={e => setEditingFloor({ ...editingFloor, floorNameAr: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Level Order Number
              </label>
              <input
                type="number"
                value={editingFloor.levelOrder}
                onChange={e => setEditingFloor({ ...editingFloor, levelOrder: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditingFloor(null)}>
                {t('cancel')}
              </Button>
              <Button type="submit" variant="primary" size="sm">
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add Location Modal */}
      <Modal
        isOpen={isAddLocationOpen}
        onClose={() => setIsAddLocationOpen(false)}
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
                value={locBuildingId}
                onChange={e => {
                  setLocBuildingId(e.target.value);
                  const firstFlr = floors.find(f => f.buildingId === e.target.value);
                  if (firstFlr) setLocFloorId(firstFlr.id);
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
                value={locFloorId}
                onChange={e => setLocFloorId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              >
                {floors.filter(f => f.buildingId === locBuildingId).map(f => (
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
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddLocationOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="primary" size="sm">
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
        isDeactivation={confirmModal.isDeactivation}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
      />
    </div>
  );
};

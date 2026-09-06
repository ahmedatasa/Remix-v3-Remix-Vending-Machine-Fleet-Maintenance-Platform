import React, { useState, useEffect, useMemo } from 'react';
import {
  Cpu,
  Plus,
  QrCode,
  FileSpreadsheet,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  Move,
  Pencil,
  Trash2,
  AlertCircle,
  Eye,
  Printer,
  Flame,
  CheckSquare,
  Square,
  SlidersHorizontal,
  Layers,
  XCircle,
  Activity,
  ShieldAlert
} from 'lucide-react';
import { DataTable, Column } from '../common/DataTable';
import { StatusBadge } from '../common/StatusBadge';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { QRCodeDisplay } from '../common/QRCodeDisplay';
import QRCode from 'qrcode';
import { useLanguage } from '../../context/LanguageContext';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { Machine, NavigationTab, MachineStatus, DataQualityStatus, Location } from '../../types';
import { api } from '../../services/api';
import { excelService } from '../../services/excelService';
import { buildPublicMachineQrUrl } from '../../utils/qrUrlBuilder';

const BulkQRStickerCard: React.FC<{
  machine: Machine;
  configuredBaseUrl: string;
  isConfigured: boolean;
}> = ({ machine, configuredBaseUrl, isConfigured }) => {
  const [qrUrl, setQrUrl] = useState('');
  const qrBuild = buildPublicMachineQrUrl({
    machine,
    configuredBaseUrl,
    targetMode: 'customer',
    allowDevFallback: true
  });

  useEffect(() => {
    if (qrBuild.url) {
      QRCode.toDataURL(qrBuild.url, { width: 220, margin: 1, errorCorrectionLevel: 'M' })
        .then(setQrUrl)
        .catch(() => {});
    }
  }, [qrBuild.url]);

  return (
    <div className="p-3 bg-white text-slate-950 rounded-xl border border-slate-300 text-center space-y-1.5 shadow-sm">
      <div className="text-[10px] font-bold tracking-wider text-slate-700 uppercase">
        VENDING FLEET
      </div>
      <div className="w-24 h-24 mx-auto flex items-center justify-center bg-white">
        {qrUrl ? (
          <img src={qrUrl} alt={machine.machineNumber} className="w-24 h-24 object-contain" />
        ) : (
          <div className="w-24 h-24 bg-slate-100 animate-pulse rounded" />
        )}
      </div>
      <div className="font-mono font-bold text-xs text-slate-950">ماكينة: {machine.machineNumber}</div>
      <div className="text-[9px] font-mono text-slate-500 truncate" title={qrBuild.token}>
        TOKEN: {qrBuild.token.substring(0, 16)}...
      </div>
      <div className="text-[10px] text-slate-600 truncate">
        {machine.currentLocation?.fullDescription || machine.currentLocation?.building?.name || 'Site'}
      </div>
    </div>
  );
};

interface MachinesViewProps {
  onNavigate: (tab: NavigationTab, id?: string) => void;
}

export const MachinesView: React.FC<MachinesViewProps> = ({ onNavigate }) => {
  const { t, formatDate } = useLanguage();
  const { showToast } = useNotification();
  const { canEditMachines, canDeleteRecord, user } = useAuth();

  const [machines, setMachines] = useState<Machine[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [qualityFilter, setQualityFilter] = useState<string>('ALL');
  const [specialFilter, setSpecialFilter] = useState<'ALL' | 'CHRONIC' | 'MISSING_SERIAL' | 'LOW_HEALTH'>('ALL');
  const [selectedMachineIds, setSelectedMachineIds] = useState<string[]>([]);
  const [selectedQrMachine, setSelectedQrMachine] = useState<Machine | null>(null);

  // QR URL Base Configuration
  const [publicQrBaseUrl, setPublicQrBaseUrl] = useState<string>(() => {
    return (import.meta as any).env?.VITE_PUBLIC_QR_BASE_URL || '';
  });
  const [isUrlExplicitlyConfigured, setIsUrlExplicitlyConfigured] = useState<boolean>(true);

  useEffect(() => {
    api.getCloudSettings().then((cfg) => {
      if (cfg?.publicQrBaseUrl && cfg.publicQrBaseUrl.trim()) {
        setPublicQrBaseUrl(cfg.publicQrBaseUrl.trim().replace(/\/+$/, ''));
        setIsUrlExplicitlyConfigured(true);
      } else if ((import.meta as any).env?.VITE_PUBLIC_QR_BASE_URL) {
        setPublicQrBaseUrl(String((import.meta as any).env.VITE_PUBLIC_QR_BASE_URL).trim().replace(/\/+$/, ''));
        setIsUrlExplicitlyConfigured(true);
      } else {
        setIsUrlExplicitlyConfigured(false);
      }
    }).catch(() => {
      setIsUrlExplicitlyConfigured(false);
    });
  }, []);

  // Register Modal State
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [newMachineNumber, setNewMachineNumber] = useState('');
  const [newSerialNumber, setNewSerialNumber] = useState('');
  const [newAllowDuplicateSerial, setNewAllowDuplicateSerial] = useState(false);
  const [newType, setNewType] = useState('Combination Snack & Soda');
  const [newLocationId, setNewLocationId] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit / Modify Modal State
  const [editMachine, setEditMachine] = useState<Machine | null>(null);
  const [editMachineNumber, setEditMachineNumber] = useState('');
  const [editSerialNumber, setEditSerialNumber] = useState('');
  const [editAllowDuplicateSerial, setEditAllowDuplicateSerial] = useState(false);
  const [editMachineType, setEditMachineType] = useState('');
  const [editStatus, setEditStatus] = useState<MachineStatus>('OPERATIONAL');
  const [editDataQuality, setEditDataQuality] = useState<DataQualityStatus>('VALID');
  const [editHealthScore, setEditHealthScore] = useState<number>(100);
  const [editLocationId, setEditLocationId] = useState('');
  const [editInstallationDate, setEditInstallationDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [isEditingSubmitting, setIsEditingSubmitting] = useState(false);

  // Delete Modal State
  const [deleteTargetMachine, setDeleteTargetMachine] = useState<Machine | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Relocate Single Modal State
  const [relocateMachine, setRelocateMachine] = useState<Machine | null>(null);
  const [targetLocationId, setTargetLocationId] = useState('');
  const [relocationReason, setRelocationReason] = useState('');

  // Bulk Operations Modals State
  const [isBulkStatusModalOpen, setIsBulkStatusModalOpen] = useState(false);
  const [bulkTargetStatus, setBulkTargetStatus] = useState<MachineStatus>('OPERATIONAL');
  const [bulkStatusReason, setBulkStatusReason] = useState('');
  const [isBulkStatusSubmitting, setIsBulkStatusSubmitting] = useState(false);

  const [isBulkRelocateModalOpen, setIsBulkRelocateModalOpen] = useState(false);
  const [bulkTargetLocationId, setBulkTargetLocationId] = useState('');
  const [bulkRelocateReason, setBulkRelocateReason] = useState('');
  const [isBulkRelocateSubmitting, setIsBulkRelocateSubmitting] = useState(false);

  const [isBulkPrintModalOpen, setIsBulkPrintModalOpen] = useState(false);

  const loadMachines = async () => {
    try {
      setIsLoading(true);
      const [machinesData, locationsData] = await Promise.all([
        api.getMachines(),
        api.getLocations()
      ]);
      setMachines(machinesData || []);
      setLocations(locationsData || []);
      if (locationsData && locationsData.length > 0) {
        if (!newLocationId) setNewLocationId(locationsData[0].id);
        if (!targetLocationId) setTargetLocationId(locationsData[0].id);
        if (!bulkTargetLocationId) setBulkTargetLocationId(locationsData[0].id);
      }
    } catch (err) {
      showToast(t('error'), 'Failed to load fleet machines', 'error');
    } finally {
      setIsLoading(false);
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

  const handleRegisterMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMachineNumber.trim()) return;

    setIsSubmitting(true);
    try {
      const created = await api.createMachine({
        machineNumber: newMachineNumber.trim(),
        serialNumber: newSerialNumber.trim() || undefined,
        allowDuplicateSerialException: newAllowDuplicateSerial,
        machineType: newType,
        modelId: newLocationId,
        notes: newNotes,
        status: 'OPERATIONAL',
        dataQualityStatus: 'VALID'
      });

      showToast(t('success'), `Machine ${created.machineNumber} registered successfully!`, 'success');
      setIsRegisterOpen(false);
      setNewMachineNumber('');
      setNewSerialNumber('');
      setNewAllowDuplicateSerial(false);
      setNewNotes('');
      await loadMachines();
    } catch (err: any) {
      showToast(t('error'), err?.message || 'Failed to register machine', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (machine: Machine) => {
    setEditMachine(machine);
    setEditMachineNumber(machine.machineNumber);
    setEditSerialNumber(machine.serialNumber || '');
    setEditAllowDuplicateSerial(machine.allowDuplicateSerialException || false);
    setEditMachineType(machine.machineType || 'Combination Snack & Soda');
    setEditStatus(machine.status || 'OPERATIONAL');
    setEditDataQuality(machine.dataQualityStatus || 'VALID');
    setEditHealthScore(machine.healthScore ?? 100);
    setEditLocationId(machine.currentLocation?.id || locations[0]?.id || '');
    setEditInstallationDate(machine.installationDate || new Date().toISOString().split('T')[0]);
    setEditNotes(machine.notes || '');
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editMachine || !editMachineNumber.trim()) return;

    setIsEditingSubmitting(true);
    try {
      await api.updateMachine(editMachine.id, {
        machineNumber: editMachineNumber.trim(),
        serialNumber: editSerialNumber.trim() || undefined,
        allowDuplicateSerialException: editAllowDuplicateSerial,
        machineType: editMachineType,
        status: editStatus,
        dataQualityStatus: editDataQuality,
        healthScore: Number(editHealthScore),
        locationId: editLocationId,
        installationDate: editInstallationDate,
        notes: editNotes
      });

      showToast(t('success'), `Machine ${editMachineNumber} updated successfully!`, 'success');
      setEditMachine(null);
      await loadMachines();
    } catch (err: any) {
      showToast(t('error'), err.message || 'Failed to update machine', 'error');
    } finally {
      setIsEditingSubmitting(false);
    }
  };

  const handleDeleteSubmit = async () => {
    if (!deleteTargetMachine) return;
    if (!canDeleteRecord) {
      showToast(t('error'), 'غير مصرح بحذف الأصول الرأسمالية إلا لمديري النظام المعتمدين', 'error');
      setDeleteTargetMachine(null);
      return;
    }

    setIsDeleting(true);
    try {
      await api.deleteMachine(deleteTargetMachine.id);
      showToast(t('success'), `Machine ${deleteTargetMachine.machineNumber} deleted from fleet.`, 'success');
      setDeleteTargetMachine(null);
      setSelectedMachineIds(prev => prev.filter(id => id !== deleteTargetMachine.id));
      await loadMachines();
    } catch (err: any) {
      showToast(t('error'), err.message || 'Failed to delete machine', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRelocateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!relocateMachine) return;

    try {
      await api.relocateMachine(relocateMachine.id, targetLocationId, relocationReason);
      showToast(t('success'), `Machine ${relocateMachine.machineNumber} relocated successfully!`, 'success');
      setRelocateMachine(null);
      setRelocationReason('');
      await loadMachines();
    } catch {
      showToast(t('error'), 'Relocation failed', 'error');
    }
  };

  // Bulk Operations Handlers
  const toggleSelectMachine = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedMachineIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedMachineIds.length === filteredMachines.length) {
      setSelectedMachineIds([]);
    } else {
      setSelectedMachineIds(filteredMachines.map(m => m.id));
    }
  };

  const handleBulkStatusChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedMachineIds.length === 0) return;

    setIsBulkStatusSubmitting(true);
    try {
      await api.bulkUpdateMachineStatus(
        selectedMachineIds,
        bulkTargetStatus,
        bulkStatusReason || `Bulk transitioned to ${bulkTargetStatus}`,
        user?.id
      );
      showToast(t('success'), `Successfully updated status for ${selectedMachineIds.length} machines`, 'success');
      setIsBulkStatusModalOpen(false);
      setBulkStatusReason('');
      setSelectedMachineIds([]);
      await loadMachines();
    } catch (err: any) {
      showToast(t('error'), err.message || 'Bulk status change failed', 'error');
    } finally {
      setIsBulkStatusSubmitting(false);
    }
  };

  const handleBulkRelocate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedMachineIds.length === 0) return;

    setIsBulkRelocateSubmitting(true);
    try {
      await api.bulkRelocateMachines(
        selectedMachineIds,
        bulkTargetLocationId,
        bulkRelocateReason || 'Bulk fleet campus relocation',
        user?.id
      );
      showToast(t('success'), `Successfully relocated ${selectedMachineIds.length} machines`, 'success');
      setIsBulkRelocateModalOpen(false);
      setBulkRelocateReason('');
      setSelectedMachineIds([]);
      await loadMachines();
    } catch (err: any) {
      showToast(t('error'), err.message || 'Bulk relocation failed', 'error');
    } finally {
      setIsBulkRelocateSubmitting(false);
    }
  };

  const filteredMachines = useMemo(() => {
    return machines.filter(m => {
      if (statusFilter !== 'ALL' && m.status !== statusFilter) return false;
      if (qualityFilter !== 'ALL' && m.dataQualityStatus !== qualityFilter) return false;
      if (specialFilter === 'CHRONIC' && !m.isChronicFailure) return false;
      if (specialFilter === 'MISSING_SERIAL' && m.serialNumber) return false;
      if (specialFilter === 'LOW_HEALTH' && (m.healthScore ?? 100) >= 80) return false;
      return true;
    });
  }, [machines, statusFilter, qualityFilter, specialFilter]);

  // Statistics Summary
  const stats = useMemo(() => {
    const total = machines.length;
    const operational = machines.filter(m => m.status === 'OPERATIONAL').length;
    const warningOrDown = machines.filter(m => m.status === 'WARNING' || m.status === 'UNDER_MAINTENANCE' || m.status === 'OUT_OF_SERVICE').length;
    const chronic = machines.filter(m => m.isChronicFailure).length;
    const reviewReq = machines.filter(m => m.dataQualityStatus === 'REVIEW_REQUIRED' || m.dataQualityStatus === 'INVALID').length;
    return { total, operational, warningOrDown, chronic, reviewReq };
  }, [machines]);

  const selectedMachinesList = useMemo(() => {
    return machines.filter(m => selectedMachineIds.includes(m.id));
  }, [machines, selectedMachineIds]);

  const columns: Column<Machine>[] = [
    {
      key: 'selection',
      header: (
        <button
          type="button"
          onClick={toggleSelectAll}
          className="text-slate-400 hover:text-slate-200 cursor-pointer"
          title="Select / Deselect all"
        >
          {selectedMachineIds.length > 0 && selectedMachineIds.length === filteredMachines.length ? (
            <CheckSquare className="w-4 h-4 text-blue-400" />
          ) : (
            <Square className="w-4 h-4" />
          )}
        </button>
      ),
      className: 'w-8 text-center',
      render: row => {
        const isSelected = selectedMachineIds.includes(row.id);
        return (
          <div onClick={e => e.stopPropagation()} className="flex items-center justify-center">
            <button
              type="button"
              onClick={e => toggleSelectMachine(row.id, e)}
              className="text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              {isSelected ? (
                <CheckSquare className="w-4 h-4 text-blue-400" />
              ) : (
                <Square className="w-4 h-4 text-slate-600" />
              )}
            </button>
          </div>
        );
      }
    },
    {
      key: 'machineNumber',
      header: t('machineNumber'),
      sortable: true,
      render: row => (
        <div>
          <div className="font-mono font-bold text-slate-100 flex items-center gap-2">
            <span>{row.machineNumber}</span>
            {row.isChronicFailure && (
              <span className="p-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30" title="Chronic Failure Alert">
                <Flame className="w-3.5 h-3.5" />
              </span>
            )}
          </div>
          <span className="text-[11px] font-mono text-emerald-400">QR: {row.machineNumber}</span>
        </div>
      )
    },
    {
      key: 'machineType',
      header: t('machineType'),
      render: row => (
        <div>
          <span className="text-xs font-medium text-slate-200">{row.machineType}</span>
          <span className={`text-[11px] block font-mono ${row.serialNumber ? 'text-slate-400' : 'text-amber-400 font-semibold'}`}>
            {row.serialNumber || 'SN: Missing (Unassigned)'}
          </span>
        </div>
      )
    },
    {
      key: 'location',
      header: t('location'),
      render: row => (
        <div className="max-w-xs">
          <div className="flex items-center gap-1.5 text-xs text-slate-200">
            <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="font-medium truncate">{row.currentLocation?.building?.name || 'Campus Building'}</span>
          </div>
          <span className="text-[11px] text-slate-400 truncate block">
            {row.currentLocation?.areaZone || row.currentLocation?.fullDescription}
          </span>
        </div>
      )
    },
    {
      key: 'status',
      header: t('status'),
      sortable: true,
      render: row => <StatusBadge type="machine" status={row.status} />
    },
    {
      key: 'healthScore',
      header: t('healthScore'),
      sortable: true,
      render: row => {
        const score = row.healthScore ?? 100;
        const color = score >= 80 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-rose-400';
        return (
          <div className="flex items-center gap-2">
            <div className="w-12 bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full ${score >= 80 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                style={{ width: `${score}%` }}
              />
            </div>
            <span className={`text-xs font-mono font-bold ${color}`}>{score}%</span>
          </div>
        );
      }
    },
    {
      key: 'dataQualityStatus',
      header: t('dataQuality'),
      render: row => <StatusBadge type="quality" status={row.dataQualityStatus} />
    },
    {
      key: 'actions',
      header: t('actions'),
      className: 'text-right rtl:text-left',
      render: row => (
        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setSelectedQrMachine(row)}
            title="رمز الاستجابة السريعة والملصق (QR Code & Sticker)"
            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <QrCode className="w-4 h-4" />
          </button>

          <button
            onClick={() => onNavigate('machine-detail', row.id)}
            title={t('viewDetails')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
          
          {canEditMachines && (
            <>
              <button
                onClick={() => openEditModal(row)}
                title={t('modifyMachine')}
                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Pencil className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  setRelocateMachine(row);
                  setTargetLocationId(row.currentLocation?.id || locations[0]?.id || '');
                }}
                title={t('relocateMachine')}
                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Move className="w-4 h-4" />
              </button>

              {canDeleteRecord && (
                <button
                  onClick={() => setDeleteTargetMachine(row)}
                  title={t('deleteMachine')}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100">{t('machines')}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Authoritative fleet registry with dynamic health scoring, QR management and audit provenance
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            icon={FileSpreadsheet}
            onClick={() => excelService.exportMachinesToExcel(machines)}
          >
            {t('export')}
          </Button>

          {canEditMachines && (
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => setIsRegisterOpen(true)}
            >
              {t('registerMachine')}
            </Button>
          )}
        </div>
      </div>

      {/* Fleet KPI Metric Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div
          onClick={() => { setSpecialFilter('ALL'); setStatusFilter('ALL'); setQualityFilter('ALL'); }}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            specialFilter === 'ALL' && statusFilter === 'ALL'
              ? 'bg-blue-600/15 border-blue-500/50 shadow-inner ring-1 ring-blue-500/30'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">Total Fleet</span>
          <span className="text-2xl font-black font-mono text-slate-100">{stats.total}</span>
        </div>

        <div
          onClick={() => { setStatusFilter('OPERATIONAL'); setSpecialFilter('ALL'); }}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'OPERATIONAL'
              ? 'bg-emerald-600/15 border-emerald-500/50 shadow-inner ring-1 ring-emerald-500/30'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <span className="text-[11px] font-semibold text-emerald-400 block uppercase tracking-wider">Operational</span>
          <span className="text-2xl font-black font-mono text-emerald-400">{stats.operational}</span>
        </div>

        <div
          onClick={() => { setSpecialFilter('LOW_HEALTH'); }}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            specialFilter === 'LOW_HEALTH'
              ? 'bg-amber-600/15 border-amber-500/50 shadow-inner ring-1 ring-amber-500/30'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <span className="text-[11px] font-semibold text-amber-400 block uppercase tracking-wider">Degraded / Down</span>
          <span className="text-2xl font-black font-mono text-amber-400">{stats.warningOrDown}</span>
        </div>

        <div
          onClick={() => { setSpecialFilter('CHRONIC'); }}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            specialFilter === 'CHRONIC'
              ? 'bg-rose-600/15 border-rose-500/50 shadow-inner ring-1 ring-rose-500/30'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-rose-400 block uppercase tracking-wider">Chronic Flags</span>
            <Flame className="w-4 h-4 text-rose-400" />
          </div>
          <span className="text-2xl font-black font-mono text-rose-400">{stats.chronic}</span>
        </div>

        <div
          onClick={() => { setQualityFilter('REVIEW_REQUIRED'); setSpecialFilter('ALL'); }}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            qualityFilter === 'REVIEW_REQUIRED'
              ? 'bg-purple-600/15 border-purple-500/50 shadow-inner ring-1 ring-purple-500/30'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <span className="text-[11px] font-semibold text-purple-400 block uppercase tracking-wider">Review Required</span>
          <span className="text-2xl font-black font-mono text-purple-300">{stats.reviewReq}</span>
        </div>
      </div>

      {/* Floating Bulk Operations Toolbar */}
      {selectedMachineIds.length > 0 && (
        <div className="p-4 rounded-2xl bg-blue-950/80 border border-blue-500/40 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-blue-600 text-white font-mono font-bold text-xs">
              {selectedMachineIds.length} SELECTED
            </span>
            <span className="text-xs text-blue-200">
              Bulk master actions for selected physical vending assets
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto">
            {canEditMachines && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  icon={SlidersHorizontal}
                  onClick={() => setIsBulkStatusModalOpen(true)}
                >
                  Set Status ({selectedMachineIds.length})
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  icon={Move}
                  onClick={() => setIsBulkRelocateModalOpen(true)}
                >
                  Relocate ({selectedMachineIds.length})
                </Button>
              </>
            )}

            <Button
              variant="outline"
              size="sm"
              icon={Printer}
              onClick={() => setIsBulkPrintModalOpen(true)}
            >
              Print Labels
            </Button>

            <Button
              variant="ghost"
              size="sm"
              icon={XCircle}
              onClick={() => setSelectedMachineIds([])}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Main Data Table */}
      <DataTable
        columns={columns}
        data={filteredMachines}
        isLoading={isLoading}
        searchPlaceholder="Search machine #, serial #, building, or QR ID..."
        onRowClick={row => onNavigate('machine-detail', row.id)}
        filterComponent={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">{t('filterByStatus')}: All</option>
              <option value="OPERATIONAL">Operational</option>
              <option value="WARNING">Warning</option>
              <option value="UNDER_MAINTENANCE">Under Maintenance</option>
              <option value="OUT_OF_SERVICE">Out of Service</option>
              <option value="DEACTIVATED">Deactivated</option>
            </select>

            <select
              value={qualityFilter}
              onChange={e => setQualityFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">{t('filterByQuality')}: All</option>
              <option value="VALID">Valid Data</option>
              <option value="REVIEW_REQUIRED">Review Required</option>
              <option value="INVALID">Invalid Rows</option>
            </select>

            <select
              value={specialFilter}
              onChange={e => setSpecialFilter(e.target.value as any)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">Fleet Filter: All</option>
              <option value="CHRONIC">🔥 Chronic Failures (&ge;3 / 30d)</option>
              <option value="MISSING_SERIAL">⚠️ Missing Serial Numbers</option>
              <option value="LOW_HEALTH">📉 Health &lt; 80%</option>
            </select>
          </div>
        }
      />

      {/* Register Machine Modal */}
      <Modal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        title={t('registerMachine')}
        subtitle="Add a new physical vending unit into the fleet management database"
        maxWidth="lg"
      >
        <form onSubmit={handleRegisterMachine} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {t('machineNumber')} *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. VM-B05-F01-01"
                value={newMachineNumber}
                onChange={e => setNewMachineNumber(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {t('serialNumber')}
              </label>
              <input
                type="text"
                placeholder="e.g. SN-2026-9901 (or leave empty)"
                value={newSerialNumber}
                onChange={e => setNewSerialNumber(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
              />
              <div className="flex items-center gap-2 mt-1.5">
                <input
                  type="checkbox"
                  id="newAllowDuplicateSerial"
                  checked={newAllowDuplicateSerial}
                  onChange={e => setNewAllowDuplicateSerial(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-0"
                />
                <label htmlFor="newAllowDuplicateSerial" className="text-[11px] text-slate-400">
                  Allow duplicate serial exception
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {t('machineType')}
              </label>
              <select
                value={newType}
                onChange={e => setNewType(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="Combination Snack & Soda">Combination Snack & Soda</option>
                <option value="Bean-to-Cup Espresso">Bean-to-Cup Espresso</option>
                <option value="Smart Cold Beverage">Smart Cold Beverage</option>
                <option value="Frozen Food / Ice Cream">Frozen Food / Ice Cream</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {t('location')}
              </label>
              <select
                value={newLocationId}
                onChange={e => setNewLocationId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              >
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>
                    {loc.building?.name} — {loc.areaZone || loc.fullDescription}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Installation Notes / Special Instructions
            </label>
            <textarea
              rows={3}
              value={newNotes}
              onChange={e => setNewNotes(e.target.value)}
              placeholder="Power supply ratings, telemetry modem serial, delivery notes..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsRegisterOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSubmitting}
            >
              {t('registerMachine')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modify / Edit Machine Modal */}
      <Modal
        isOpen={!!editMachine}
        onClose={() => setEditMachine(null)}
        title={t('modifyMachine')}
        subtitle={`Update configuration, location or technical parameters for ${editMachine?.machineNumber}`}
        maxWidth="lg"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {t('machineNumber')} *
              </label>
              <input
                type="text"
                required
                value={editMachineNumber}
                onChange={e => setEditMachineNumber(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {t('serialNumber')}
              </label>
              <input
                type="text"
                value={editSerialNumber}
                onChange={e => setEditSerialNumber(e.target.value)}
                placeholder="e.g. SN-2024-XXXXX"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
              />
              <div className="flex items-center gap-2 mt-1.5">
                <input
                  type="checkbox"
                  id="editAllowDuplicateSerial"
                  checked={editAllowDuplicateSerial}
                  onChange={e => setEditAllowDuplicateSerial(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-0"
                />
                <label htmlFor="editAllowDuplicateSerial" className="text-[11px] text-slate-400">
                  Allow duplicate serial exception
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {t('machineType')}
              </label>
              <select
                value={editMachineType}
                onChange={e => setEditMachineType(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="Combination Snack & Soda">Combination Snack & Soda</option>
                <option value="Bean-to-Cup Espresso">Bean-to-Cup Espresso</option>
                <option value="Smart Cold Beverage">Smart Cold Beverage</option>
                <option value="Frozen Food / Ice Cream">Frozen Food / Ice Cream</option>
                <option value="Hot Beverages & Tea">Hot Beverages & Tea</option>
                <option value="Fresh Food Micro-Market">Fresh Food Micro-Market</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {t('location')}
              </label>
              <select
                value={editLocationId}
                onChange={e => setEditLocationId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              >
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>
                    {loc.building?.name} — {loc.floor?.floorName || ''} ({loc.areaZone || loc.fullDescription})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {t('status')}
              </label>
              <select
                value={editStatus}
                onChange={e => setEditStatus(e.target.value as MachineStatus)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="OPERATIONAL">OPERATIONAL</option>
                <option value="WARNING">WARNING</option>
                <option value="UNDER_MAINTENANCE">UNDER MAINTENANCE</option>
                <option value="OUT_OF_SERVICE">OUT OF SERVICE</option>
                <option value="DEACTIVATED">DEACTIVATED</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {t('dataQuality')}
              </label>
              <select
                value={editDataQuality}
                onChange={e => setEditDataQuality(e.target.value as DataQualityStatus)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="VALID">VALID</option>
                <option value="REVIEW_REQUIRED">REVIEW REQUIRED</option>
                <option value="INVALID">INVALID</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {t('healthScore')} (0 - 100%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={editHealthScore}
                onChange={e => setEditHealthScore(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              {t('installationDate')}
            </label>
            <input
              type="date"
              value={editInstallationDate}
              onChange={e => setEditInstallationDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Technical & Maintenance Notes
            </label>
            <textarea
              rows={3}
              value={editNotes}
              onChange={e => setEditNotes(e.target.value)}
              placeholder="Maintenance history, transducer notes, hardware revisions..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditMachine(null)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isEditingSubmitting}
            >
              {t('modifyMachine')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Relocate Modal */}
      <Modal
        isOpen={!!relocateMachine}
        onClose={() => setRelocateMachine(null)}
        title={t('relocateMachine')}
        subtitle={`Transfer ${relocateMachine?.machineNumber} to another campus or zone`}
        maxWidth="md"
      >
        <form onSubmit={handleRelocateSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              {t('newLocation')} *
            </label>
            <select
              value={targetLocationId}
              onChange={e => setTargetLocationId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
            >
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>
                  {loc.building?.name} &rarr; {loc.floor?.floorName || ''} &rarr; {loc.areaZone || loc.fullDescription}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              {t('relocationReason')} *
            </label>
            <textarea
              required
              rows={3}
              value={relocationReason}
              onChange={e => setRelocationReason(e.target.value)}
              placeholder="e.g. Higher student traffic zone assignment..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRelocateMachine(null)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
            >
              {t('confirm')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteTargetMachine}
        onClose={() => setDeleteTargetMachine(null)}
        title={t('deleteMachine')}
        subtitle="Confirm permanent removal of vending unit from master fleet"
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs text-rose-200">
              <p className="font-semibold text-rose-100 mb-1">{t('confirmDeleteMachine')}</p>
              <p className="text-[11px] text-rose-300/80">{t('deleteMachineWarning')}</p>
            </div>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-2 font-mono">
            <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
              <span className="text-slate-400">{t('machineNumber')}:</span>
              <span className="font-bold text-slate-100">{deleteTargetMachine?.machineNumber}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-400">{t('serialNumber')}:</span>
              <span className="text-slate-300">{deleteTargetMachine?.serialNumber || 'N/A'}</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeleteTargetMachine(null)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              icon={Trash2}
              isLoading={isDeleting}
              onClick={handleDeleteSubmit}
            >
              {t('deleteMachine')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk Status Change Modal */}
      <Modal
        isOpen={isBulkStatusModalOpen}
        onClose={() => setIsBulkStatusModalOpen(false)}
        title="Bulk Lifecycle Status Change"
        subtitle={`Apply operational status transition to ${selectedMachineIds.length} selected machines`}
        maxWidth="md"
      >
        <form onSubmit={handleBulkStatusChange} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              New Status *
            </label>
            <select
              value={bulkTargetStatus}
              onChange={e => setBulkTargetStatus(e.target.value as MachineStatus)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
            >
              <option value="OPERATIONAL">OPERATIONAL</option>
              <option value="WARNING">WARNING</option>
              <option value="UNDER_MAINTENANCE">UNDER MAINTENANCE</option>
              <option value="OUT_OF_SERVICE">OUT OF SERVICE</option>
              <option value="DEACTIVATED">DEACTIVATED</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Operational Reason / Batch Note *
            </label>
            <textarea
              required
              rows={3}
              value={bulkStatusReason}
              onChange={e => setBulkStatusReason(e.target.value)}
              placeholder="e.g. Scheduled summer campus shutdown or fleet-wide firmware rollout..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsBulkStatusModalOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isBulkStatusSubmitting}
            >
              Apply Status to {selectedMachineIds.length} Machines
            </Button>
          </div>
        </form>
      </Modal>

      {/* Bulk Relocate Modal */}
      <Modal
        isOpen={isBulkRelocateModalOpen}
        onClose={() => setIsBulkRelocateModalOpen(false)}
        title="Bulk Fleet Relocation"
        subtitle={`Transfer ${selectedMachineIds.length} machines to a common location`}
        maxWidth="md"
      >
        <form onSubmit={handleBulkRelocate} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Target Campus & Zone *
            </label>
            <select
              value={bulkTargetLocationId}
              onChange={e => setBulkTargetLocationId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
            >
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>
                  {loc.building?.name} &rarr; {loc.floor?.floorName || ''} ({loc.areaZone || loc.fullDescription})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Relocation Purpose *
            </label>
            <textarea
              required
              rows={3}
              value={bulkRelocateReason}
              onChange={e => setBulkRelocateReason(e.target.value)}
              placeholder="e.g. Consolidation for sports tournament or building refurbishment..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsBulkRelocateModalOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isBulkRelocateSubmitting}
            >
              Relocate {selectedMachineIds.length} Machines
            </Button>
          </div>
        </form>
      </Modal>

      {/* Bulk Print QR Labels Modal */}
      <Modal
        isOpen={isBulkPrintModalOpen}
        onClose={() => setIsBulkPrintModalOpen(false)}
        title="طباعة ملصقات الـ QR المجمعة (Batch QR Code Stickers)"
        subtitle={`ملصقات جاهزة للطباعة لعدد ${selectedMachinesList.length} ماكينة بيع ذاتي`}
        maxWidth="lg"
      >
        <div className="space-y-4">
          {!isUrlExplicitlyConfigured && (
            <div className="p-3 bg-amber-950/40 border border-amber-800/80 rounded-xl text-xs text-amber-300 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">PUBLIC_QR_BASE_URL_NOT_CONFIGURED: رابط البوابة السحابية العامة غير مهيأ</p>
                <p className="text-[11px] text-amber-200/80 leading-relaxed">
                  تم حظر طباعة ملصقات الإنتاج مؤقتاً لتجنب طباعة ملصقات بروابط محلية لا تعمل من هواتف العملاء أو الفنيين في الميدان. يرجى ضبط النطاق السحابي من تبويب إعدادات السحابة لتفعيل الطباعة.
                </p>
              </div>
            </div>
          )}

          <div className="max-h-96 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-2">
            {selectedMachinesList.map(m => (
              <BulkQRStickerCard
                key={m.id}
                machine={m}
                configuredBaseUrl={publicQrBaseUrl}
                isConfigured={isUrlExplicitlyConfigured}
              />
            ))}
          </div>

          <div className="flex justify-between items-center pt-3 border-t border-slate-800">
            <span className="text-xs text-slate-400">
              تم تجهيز {selectedMachinesList.length} ملصق بدقة عالية مع رموز استجابة سريعة حقيقية
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsBulkPrintModalOpen(false)}
              >
                {t('cancel')}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                icon={Printer}
                disabled={!isUrlExplicitlyConfigured || selectedMachinesList.length === 0}
                title={!isUrlExplicitlyConfigured ? 'PUBLIC_QR_BASE_URL_NOT_CONFIGURED: اضبط النطاق السحابي لتفعيل الطباعة' : undefined}
                onClick={async () => {
                  if (!isUrlExplicitlyConfigured) {
                    showToast('PUBLIC_QR_BASE_URL_NOT_CONFIGURED', 'يجب ضبط رابط النطاق السحابي العام قبل طباعة ملصقات الإنتاج.', 'warning');
                    return;
                  }

                  const printWin = window.open('', '_blank');
                  if (!printWin) return;
                  const items = await Promise.all(
                    selectedMachinesList.map(async m => {
                      const qrBuild = buildPublicMachineQrUrl({
                        machine: m,
                        configuredBaseUrl: publicQrBaseUrl,
                        targetMode: 'customer',
                        allowDevFallback: false
                      });
                      const url = qrBuild.url;
                      const qrDataUrl = await QRCode.toDataURL(url, { width: 250, margin: 1, errorCorrectionLevel: 'M' });
                      const locText = m.currentLocation?.fullDescription || 
                        `${m.currentLocation?.building?.name || 'Building'} - ${m.currentLocation?.areaZone || 'Zone'}`;
                      return { m, qrDataUrl, locText, qrToken: qrBuild.token };
                    })
                  );

                  printWin.document.write(`
                    <!DOCTYPE html>
                    <html dir="rtl">
                    <head>
                      <meta charset="utf-8">
                      <title>طباعة ملصقات ماكينات البيع</title>
                      <style>
                        @page { size: auto; margin: 8mm; }
                        body { font-family: system-ui, sans-serif; margin: 0; padding: 10px; background: #fff; color: #0f172a; }
                        .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
                        .sticker { border: 2px solid #0f172a; border-radius: 8px; padding: 12px; text-align: center; page-break-inside: avoid; }
                        .header { font-size: 11px; font-weight: bold; color: #0284c7; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 6px; }
                        .badge { background: #0f172a; color: #fff; padding: 4px 8px; font-family: monospace; font-size: 14px; font-weight: bold; border-radius: 4px; display: inline-block; }
                        .qr-img { width: 140px; height: 140px; margin: 6px auto; display: block; }
                        .cta { font-size: 10px; font-weight: bold; color: #047857; margin-bottom: 4px; }
                        .info { font-size: 9px; color: #475569; border-top: 1px dashed #cbd5e1; padding-top: 4px; }
                      </style>
                    </head>
                    <body>
                      <div class="grid">
                        ${items.map(item => `
                          <div class="sticker">
                            <div class="header">نظام الإبلاغ الفوري عن أعطال ماكينات البيع</div>
                            <div class="badge">رقم الماكينة: ${item.m.machineNumber}</div>
                            <img class="qr-img" src="${item.qrDataUrl}" alt="QR" />
                            <div class="cta">امسح الرمز بالجوال لفتح بلاغ عطل فوري</div>
                            <div class="info">
                              <div><strong>الموقع:</strong> ${item.locText}</div>
                              <div><strong>الرمز السحابي:</strong> ${item.qrToken}</div>
                              <div><strong>الرقم التسلسلي:</strong> ${item.m.serialNumber || 'N/A'} | <strong>النوع:</strong> ${item.m.machineType || 'Vending'}</div>
                            </div>
                          </div>
                        `).join('')}
                      </div>
                      <script>
                        window.onload = function() { setTimeout(function() { window.print(); }, 350); };
                      </script>
                    </body>
                    </html>
                  `);
                  printWin.document.close();
                }}
              >
                طباعة كافة الملصقات ({selectedMachinesList.length})
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Single Machine QR Code & Sticker Modal */}
      {selectedQrMachine && (
        <Modal
          isOpen={!!selectedQrMachine}
          onClose={() => setSelectedQrMachine(null)}
          title={`رمز الاستجابة السريعة (QR Code) — ${selectedQrMachine.machineNumber}`}
          subtitle="رمز استجابة حقيقي قابل للمسح بالجوال للتبليغ المباشر وطباعة الملصقات"
          maxWidth="sm"
        >
          <QRCodeDisplay
            machine={selectedQrMachine}
            onNavigate={(tab, id) => {
              setSelectedQrMachine(null);
              onNavigate(tab, id);
            }}
          />
        </Modal>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Cpu,
  QrCode,
  Printer,
  Wrench,
  Calendar,
  MapPin,
  Ticket as TicketIcon,
  ShieldCheck,
  Move,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Copy,
  ExternalLink,
  Flame,
  FileSpreadsheet,
  HelpCircle,
  Power,
  ShieldAlert,
  SlidersHorizontal,
  Check
} from 'lucide-react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { StatusBadge } from '../common/StatusBadge';
import { Modal } from '../common/Modal';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { QRCodeDisplay } from '../common/QRCodeDisplay';
import { useLanguage } from '../../context/LanguageContext';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { Machine, Ticket, NavigationTab, FaultCategory, TicketPriority, MachinePartHistoryRecord, MachineStatus, DataQualityStatus, Location } from '../../types';
import { api } from '../../services/api';
import { buildPublicMachineQrUrl } from '../../utils/qrUrlBuilder';

interface MachineDetailViewProps {
  machineId: string;
  onNavigate: (tab: NavigationTab, id?: string) => void;
}

export const MachineDetailView: React.FC<MachineDetailViewProps> = ({ machineId, onNavigate }) => {
  const { t, formatDate, isRTL } = useLanguage();
  const { showToast, addInAppNotification } = useNotification();
  const { canEditMachines, user } = useAuth();

  const [machine, setMachine] = useState<Machine | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [partsHistory, setPartsHistory] = useState<MachinePartHistoryRecord[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);

  // New Ticket Modal
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [category, setCategory] = useState<FaultCategory>('REFRIGERATION');
  const [priority, setPriority] = useState<TicketPriority>('HIGH');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Relocate Modal
  const [isRelocateOpen, setIsRelocateOpen] = useState(false);
  const [targetLocationId, setTargetLocationId] = useState('');
  const [relocationReason, setRelocationReason] = useState('');

  // Modify / Edit Modal
  const [isEditOpen, setIsEditOpen] = useState(false);
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

  // Status Change Modal
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [selectedNewStatus, setSelectedNewStatus] = useState<MachineStatus>('OPERATIONAL');
  const [statusChangeReason, setStatusChangeReason] = useState('');
  const [isStatusSubmitting, setIsStatusSubmitting] = useState(false);

  // Regenerate QR Modal
  const [isRegenerateQrOpen, setIsRegenerateQrOpen] = useState(false);
  const [regenerateReason, setRegenerateReason] = useState('');
  const [isRegeneratingQr, setIsRegeneratingQr] = useState(false);

  // QR Print Label Preview Modal
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Delete Modal
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = async () => {
    try {
      setIsLoading(true);
      let mch = await api.getMachineById(machineId);
      if (!mch) {
        const allMchs = await api.getMachines();
        mch = allMchs.find(m => m.id === machineId || m.publicId === machineId || m.machineNumber === machineId) || null;
      }
      setMachine(mch);

      const [allTickets, parts, allLocations] = await Promise.all([
        api.getTickets(),
        api.getMachinePartsHistory(machineId),
        api.getLocations()
      ]);

      setLocations(allLocations || []);
      if (allLocations && allLocations.length > 0 && !targetLocationId) {
        setTargetLocationId(allLocations[0].id);
      }

      const mchTickets = allTickets.filter(
        t => t.machineId === machineId || 
             t.machine?.id === machineId || 
             t.machine?.publicId === machineId ||
             (mch && t.machineId === mch.id)
      );
      setTickets(mchTickets);
      setPartsHistory(parts || []);
    } catch {
      showToast(t('error'), 'Failed to load machine details', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [machineId]);

  if (isLoading || !machine) {
    return <LoadingSpinner message="Retrieving machine technical diagnostics..." />;
  }

  const qrBuild = buildPublicMachineQrUrl({
    machine,
    targetMode: 'customer',
    allowDevFallback: true
  });
  const publicFaultUrl = qrBuild.url || '';

  const handleCopyPublicLink = () => {
    navigator.clipboard.writeText(publicFaultUrl);
    setCopiedLink(true);
    showToast(t('success'), `تم نسخ رابط البلاغ المباشر للماكينة ${machine.machineNumber}`, 'success');
    setTimeout(() => setCopiedLink(false), 3000);
  };

  const openEditModal = () => {
    setEditMachineNumber(machine.machineNumber);
    setEditSerialNumber(machine.serialNumber || '');
    setEditAllowDuplicateSerial(machine.allowDuplicateSerialException || false);
    setEditMachineType(machine.machineType || 'Combination Snack & Soda');
    setEditStatus(machine.status || 'OPERATIONAL');
    setEditDataQuality(machine.dataQualityStatus || 'VALID');
    setEditHealthScore(machine.healthScore ?? 100);
    setEditLocationId(machine.currentLocation?.id || (locations[0]?.id || ''));
    setEditInstallationDate(machine.installationDate || new Date().toISOString().split('T')[0]);
    setEditNotes(machine.notes || '');
    setIsEditOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editMachineNumber.trim()) return;

    setIsEditingSubmitting(true);
    try {
      await api.updateMachine(machine.id, {
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
      setIsEditOpen(false);
      await loadData();
    } catch (err: any) {
      showToast(t('error'), err.message || 'Failed to update machine', 'error');
    } finally {
      setIsEditingSubmitting(false);
    }
  };

  const handleStatusChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsStatusSubmitting(true);
    try {
      await api.setMachineStatus(
        machine.id,
        selectedNewStatus,
        statusChangeReason || `Status transitioned to ${selectedNewStatus}`,
        user?.id
      );
      showToast(t('success'), `Machine status changed to ${selectedNewStatus}`, 'success');
      setIsStatusModalOpen(false);
      setStatusChangeReason('');
      await loadData();
    } catch (err: any) {
      showToast(t('error'), err.message || 'Failed to update machine status', 'error');
    } finally {
      setIsStatusSubmitting(false);
    }
  };

  const handleRegenerateQr = async () => {
    setIsRegeneratingQr(true);
    try {
      const updated = await api.regenerateMachineQr(
        machine.id,
        regenerateReason || 'Administrator re-issued public QR code identity'
      );
      showToast(t('success'), `New QR Identifier issued: ${updated.publicQrId}`, 'success');
      setIsRegenerateQrOpen(false);
      setRegenerateReason('');
      await loadData();
    } catch (err: any) {
      showToast(t('error'), err.message || 'Failed to regenerate QR code', 'error');
    } finally {
      setIsRegeneratingQr(false);
    }
  };

  const handleDeleteSubmit = async () => {
    setIsDeleting(true);
    try {
      await api.deleteMachine(machine.id);
      showToast(t('success'), `Machine ${machine.machineNumber} deleted from fleet.`, 'success');
      setIsDeleteOpen(false);
      onNavigate('machines');
    } catch (err: any) {
      showToast(t('error'), err.message || 'Failed to delete machine', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    setIsSubmitting(true);
    try {
      const newTck = await api.createTicket({
        machineId: machine.id,
        category,
        priority,
        description,
        source: 'MANUAL'
      });

      showToast(t('success'), `Ticket ${newTck.ticketNumber} created!`, 'success');
      addInAppNotification({
        title: `Ticket Created for ${machine.machineNumber}`,
        message: description,
        type: 'TICKET_CREATED',
        linkTab: 'ticket-detail',
        linkId: newTck.id
      });

      setIsTicketModalOpen(false);
      setDescription('');
      await loadData();
    } catch {
      showToast(t('error'), 'Ticket creation failed', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRelocate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.relocateMachine(machine.id, targetLocationId, relocationReason);
      showToast(t('success'), 'Machine relocated successfully!', 'success');
      setIsRelocateOpen(false);
      setRelocationReason('');
      await loadData();
    } catch {
      showToast(t('error'), 'Relocation failed', 'error');
    }
  };

  const handlePrintQRSticker = () => {
    setIsPrintModalOpen(true);
  };

  const printLabelNow = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Back Button & Top Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          onClick={() => onNavigate('machines')}
          className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('machines')}</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {canEditMachines && (
            <>
              <Button
                variant="outline"
                size="sm"
                icon={SlidersHorizontal}
                onClick={() => {
                  setSelectedNewStatus(machine.status);
                  setIsStatusModalOpen(true);
                }}
              >
                Change Lifecycle Status
              </Button>

              <Button
                variant="outline"
                size="sm"
                icon={Pencil}
                onClick={openEditModal}
              >
                {t('modifyMachine')}
              </Button>

              <Button
                variant="outline"
                size="sm"
                icon={Move}
                onClick={() => {
                  setTargetLocationId(machine.currentLocation?.id || (locations[0]?.id || ''));
                  setIsRelocateOpen(true);
                }}
              >
                {t('relocateMachine')}
              </Button>

              <Button
                variant="danger"
                size="sm"
                icon={Trash2}
                onClick={() => setIsDeleteOpen(true)}
              >
                {t('deleteMachine')}
              </Button>
            </>
          )}

          <Button
            variant="outline"
            size="sm"
            icon={Printer}
            onClick={handlePrintQRSticker}
          >
            {t('printQR')}
          </Button>

          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => setIsTicketModalOpen(true)}
          >
            {t('newTicket')}
          </Button>
        </div>
      </div>

      {/* Chronic Failure Alert Banner if machine has chronic issues */}
      {machine.isChronicFailure && (
        <div className="p-4 rounded-2xl bg-rose-950/40 border-2 border-rose-500/60 shadow-xl flex items-start gap-4 animate-fade-in">
          <div className="p-3 rounded-xl bg-rose-500/20 text-rose-400 shrink-0 border border-rose-500/40">
            <Flame className="w-6 h-6 animate-pulse" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-rose-200 text-sm uppercase tracking-wider">
                Chronic Failure Alert Detected
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/30 text-rose-300 border border-rose-500/40 font-mono">
                &ge;3 Faults in 30 Days
              </span>
            </div>
            <p className="text-xs text-rose-300/90 leading-relaxed">
              {machine.chronicFailureReason || 'This machine has exceeded the chronic failure threshold with repeated recurring faults. Engineering review or complete unit replacement recommended.'}
            </p>
          </div>
        </div>
      )}

      {/* Main Header Banner Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-inner">
              <Cpu className="w-8 h-8" />
            </div>

            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold font-mono text-slate-100">{machine.machineNumber}</h1>
                <StatusBadge type="machine" status={machine.status} />
                <StatusBadge type="quality" status={machine.dataQualityStatus} />
                {machine.isChronicFailure && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1 font-mono">
                    <Flame className="w-3 h-3" />
                    CHRONIC
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-400 mt-1">
                {machine.machineType} • Serial: <span className="font-mono text-slate-300">{machine.serialNumber || 'MISSING (UNASSIGNED)'}</span>
                {machine.allowDuplicateSerialException && (
                  <span className="ml-2 px-1.5 py-0.2 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Duplicate Exception Allowed
                  </span>
                )}
              </p>

              <div className="flex items-center gap-4 mt-3 text-xs text-slate-400 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-blue-400" />
                  {machine.currentLocation?.fullDescription}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  Installed: {machine.installationDate || '2024-03-15'}
                </span>
                <span className="flex items-center gap-1.5 font-mono text-slate-400">
                  <QrCode className="w-3.5 h-3.5 text-emerald-400" />
                  QR Machine Number: <strong className="text-emerald-300">{machine.machineNumber}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Health Score Box */}
          <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800 shrink-0">
            <div className="text-right rtl:text-left">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                {t('healthScore')}
              </span>
              <span className={`text-2xl font-mono font-bold ${
                (machine.healthScore ?? 100) >= 80 ? 'text-emerald-400' :
                (machine.healthScore ?? 100) >= 50 ? 'text-amber-400' : 'text-rose-400'
              }`}>
                {machine.healthScore ?? 100}%
              </span>
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                {machine.healthStatus || 'HEALTHY'}
              </span>
            </div>
            <Activity className={`w-8 h-8 ${
              (machine.healthScore ?? 100) >= 80 ? 'text-emerald-400' :
              (machine.healthScore ?? 100) >= 50 ? 'text-amber-400' : 'text-rose-400'
            }`} />
          </div>
        </div>
      </div>

      {/* Grid: QR Label & Specs & Import Provenance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Printable QR Label */}
        <div className="space-y-6">
          <QRCodeDisplay
            machine={machine}
            onNavigate={onNavigate}
            canRegenerate={canEditMachines}
            onRegenerate={() => setIsRegenerateQrOpen(true)}
          />

          {/* Technical Specs Card */}
          <Card title={t('specs')} subtitle="Hardware and telemetry configuration">
            <dl className="divide-y divide-slate-800/60 text-xs">
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-400">Manufacturer</dt>
                <dd className="font-semibold text-slate-200">Fas International / Crane</dd>
              </div>
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-400">Telemetry Protocol</dt>
                <dd className="font-mono text-blue-400">MDB 4.3 / DEX</dd>
              </div>
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-400">POS Card Terminal</dt>
                <dd className="font-semibold text-slate-200">Nayax VPOS Touch</dd>
              </div>
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-400">Target Temp</dt>
                <dd className="font-mono text-emerald-400">+4.0 °C</dd>
              </div>
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-400">Last Service</dt>
                <dd className="text-slate-200">{formatDate(machine.lastMaintenanceAt)}</dd>
              </div>
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-400">Next Scheduled</dt>
                <dd className="text-amber-400">{formatDate(machine.nextMaintenanceDue)}</dd>
              </div>
            </dl>
          </Card>
        </div>

        {/* Right 2 Columns: Tickets, Import Provenance & Maintenance History */}
        <div className="lg:col-span-2 space-y-6">
          {/* Import Provenance Audit Record */}
          {machine.importProvenance ? (
            <Card
              title="Import Provenance & Source Audit"
              subtitle={`Batch ID: ${machine.importProvenance.importBatchId} • Normalized: ${formatDate(machine.importProvenance.normalizedAt)}`}
            >
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs">
                  <div>
                    <span className="text-slate-500 block text-[10px]">SOURCE WORKBOOK</span>
                    <span className="text-slate-200 font-semibold truncate block">{machine.importProvenance.sourceFile}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">SHEET & ROW</span>
                    <span className="text-blue-400 font-semibold">{machine.importProvenance.sourceSheet} (Row {machine.importProvenance.sourceRow})</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">INITIAL ASSESSMENT</span>
                    <span className="text-emerald-400 font-semibold">{machine.importProvenance.initialQualityAssessment}</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <span className="text-slate-400 font-semibold block mb-2 text-[11px]">Original Raw Spreadsheet Row Values:</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                    <div className="bg-slate-900 p-2 rounded border border-slate-800">
                      <span className="text-slate-500 block text-[10px]">Raw Number</span>
                      <span className="text-slate-200">{machine.importProvenance.originalSourceValues.rawMachineNumber || '—'}</span>
                    </div>
                    <div className="bg-slate-900 p-2 rounded border border-slate-800">
                      <span className="text-slate-500 block text-[10px]">Raw Serial</span>
                      <span className="text-slate-200">{machine.importProvenance.originalSourceValues.rawSerialNumber || '—'}</span>
                    </div>
                    <div className="bg-slate-900 p-2 rounded border border-slate-800">
                      <span className="text-slate-500 block text-[10px]">Raw Building</span>
                      <span className="text-slate-200">{machine.importProvenance.originalSourceValues.rawBuilding || '—'}</span>
                    </div>
                    <div className="bg-slate-900 p-2 rounded border border-slate-800">
                      <span className="text-slate-500 block text-[10px]">Raw Floor</span>
                      <span className="text-slate-200">{machine.importProvenance.originalSourceValues.rawFloor || '—'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <Card
              title="Registry Provenance"
              subtitle="Directly provisioned via Master Data Control Console"
            >
              <div className="text-xs text-slate-400 p-3 rounded-xl bg-slate-950 border border-slate-800">
                Created directly in system database on {formatDate(machine.createdAt)}. Retains authoritative uniqueness in master registry.
              </div>
            </Card>
          )}

          {/* Associated Tickets */}
          <Card
            title={t('associatedTickets')}
            subtitle="All corrective dispatches and customer reported faults"
            action={
              <Button
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={() => setIsTicketModalOpen(true)}
              >
                {t('createTicket')}
              </Button>
            }
          >
            {tickets.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No active or historical tickets on record for this machine.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {tickets.map(tck => (
                  <div
                    key={tck.id}
                    onClick={() => onNavigate('ticket-detail', tck.id)}
                    className="py-3.5 flex items-start justify-between gap-3 hover:bg-slate-800/30 px-2 rounded-lg cursor-pointer transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 mt-0.5">
                        <TicketIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-slate-100">{tck.ticketNumber}</span>
                          <StatusBadge type="priority" status={tck.priority} />
                          <StatusBadge type="ticket" status={tck.status} />
                        </div>
                        <p className="text-xs text-slate-300 mt-1">{tck.description}</p>
                        {tck.assignedTechnician && (
                          <span className="text-[11px] text-slate-400 mt-1 block">
                            Assigned Tech: <strong className="text-slate-200">{tck.assignedTechnician.employeeCode}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[11px] text-slate-400 block">{formatDate(tck.createdAt)}</span>
                      {tck.totalPartsCost > 0 && (
                        <span className="text-xs font-mono text-emerald-400">${tck.totalPartsCost}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Machine Spare Parts & Maintenance Component History */}
          <Card
            title="Component & Spare Part Replacements"
            subtitle={`Installed parts ledger (${partsHistory.length} recorded items)`}
          >
            {partsHistory.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                No spare parts have been installed on this machine to date.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-xs">
                  <span className="text-emerald-300 font-medium">Lifetime Machine Parts Cost:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    ${partsHistory.reduce((acc, p) => acc + (p.totalCost || 0), 0).toFixed(2)}
                  </span>
                </div>

                <div className="divide-y divide-slate-800/60 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-800 text-[11px]">
                        <th className="pb-2 font-medium">Part SKU & Name</th>
                        <th className="pb-2 font-medium text-center">Qty</th>
                        <th className="pb-2 font-medium">Unit / Total</th>
                        <th className="pb-2 font-medium">Ticket Ref</th>
                        <th className="pb-2 font-medium">Installed By</th>
                        <th className="pb-2 font-medium text-right">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                      {partsHistory.map((ph, idx) => (
                        <tr key={ph.id || idx} className="hover:bg-slate-800/30">
                          <td className="py-2.5">
                            <span className="font-mono font-bold text-slate-100 block">{ph.partNumber}</span>
                            <span className="text-[11px] text-slate-400">{ph.partName}</span>
                          </td>
                          <td className="py-2.5 text-center font-mono font-semibold text-blue-400">
                            {ph.quantity}x
                          </td>
                          <td className="py-2.5 font-mono text-slate-300">
                            <span>${(ph.unitCost || 0).toFixed(2)}</span>
                            <span className="text-[11px] text-emerald-400 block font-bold">${(ph.totalCost || 0).toFixed(2)}</span>
                          </td>
                          <td className="py-2.5 font-mono">
                            {ph.ticketId ? (
                              <button
                                onClick={() => onNavigate('ticket-detail', ph.ticketId)}
                                className="text-blue-400 hover:text-blue-300 underline cursor-pointer"
                              >
                                {ph.ticketNumber || 'Ticket'}
                              </button>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                          <td className="py-2.5 text-slate-300 text-[11px]">
                            {ph.installedBy || 'Technician'}
                          </td>
                          <td className="py-2.5 text-right font-mono text-slate-400 text-[11px]">
                            {formatDate(ph.installedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Printable QR Sticker Modal */}
      <Modal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        title="Printable QR Code Asset Label"
        subtitle="Standard high-adhesion outdoor vinyl sticker template"
        maxWidth="md"
      >
        <div className="space-y-6">
          {/* Printable Label Box */}
          <div className="p-6 bg-white rounded-2xl border-4 border-slate-950 text-slate-950 text-center shadow-2xl space-y-4">
            <div className="border-b-2 border-slate-950 pb-3">
              <div className="text-sm font-black tracking-wider uppercase text-slate-950">
                KING SAUD UNIVERSITY — CAMPUS FLEET
              </div>
              <div className="text-[11px] font-semibold text-slate-600">
                SMART VENDING INCIDENT REPORTING SYSTEM
              </div>
            </div>

            {/* QR Visual */}
            <div className="flex justify-center">
              <div className="w-48 h-48 border-4 border-slate-950 p-2.5 rounded-lg flex flex-col justify-between bg-white relative">
                <div className="flex justify-between">
                  <div className="w-10 h-10 bg-slate-950 p-1 flex items-center justify-center">
                    <div className="w-6 h-6 bg-white flex items-center justify-center">
                      <div className="w-3 h-3 bg-slate-950" />
                    </div>
                  </div>
                  <div className="w-10 h-10 bg-slate-950 p-1 flex items-center justify-center">
                    <div className="w-6 h-6 bg-white flex items-center justify-center">
                      <div className="w-3 h-3 bg-slate-950" />
                    </div>
                  </div>
                </div>

                <div className="text-center font-mono font-black text-sm tracking-wider bg-slate-950 text-white py-1 rounded">
                  {machine.machineNumber}
                </div>

                <div className="flex justify-between">
                  <div className="w-10 h-10 bg-slate-950 p-1 flex items-center justify-center">
                    <div className="w-6 h-6 bg-white flex items-center justify-center">
                      <div className="w-3 h-3 bg-slate-950" />
                    </div>
                  </div>
                  <div className="w-6 h-6 bg-slate-950 self-end" />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-lg font-black font-mono tracking-tight text-slate-950">
                {machine.machineNumber}
              </div>
              <div className="text-xs font-semibold text-slate-700">
                {machine.currentLocation?.fullDescription}
              </div>
            </div>

            <div className="border-t-2 border-slate-950 pt-2 text-[11px] font-medium text-slate-800">
              <p>Scan with phone camera to report stuck items or payment issues.</p>
              <p className="font-mono font-bold mt-0.5">Emergency Dispatch: +966-11-467-0000</p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsPrintModalOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              icon={Printer}
              onClick={printLabelNow}
            >
              Print Sticker
            </Button>
          </div>
        </div>
      </Modal>

      {/* Controlled Lifecycle Status Modal */}
      <Modal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        title="Transition Machine Lifecycle Status"
        subtitle={`Set controlled operational status for ${machine.machineNumber}`}
        maxWidth="md"
      >
        <form onSubmit={handleStatusChangeSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              New Status *
            </label>
            <select
              value={selectedNewStatus}
              onChange={e => setSelectedNewStatus(e.target.value as MachineStatus)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
            >
              <option value="OPERATIONAL">OPERATIONAL (Active fleet service)</option>
              <option value="WARNING">WARNING (Minor degradation or customer report)</option>
              <option value="UNDER_MAINTENANCE">UNDER MAINTENANCE (Technician on-site)</option>
              <option value="OUT_OF_SERVICE">OUT OF SERVICE (Major shutdown / awaiting parts)</option>
              <option value="DEACTIVATED">DEACTIVATED (Decommissioned / Retired)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Reason / Operational Notes *
            </label>
            <textarea
              required
              rows={3}
              value={statusChangeReason}
              onChange={e => setStatusChangeReason(e.target.value)}
              placeholder="e.g. Scheduled periodic maintenance or compressor overhaul..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsStatusModalOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isStatusSubmitting}
            >
              Confirm Status Transition
            </Button>
          </div>
        </form>
      </Modal>

      {/* Regenerate QR Code Modal */}
      <Modal
        isOpen={isRegenerateQrOpen}
        onClose={() => setIsRegenerateQrOpen(false)}
        title="Regenerate QR Code Identity"
        subtitle={`Generate a fresh public opaque QR identifier for ${machine.machineNumber}`}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-200 flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-amber-100">Notice: Existing physical stickers will be invalidated</span>
              <span className="text-[11px] text-amber-300/90">After regeneration, please print and apply a new sticker on the vending machine's front panel.</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Reason for QR Re-issue
            </label>
            <textarea
              rows={2}
              value={regenerateReason}
              onChange={e => setRegenerateReason(e.target.value)}
              placeholder="e.g. Physical sticker damaged or replaced door panel..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsRegenerateQrOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              icon={RefreshCw}
              isLoading={isRegeneratingQr}
              onClick={handleRegenerateQr}
            >
              Issue New QR Code
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modify / Edit Machine Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title={t('modifyMachine')}
        subtitle={`Update configuration, location or technical parameters for ${machine.machineNumber}`}
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
                placeholder="e.g. SN-2024-XXXXX (Leave empty if unassigned)"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
              />
              <div className="flex items-center gap-2 mt-1.5">
                <input
                  type="checkbox"
                  id="allowDuplicateSerial"
                  checked={editAllowDuplicateSerial}
                  onChange={e => setEditAllowDuplicateSerial(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-0"
                />
                <label htmlFor="allowDuplicateSerial" className="text-[11px] text-slate-400">
                  Allow duplicate serial number exception (controlled override)
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
                {locations.length > 0 ? (
                  locations.map(loc => (
                    <option key={loc.id} value={loc.id}>
                      {loc.building?.name || 'Building'} — {loc.floor?.floorName || 'Floor'} ({loc.areaZone || loc.id})
                    </option>
                  ))
                ) : (
                  <option value="">No locations available</option>
                )}
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
              onClick={() => setIsEditOpen(false)}
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

      {/* Delete Machine Confirmation Modal */}
      <Modal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        title={t('deleteMachine')}
        subtitle={`Confirm permanent removal of vending unit`}
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

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-2">
            <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
              <span className="text-slate-400">{t('machineNumber')}:</span>
              <span className="font-mono font-bold text-slate-100">{machine.machineNumber}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
              <span className="text-slate-400">{t('serialNumber')}:</span>
              <span className="font-mono text-slate-300">{machine.serialNumber || 'MISSING (UNASSIGNED)'}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
              <span className="text-slate-400">{t('machineType')}:</span>
              <span className="text-slate-300">{machine.machineType}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-400">{t('location')}:</span>
              <span className="text-slate-300 text-right truncate max-w-[200px]">
                {machine.currentLocation?.fullDescription}
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsDeleteOpen(false)}
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

      {/* New Maintenance Ticket Modal for this Machine */}
      <Modal
        isOpen={isTicketModalOpen}
        onClose={() => setIsTicketModalOpen(false)}
        title={`تسجيل تذكرة صيانة جديدة للماكينة ${machine.machineNumber}`}
        subtitle="إنشاء بلاغ عطل فني مرتبط مباشرة بهذه الماكينة في قاعدة البيانات"
        maxWidth="md"
      >
        <form onSubmit={handleCreateTicket} className="space-y-4">
          <div className="p-3 bg-blue-950/40 border border-blue-800/60 rounded-xl flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-400 block">رقم الماكينة المستهدفة:</span>
              <span className="font-mono font-bold text-blue-300 text-sm">{machine.machineNumber}</span>
            </div>
            <div className="text-right">
              <span className="text-slate-400 block">الموقع الحالي:</span>
              <span className="text-slate-200">{machine.currentLocation?.fullDescription || 'غير محدد'}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                تصنيف العطل *
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value as FaultCategory)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="REFRIGERATION">تبريد وتكييف (Refrigeration)</option>
                <option value="PAYMENT_SYSTEM">نظام الدفع والشبكة (Payment / MDB)</option>
                <option value="MOTOR_MECHANICAL">حركي وميكانيكي (Motor / Dispense)</option>
                <option value="ELECTRONICS">لوحة تحكم وإلكترونيات (Controller)</option>
                <option value="POWER">كهرباء وتغذية (Power Supply)</option>
                <option value="VANDALISM">تلف خارجي أو كسر (Physical Damage)</option>
                <option value="OTHER">أخرى (General Maintenance)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                درجة الأولوية *
              </label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as TicketPriority)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="CRITICAL">حرجة جداً (Critical - توقف كامل)</option>
                <option value="HIGH">عالية (High)</option>
                <option value="MEDIUM">متوسطة (Medium)</option>
                <option value="LOW">منخفضة (Low)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              وصف العطل الفني وملاحظات البلاغ *
            </label>
            <textarea
              required
              rows={4}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="اكتب تفاصيل المشكلة (مثال: محرك صرف العلب رقم 3 متوقف أو عطل قارئ بطاقات مدى)..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsTicketModalOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              icon={Plus}
              isLoading={isSubmitting}
              className="bg-amber-600 hover:bg-amber-700"
            >
              فتح تذكرة الصيانة
            </Button>
          </div>
        </form>
      </Modal>

      {/* Relocate Machine Modal */}
      <Modal
        isOpen={isRelocateOpen}
        onClose={() => setIsRelocateOpen(false)}
        title={`نقل الماكينة ${machine.machineNumber} إلى موقع جديد`}
        subtitle="تحديث الموقع الجغرافي للماكينة مع تسجيل حركة النقل في السجل التاريخي"
        maxWidth="md"
      >
        <form onSubmit={handleRelocate} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              الموقع المستهدف الجديد *
            </label>
            <select
              value={targetLocationId}
              onChange={e => setTargetLocationId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
            >
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>
                  {loc.building?.name || 'مبنى'} — {loc.floor?.floorName || 'دور'} ({loc.areaZone || loc.id})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              سبب النقل / ملاحظات الإدارة *
            </label>
            <textarea
              required
              rows={3}
              value={relocationReason}
              onChange={e => setRelocationReason(e.target.value)}
              placeholder="مثال: نقل الماكينة بناء على طلب إدارة الكلية لزيادة الإقبال..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsRelocateOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              icon={Move}
            >
              تأكيد نقل الماكينة
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

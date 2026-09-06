import React, { useState, useEffect } from 'react';
import {
  Wrench,
  Plus,
  Phone,
  Mail,
  Award,
  Clock,
  Activity,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  TrendingUp,
  Flame,
  Users,
  Check,
  Edit2,
  Trash2,
  Power,
  AlertTriangle
} from 'lucide-react';
import { DataTable, Column } from '../common/DataTable';
import { StatusBadge } from '../common/StatusBadge';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { ConfirmActionModal } from '../common/ConfirmActionModal';
import { useLanguage } from '../../context/LanguageContext';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { Technician, NavigationTab, TechnicianStatus } from '../../types';
import { api } from '../../services/api';

interface TechniciansViewProps {
  onNavigate: (tab: NavigationTab, id?: string) => void;
}

export const TechniciansView: React.FC<TechniciansViewProps> = ({ onNavigate }) => {
  const { t, isRTL } = useLanguage();
  const { showToast } = useNotification();
  const { canManageTechnicians, isAdmin } = useAuth();

  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [specFilter, setSpecFilter] = useState<string>('ALL');

  // Register Modal State
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [empCode, setEmpCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [fullNameAr, setFullNameAr] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('+966-50-');
  const [specialization, setSpecialization] = useState('Refrigeration & Cooling Specialist');
  const [maxCapacity, setMaxCapacity] = useState(5);
  const [assignedRegion, setAssignedRegion] = useState('Central Campus & Admin Complex');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Modal State
  const [editingTech, setEditingTech] = useState<Technician | null>(null);

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

  const loadTechs = async () => {
    try {
      setIsLoading(true);
      const data = await api.getTechnicians();
      setTechnicians(data);
    } catch {
      showToast(t('error'), 'Failed to load technicians', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTechs();

    const handleUpdate = () => {
      loadTechs();
    };

    window.addEventListener('vending-fleet-data-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('vending-fleet-data-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const handleRegisterTech = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empCode.trim()) return;

    setIsSubmitting(true);
    try {
      const created = await api.createTechnician({
        employeeCode: empCode.trim().toUpperCase(),
        fullName: fullName.trim() || empCode.trim(),
        fullNameAr: fullNameAr.trim() || fullName.trim(),
        email: email.trim() || undefined,
        phoneNumber: phone.trim(),
        specialization,
        maxDailyCapacity: Number(maxCapacity),
        assignedRegion,
        status: 'AVAILABLE'
      });

      showToast(t('success'), `تم تسجيل الفني بنجاح (${created.fullName || created.employeeCode}) وتم ربطه بالنظام`, 'success');
      setIsRegisterOpen(false);
      setEmpCode('');
      setFullName('');
      setFullNameAr('');
      setEmail('');
      setPhone('+966-50-');
      await loadTechs();
    } catch (err: any) {
      showToast(t('error'), err.message || 'فشل في حفظ بيانات الفني', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateTech = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTech) return;

    setIsSubmitting(true);
    try {
      const updated = await api.updateTechnician(editingTech.id, {
        fullName: editingTech.fullName,
        phoneNumber: editingTech.phoneNumber,
        specialization: editingTech.specialization,
        maxDailyCapacity: Number(editingTech.maxDailyCapacity),
        assignedRegion: editingTech.assignedRegion,
        status: editingTech.status
      });

      showToast(t('success'), `Technician ${updated.employeeCode} updated!`, 'success');
      setEditingTech(null);
      await loadTechs();
    } catch (err: any) {
      showToast(t('error'), err.message || 'Failed to update technician', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePromptToggleActive = async (tech: Technician) => {
    if (tech.isActive === false) {
      // Reactivate
      try {
        await api.reactivateTechnician(tech.id);
        showToast(t('success'), `Technician ${tech.employeeCode} reactivated!`, 'success');
        await loadTechs();
      } catch (err: any) {
        showToast(t('error'), err.message || 'Failed to reactivate technician', 'error');
      }
    } else {
      // Deactivate
      const refs = await api.checkTechnicianReferences(tech.id);
      setConfirmModal({
        isOpen: true,
        title: `Deactivate Technician: ${tech.employeeCode}`,
        description: `Are you sure you want to deactivate ${tech.fullName || tech.employeeCode}? They will no longer receive ticket dispatches.`,
        warningMessage: refs.activeTicketsCount > 0 ? `This technician currently has ${refs.activeTicketsCount} active tickets assigned.` : undefined,
        requireReason: true,
        isDeactivation: true,
        referenceCounts: refs.referenceCounts,
        onConfirm: async (reason?: string) => {
          await api.deactivateTechnician(tech.id, reason);
          showToast(t('success'), `Technician ${tech.employeeCode} deactivated!`, 'success');
          await loadTechs();
        }
      });
    }
  };

  const handlePromptDeleteTech = async (tech: Technician) => {
    const refs = await api.checkTechnicianReferences(tech.id);
    setConfirmModal({
      isOpen: true,
      title: `Delete Technician: ${tech.employeeCode}`,
      description: refs.canDelete
        ? `Are you sure you want to remove technician record ${tech.employeeCode}?`
        : `This technician has active assigned tickets (${refs.activeTicketsCount} active). You cannot delete an active technician. You can deactivate them instead.`,
      warningMessage: refs.canDelete ? 'This will archive the technician profile.' : 'Cannot delete technician with assigned open tickets.',
      requireReason: true,
      referenceCounts: refs.referenceCounts,
      isDeactivation: !refs.canDelete,
      onConfirm: async (reason?: string) => {
        if (refs.canDelete) {
          await api.deleteTechnician(tech.id, false, reason);
          showToast(t('success'), `Technician ${tech.employeeCode} deleted!`, 'success');
        } else {
          await api.deactivateTechnician(tech.id, reason);
          showToast(t('success'), `Technician ${tech.employeeCode} deactivated!`, 'success');
        }
        await loadTechs();
      }
    });
  };

  const filteredTechs = technicians.filter(tech => {
    if (statusFilter !== 'ALL' && tech.status !== statusFilter) return false;
    if (specFilter !== 'ALL' && !tech.specialization.includes(specFilter)) return false;
    return true;
  });

  // Calculate fleet-wide technician performance aggregations
  const totalAvailable = technicians.filter(t => t.status === 'AVAILABLE' && t.isActive !== false).length;
  const avgResponse = technicians.length > 0
    ? (technicians.reduce((acc, t) => acc + (t.kpis?.responseTimeMinutes || 15), 0) / technicians.length).toFixed(1)
    : '15.0';
  const avgRepair = technicians.length > 0
    ? (technicians.reduce((acc, t) => acc + (t.kpis?.repairTimeMinutes || 35), 0) / technicians.length).toFixed(1)
    : '35.0';
  const avgSla = technicians.length > 0
    ? (technicians.reduce((acc, t) => acc + (t.kpis?.slaComplianceRate || 95), 0) / technicians.length).toFixed(1)
    : '95.0';
  const avgFtf = technicians.length > 0
    ? (technicians.reduce((acc, t) => acc + (t.kpis?.firstTimeFixRate || 92), 0) / technicians.length).toFixed(1)
    : '92.0';

  const columns: Column<Technician>[] = [
    {
      key: 'employeeCode',
      header: t('employeeCode'),
      sortable: true,
      render: row => (
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg ${row.isActive === false ? 'bg-slate-800 text-slate-500 border border-slate-700' : 'bg-blue-600/20 border border-blue-500/30 text-blue-400'} flex items-center justify-center font-bold text-xs font-mono`}>
            {row.employeeCode.slice(-3)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-100 text-xs font-mono">{row.employeeCode}</span>
              {row.isActive === false && (
                <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 text-[9px] font-bold border border-amber-500/30">
                  DEACTIVATED
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400">{row.fullName || row.user?.fullName || row.employeeCode}</div>
          </div>
        </div>
      )
    },
    {
      key: 'specialization',
      header: t('specialization'),
      sortable: true,
      render: row => (
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-200">
            <Award className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="font-medium">{row.specialization}</span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">
            {row.assignedRegion || 'Central District'}
          </span>
        </div>
      )
    },
    {
      key: 'status',
      header: t('status'),
      sortable: true,
      render: row => (
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-bold font-mono ${
            row.isActive === false
              ? 'bg-slate-800 text-slate-500 border border-slate-700'
              : row.status === 'AVAILABLE'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
              : row.status === 'BUSY'
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
              : 'bg-slate-500/10 text-slate-400 border border-slate-500/30'
          }`}
        >
          {row.isActive === false ? 'INACTIVE' : row.status}
        </span>
      )
    },
    {
      key: 'activeTickets',
      header: t('kpiWorkload'),
      render: row => {
        const activeCount = row.kpis?.activeTicketsCount ?? (row.assignedTickets?.filter(t => !['RESOLVED', 'VERIFIED', 'CLOSED'].includes(t.status)).length || 0);
        const maxCap = row.maxDailyCapacity || row.maxActiveTickets || 5;
        const pct = Math.min(100, Math.round((activeCount / maxCap) * 100));

        return (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="font-bold text-slate-300">{activeCount} / {maxCap} Jobs</span>
              <span className="text-slate-500">{pct}%</span>
            </div>
            <div className="w-24 bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${pct >= 80 ? 'bg-rose-500' : pct >= 50 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      }
    },
    {
      key: 'kpis',
      header: 'Key Performance Indicators',
      render: row => (
        <div className="flex items-center gap-3 text-xs font-mono">
          <div title="Average Response Time" className="flex items-center gap-1 text-cyan-400">
            <Clock className="w-3 h-3 text-cyan-500" />
            <span>{row.kpis?.responseTimeMinutes || 15}m</span>
          </div>
          <div title="Average Repair Time" className="flex items-center gap-1 text-blue-400">
            <Wrench className="w-3 h-3 text-blue-500" />
            <span>{row.kpis?.repairTimeMinutes || 35}m</span>
          </div>
          <div title="First-Time Fix Rate" className="flex items-center gap-1 text-amber-400">
            <TrendingUp className="w-3 h-3 text-amber-500" />
            <span>{row.kpis?.firstTimeFixRate || 92}%</span>
          </div>
          <div title="SLA Compliance Rate" className="flex items-center gap-1 text-teal-400">
            <ShieldCheck className="w-3 h-3 text-teal-500" />
            <span>{row.kpis?.slaComplianceRate || 96}%</span>
          </div>
        </div>
      )
    },
    {
      key: 'actions',
      header: t('actions'),
      className: 'text-right rtl:text-left',
      render: row => (
        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => onNavigate('technician-detail', row.id)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors cursor-pointer"
            title="Open Technician Workstation"
          >
            <ExternalLink className="w-4 h-4" />
          </button>

          {canManageTechnicians && (
            <>
              <button
                onClick={() => setEditingTech({ ...row })}
                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors cursor-pointer"
                title="Edit Technician"
              >
                <Edit2 className="w-4 h-4" />
              </button>

              <button
                onClick={() => handlePromptToggleActive(row)}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  row.isActive === false ? 'text-amber-400 hover:bg-amber-500/20' : 'text-slate-400 hover:text-amber-400 hover:bg-slate-800'
                }`}
                title={row.isActive === false ? 'Reactivate Technician' : 'Deactivate Technician'}
              >
                <Power className="w-4 h-4" />
              </button>

              <button
                onClick={() => handlePromptDeleteTech(row)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                title="Delete Technician"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-400" />
            <span>{t('technicians')}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Field technical engineering team, certifications, audited KPIs, and live dispatch loads
          </p>
        </div>

        {canManageTechnicians && (
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => setIsRegisterOpen(true)}
          >
            Add Field Technician
          </Button>
        )}
      </div>

      {/* Fleet Technician KPIs Summary Banner */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active Field Force</span>
          <div className="text-2xl font-bold font-mono text-slate-100">
            {technicians.length} <span className="text-xs text-emerald-400 font-sans font-normal">({totalAvailable} Available)</span>
          </div>
          <p className="text-[10px] text-slate-500">Certified field specialists</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('kpiResponseTime')} (Avg)</span>
          <div className="text-2xl font-bold font-mono text-cyan-400">{avgResponse}m</div>
          <p className="text-[10px] text-slate-500">Dispatch acknowledgment</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('kpiRepairTime')} (Avg)</span>
          <div className="text-2xl font-bold font-mono text-blue-400">{avgRepair}m</div>
          <p className="text-[10px] text-slate-500">Labor MTTR on site</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('kpiFirstTimeFix')}</span>
          <div className="text-2xl font-bold font-mono text-amber-400">{avgFtf}%</div>
          <p className="text-[10px] text-slate-500">Resolved without repeat issue</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1 col-span-2 md:col-span-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('kpiSlaCompliance')}</span>
          <div className="text-2xl font-bold font-mono text-teal-400">{avgSla}%</div>
          <p className="text-[10px] text-slate-500">Tickets closed inside SLA</p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filteredTechs}
        isLoading={isLoading}
        searchPlaceholder={t('searchTechnicians')}
        onRowClick={row => onNavigate('technician-detail', row.id)}
        filterComponent={
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="AVAILABLE">Available</option>
              <option value="BUSY">Busy</option>
              <option value="ON_LEAVE">On Leave</option>
            </select>

            <select
              value={specFilter}
              onChange={e => setSpecFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">All Specializations</option>
              <option value="Refrigeration">Refrigeration & Cooling</option>
              <option value="Payment">Payment & Telemetry</option>
              <option value="Mechanical">Mechanical & Dispensing</option>
            </select>
          </div>
        }
      />

      {/* Register Technician Modal */}
      {isRegisterOpen && (
        <Modal
          isOpen={isRegisterOpen}
          onClose={() => setIsRegisterOpen(false)}
          title="Register Field Technician"
          maxWidth="md"
        >
          <form onSubmit={handleRegisterTech} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Employee Code / رمز الفني *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. TECH-4001"
                  value={empCode}
                  onChange={e => setEmpCode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Full Name (English / العربي) *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Tariq Al-Mansoor / طارق المنصور"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email Address / البريد الإلكتروني</label>
                <input
                  type="email"
                  placeholder="technician@company.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Contact Phone / رقم الجوال</label>
                <input
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Primary Specialization</label>
              <select
                value={specialization}
                onChange={e => setSpecialization(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="Refrigeration & Cooling Specialist">Refrigeration & Cooling Specialist</option>
                <option value="Payment Systems & IoT Telemetry">Payment Systems & IoT Telemetry</option>
                <option value="Mechanical Dispenser & Motor Tech">Mechanical Dispenser & Motor Tech</option>
                <option value="Senior Master Technician">Senior Master Technician</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Max Active Capacity</label>
                <input
                  type="number"
                  min="1"
                  max="15"
                  value={maxCapacity}
                  onChange={e => setMaxCapacity(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Assigned Region / Campus</label>
                <input
                  type="text"
                  value={assignedRegion}
                  onChange={e => setAssignedRegion(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsRegisterOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={isSubmitting}>
                Register Specialist
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Technician Modal */}
      {editingTech && (
        <Modal
          isOpen={!!editingTech}
          onClose={() => setEditingTech(null)}
          title={`Edit Technician ${editingTech.employeeCode}`}
          maxWidth="md"
        >
          <form onSubmit={handleUpdateTech} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Full Name *</label>
              <input
                required
                type="text"
                value={editingTech.fullName || ''}
                onChange={e => setEditingTech({ ...editingTech, fullName: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Phone Number</label>
                <input
                  type="text"
                  value={editingTech.phoneNumber || ''}
                  onChange={e => setEditingTech({ ...editingTech, phoneNumber: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Current Status</label>
                <select
                  value={editingTech.status}
                  onChange={e => setEditingTech({ ...editingTech, status: e.target.value as TechnicianStatus })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="AVAILABLE">Available</option>
                  <option value="BUSY">Busy</option>
                  <option value="ON_LEAVE">On Leave</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Primary Specialization</label>
              <select
                value={editingTech.specialization}
                onChange={e => setEditingTech({ ...editingTech, specialization: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="Refrigeration & Cooling Specialist">Refrigeration & Cooling Specialist</option>
                <option value="Payment Systems & IoT Telemetry">Payment Systems & IoT Telemetry</option>
                <option value="Mechanical Dispenser & Motor Tech">Mechanical Dispenser & Motor Tech</option>
                <option value="Senior Master Technician">Senior Master Technician</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Max Active Capacity</label>
                <input
                  type="number"
                  min="1"
                  max="15"
                  value={editingTech.maxDailyCapacity || 5}
                  onChange={e => setEditingTech({ ...editingTech, maxDailyCapacity: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Assigned Region</label>
                <input
                  type="text"
                  value={editingTech.assignedRegion || ''}
                  onChange={e => setEditingTech({ ...editingTech, assignedRegion: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditingTech(null)}>
                Cancel
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

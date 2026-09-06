import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Wrench,
  Phone,
  Mail,
  Award,
  Clock,
  Ticket as TicketIcon,
  CheckCircle2,
  Calendar,
  Activity,
  ShieldCheck,
  Package,
  Play,
  Check,
  AlertCircle,
  TrendingUp,
  Flame,
  Star,
  ExternalLink
} from 'lucide-react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { StatusBadge } from '../common/StatusBadge';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { useLanguage } from '../../context/LanguageContext';
import { useNotification } from '../../context/NotificationContext';
import { Technician, Ticket, TechnicianKPIs, NavigationTab } from '../../types';
import { api } from '../../services/api';

interface TechnicianDetailViewProps {
  technicianId: string;
  onNavigate: (tab: NavigationTab, id?: string) => void;
}

export const TechnicianDetailView: React.FC<TechnicianDetailViewProps> = ({ technicianId, onNavigate }) => {
  const { t, formatDate, formatNumber, isRTL } = useLanguage();
  const { showToast } = useNotification();
  const [tech, setTech] = useState<Technician | null>(null);
  const [kpis, setKpis] = useState<TechnicianKPIs | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [ticketTab, setTicketTab] = useState<'MY_TICKETS' | 'ASSIGNED' | 'IN_PROGRESS' | 'WAITING_PART' | 'COMPLETED'>('MY_TICKETS');

  const loadTechnicianData = async () => {
    try {
      setIsLoading(true);
      const allTechs = await api.getTechnicians();
      const found = allTechs.find(t => t.id === technicianId || t.employeeCode === technicianId) || null;
      setTech(found);

      if (found) {
        const [kpiData, allTickets] = await Promise.all([
          api.calculateTechnicianKPIs(found.id),
          api.getTickets()
        ]);

        setKpis(kpiData);
        const techTickets = allTickets.filter(t => t.assignedTechnicianId === found.id || t.assignedTechnician?.id === found.id);
        setTickets(techTickets);
      }
    } catch {
      showToast(t('error'), 'Failed to load technician dossier', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTechnicianData();
  }, [technicianId]);

  if (isLoading) {
    return <LoadingSpinner message="Retrieving technician dossier, operational metrics & KPI scorecard..." />;
  }

  if (!tech) {
    return (
      <div className="text-center py-16 bg-slate-900/40 rounded-xl border border-slate-800 p-8 max-w-xl mx-auto my-8">
        <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-100 mb-1">
          {isRTL ? 'الفني غير موجود' : 'Technician Not Found'}
        </h3>
        <p className="text-sm text-slate-400 mb-6">
          {isRTL ? 'لم يتم العثور على الفني المطلوب أو ربما تم حذفه.' : 'The requested technician could not be found or has been removed.'}
        </p>
        <button
          onClick={() => onNavigate('technicians')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors inline-flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{isRTL ? 'العودة لقائمة الفنيين' : 'Back to Technicians'}</span>
        </button>
      </div>
    );
  }

  // Quick action handlers
  const handleAcceptTicket = async (ticketId: string) => {
    try {
      await api.acceptTicket(ticketId, tech.id, `${tech.employeeCode} accepted ticket assignment.`);
      showToast(t('success'), 'Ticket accepted! SLA countdown active.', 'success');
      await loadTechnicianData();
    } catch {
      showToast(t('error'), 'Failed to accept ticket', 'error');
    }
  };

  const handleStartWork = async (ticketId: string) => {
    try {
      await api.startWork(ticketId, tech.id, `${tech.employeeCode} started on-site diagnostic repairs.`);
      showToast(t('success'), 'Work started: Status is now IN PROGRESS', 'success');
      await loadTechnicianData();
    } catch {
      showToast(t('error'), 'Failed to start work', 'error');
    }
  };

  // Filter tickets according to tabs
  const assignedTickets = tickets.filter(t => t.status === 'ASSIGNED');
  const inProgressTickets = tickets.filter(t => t.status === 'IN_PROGRESS');
  const waitingPartTickets = tickets.filter(t => t.status === 'WAITING_FOR_PART');
  const completedTickets = tickets.filter(t => ['RESOLVED', 'VERIFIED', 'CLOSED'].includes(t.status));
  const activeTickets = tickets.filter(t => !['RESOLVED', 'VERIFIED', 'CLOSED', 'CANCELLED'].includes(t.status));

  const getFilteredList = () => {
    switch (ticketTab) {
      case 'MY_TICKETS': return activeTickets;
      case 'ASSIGNED': return assignedTickets;
      case 'IN_PROGRESS': return inProgressTickets;
      case 'WAITING_PART': return waitingPartTickets;
      case 'COMPLETED': return completedTickets;
      default: return activeTickets;
    }
  };

  const currentDisplayTickets = getFilteredList();
  const maxCap = tech.maxDailyCapacity || tech.maxActiveTickets || 5;
  const loadPct = Math.min(100, Math.round((activeTickets.length / maxCap) * 100));

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onNavigate('technicians')}
          className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-slate-100 transition-colors cursor-pointer bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('technicians')}</span>
        </button>
      </div>

      {/* Header Profile Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 text-white flex items-center justify-center font-bold text-xl font-mono shadow-xl shadow-blue-500/20">
            {tech.employeeCode.slice(-3)}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold font-mono text-slate-100">{tech.fullName || tech.employeeCode}</h1>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                {tech.employeeCode}
              </span>
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-bold font-mono ${
                  tech.status === 'AVAILABLE'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : tech.status === 'BUSY'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    : 'bg-slate-500/10 text-slate-400 border border-slate-500/30'
                }`}
              >
                {tech.status}
              </span>
            </div>

            <p className="text-xs text-slate-300 mt-1.5 flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-400" />
              <span>{tech.specialization}</span>
              <span>•</span>
              <span className="text-slate-400">{tech.assignedRegion || 'Central Campus & Commercial District'}</span>
            </p>

            <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-400">
              <span className="flex items-center gap-1.5 font-mono">
                <Phone className="w-3.5 h-3.5 text-slate-500" />
                {tech.phoneNumber || '+966-50-5550123'}
              </span>
              {tech.skills && tech.skills.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">Skills:</span>
                  {tech.skills.slice(0, 3).map((sk, i) => (
                    <span key={i} className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                      {sk}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Workload Capacity Meter */}
        <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 min-w-[240px] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {t('kpiWorkload')}
            </span>
            <span className="text-xs font-mono font-bold text-slate-100">
              {activeTickets.length} / {maxCap} Jobs
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                loadPct >= 80 ? 'bg-rose-500' : loadPct >= 50 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${loadPct}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-400 block text-right font-mono">
            {loadPct}% Capacity Utilized
          </span>
        </div>
      </div>

      {/* KPI Scorecards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* KPI 1: Response Time */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {t('kpiResponseTime')}
            </span>
            <Clock className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-cyan-300">
            {kpis?.responseTimeMinutes || 15}m
          </div>
          <p className="text-[10px] text-slate-500">Average ticket acknowledgment</p>
        </div>

        {/* KPI 2: Repair Time */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {t('kpiRepairTime')}
            </span>
            <Wrench className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-blue-300">
            {kpis?.repairTimeMinutes || 35}m
          </div>
          <p className="text-[10px] text-slate-500">Average on-site repair duration</p>
        </div>

        {/* KPI 3: Completed Tickets */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {t('kpiCompletedTickets')}
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-300">
            {kpis?.completedTickets || completedTickets.length}
          </div>
          <p className="text-[10px] text-slate-500">Total verified repairs</p>
        </div>

        {/* KPI 4: First-Time Fix Rate */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {t('kpiFirstTimeFix')}
            </span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-300">
            {kpis?.firstTimeFixRate || 92.5}%
          </div>
          <p className="text-[10px] text-slate-500">Without repeat failure in 30d</p>
        </div>

        {/* KPI 5: SLA Compliance */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1 shadow-sm col-span-2 md:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {t('kpiSlaCompliance')}
            </span>
            <ShieldCheck className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-teal-300">
            {kpis?.slaComplianceRate || 96.0}%
          </div>
          <p className="text-[10px] text-slate-500">Delivered within SLA window</p>
        </div>
      </div>

      {/* Ticket Work Queues & Filters */}
      <Card
        title="Field Incident Queue & Work Orders"
        subtitle="Manage assigned maintenance tasks, acceptance, on-site repairs, and parts requests"
      >
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 pb-4 border-b border-slate-800">
          {[
            { id: 'MY_TICKETS', label: t('myTickets'), count: activeTickets.length },
            { id: 'ASSIGNED', label: t('assignedTickets'), count: assignedTickets.length },
            { id: 'IN_PROGRESS', label: 'In Progress', count: inProgressTickets.length },
            { id: 'WAITING_PART', label: 'Waiting for Part', count: waitingPartTickets.length },
            { id: 'COMPLETED', label: 'Completed Archive', count: completedTickets.length },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setTicketTab(tab.id as any)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
                ticketTab === tab.id
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                ticketTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Ticket List */}
        {currentDisplayTickets.length === 0 ? (
          <div className="py-12 text-center text-slate-500 italic text-xs space-y-1">
            <TicketIcon className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="font-semibold text-slate-400">No tickets in this work queue</p>
            <p className="text-[11px]">All dispatched assignments have been processed or moved to next stage.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60 mt-2">
            {currentDisplayTickets.map(tck => (
              <div
                key={tck.id}
                className="py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-slate-950/40 px-3 rounded-xl transition-colors group"
              >
                {/* Left side info */}
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span
                      onClick={() => onNavigate('ticket-detail', tck.id)}
                      className="font-mono font-bold text-xs text-blue-400 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      {tck.ticketNumber}
                      <ExternalLink className="w-3 h-3 text-slate-500" />
                    </span>
                    <StatusBadge type="priority" status={tck.priority} />
                    <StatusBadge type="ticket" status={tck.status} />
                    {tck.isRecurring && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                        <Flame className="w-2.5 h-2.5" />
                        {tck.recurringOccurrenceCount}x repeat
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-200 line-clamp-1">{tck.description}</p>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 font-mono">
                    <span className="text-slate-300 font-semibold">{tck.machine?.machineNumber || 'VM-UNKNOWN'}</span>
                    <span>•</span>
                    <span>{tck.location?.building?.name || 'Main Campus'} ({tck.location?.areaZone || 'Zone'})</span>
                    <span>•</span>
                    <span className="text-amber-400">SLA: {formatDate(tck.slaDueAt)}</span>
                  </div>
                </div>

                {/* Right side quick workflow triggers */}
                <div className="flex items-center gap-2 shrink-0">
                  {tck.status === 'ASSIGNED' && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        icon={Check}
                        onClick={() => handleAcceptTicket(tck.id)}
                      >
                        {t('acceptTicket')}
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        icon={Play}
                        onClick={() => handleStartWork(tck.id)}
                      >
                        {t('startWork')}
                      </Button>
                    </>
                  )}

                  {tck.status === 'IN_PROGRESS' && (
                    <Button
                      variant="primary"
                      size="sm"
                      icon={Wrench}
                      onClick={() => onNavigate('ticket-detail', tck.id)}
                    >
                      Open Repair Console
                    </Button>
                  )}

                  {tck.status === 'WAITING_FOR_PART' && (
                    <span className="text-[11px] font-mono text-amber-400 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/30 flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5" />
                      Warehouse Requisition Pending
                    </span>
                  )}

                  {['RESOLVED', 'VERIFIED', 'CLOSED'].includes(tck.status) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onNavigate('ticket-detail', tck.id)}
                    >
                      View Audit Dossier
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

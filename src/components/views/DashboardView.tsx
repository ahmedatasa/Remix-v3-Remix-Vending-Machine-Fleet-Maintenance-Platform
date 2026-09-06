import React, { useState, useEffect, useMemo } from 'react';
import {
  Cpu,
  Ticket,
  AlertTriangle,
  Clock,
  Activity,
  Package,
  Wrench,
  CheckCircle2,
  TrendingUp,
  AlertCircle,
  FileSpreadsheet,
  QrCode,
  ArrowRight,
  ShieldAlert,
  Users,
  DollarSign,
  Layers,
  Filter,
  RefreshCw,
  Download,
  BarChart3,
  Plus,
  Database,
  Trash2
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
  AreaChart,
  Area
} from 'recharts';
import { StatCard } from '../common/StatCard';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { StatusBadge } from '../common/StatusBadge';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { useLanguage } from '../../context/LanguageContext';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { NavigationTab } from '../../types';
import { api } from '../../services/api';
import { reportService, ReportFilterState } from '../../services/reportService';

interface DashboardViewProps {
  onNavigate: (tab: NavigationTab, id?: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { t, formatNumber, formatDate, formatCurrency, language } = useLanguage();
  const { showToast } = useNotification();
  const { canCreateTicket, canPurgeDatabase, canManageFleet, isReadOnly } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [fleetData, setFleetData] = useState<any>(null);
  const [filterState, setFilterState] = useState<ReportFilterState>({
    datePreset: 'all'
  });
  const [isPurging, setIsPurging] = useState(false);

  const handlePurgeVirtualData = async () => {
    if (!window.confirm('هل أنت متأكد من مسح جميع البيانات الافتراضية والبدء بصفحة نظيفة لاستقبال شيت الإكسيل؟')) {
      return;
    }
    try {
      setIsPurging(true);
      await api.clearVirtualDatabase(true);
      showToast('تم بنجاح', 'تم مسح جميع البيانات الافتراضية والأسطول الوهمي. يمكنك الآن رفع شيت الإكسيل.', 'success');
      await loadData();
    } catch (e: any) {
      showToast(t('error'), e.message || 'فشل مسح البيانات', 'error');
    } finally {
      setIsPurging(false);
    }
  };

  const loadData = async () => {
    try {
      setIsLoading(true);
      const data = await api.getAllFleetData();
      setFleetData(data);
    } catch (err) {
      console.error('Failed to load fleet dashboard data', err);
      showToast(t('error'), 'Failed to load telemetry data from PostgreSQL database.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleDataUpdate = () => {
      api.getAllFleetData().then(data => {
        setFleetData(data);
      }).catch(() => {});
    };

    window.addEventListener('vending-fleet-data-updated', handleDataUpdate);
    window.addEventListener('storage', handleDataUpdate);

    const interval = setInterval(() => {
      api.getAllFleetData().then(data => {
        setFleetData(data);
      }).catch(() => {});
    }, 4000);

    return () => {
      window.removeEventListener('vending-fleet-data-updated', handleDataUpdate);
      window.removeEventListener('storage', handleDataUpdate);
      clearInterval(interval);
    };
  }, []);

  // Compute live KPIs, Metrics, and Chart datasets from real PostgreSQL data
  const { kpis, metrics, charts, chronicMachines, recentTickets, technicianWorkloads } = useMemo(() => {
    if (!fleetData) {
      return {
        kpis: {
          totalMachines: 0,
          operationalMachines: 0,
          warningMachines: 0,
          underMaintenanceMachines: 0,
          outOfServiceMachines: 0,
          openTickets: 0,
          criticalTickets: 0,
          waitingPartsTickets: 0,
          techniciansCount: 0,
          lowStockPartsCount: 0
        },
        metrics: {
          mttrHours: 3.4,
          mtbfHours: 142,
          avgResponseTimeMinutes: 14.5,
          avgResolutionTimeHours: 3.2,
          firstTimeFixRate: 94.1,
          slaComplianceRate: 96.8,
          machineAvailability: 85.7,
          repeatFailureRate: 14.3,
          totalMaintenanceCost: 5120,
          totalLaborHours: 54.5,
          totalPartsCost: 2667.5,
          totalLaborCost: 2452.5
        },
        charts: {
          ticketsByStatus: [],
          ticketsByCategory: [],
          ticketsByLocation: [],
          ticketsByMachine: [],
          ticketsByMonth: [],
          technicianPerformance: [],
          sparePartsConsumption: []
        },
        chronicMachines: [],
        recentTickets: [],
        technicianWorkloads: []
      };
    }

    const { machines, tickets, spareParts, technicians, transactions, locations } = fleetData;

    // Filter tickets according to current date/scope filter
    const computedKpis = reportService.calculateKpis(machines, tickets, spareParts, technicians);
    const computedMetrics = reportService.calculateMetrics(machines, tickets, transactions);
    const computedCharts = reportService.generateChartData(tickets, spareParts, technicians, machines);

    // Identify chronic failure units (>= 2 tickets)
    const machineTicketCounts: Record<string, number> = {};
    tickets.forEach((tk: any) => {
      const mId = tk.machineId || tk.machine?.id;
      if (mId) machineTicketCounts[mId] = (machineTicketCounts[mId] || 0) + 1;
    });

    const chronics = machines
      .filter((m: any) => (machineTicketCounts[m.id] || 0) >= 2 || m.status === 'OUT_OF_SERVICE')
      .map((m: any) => {
        const mTickets = tickets.filter((tk: any) => tk.machineId === m.id);
        return {
          id: m.id,
          machineNumber: m.machineNumber,
          type: m.machineType,
          location: m.currentLocation?.fullDescription || 'Campus',
          status: m.status,
          failureCount: mTickets.length || 2,
          primaryFault: mTickets[0]?.category || 'REFRIGERATION',
          latestTicketId: mTickets[0]?.ticketNumber || 'TCK-2026-0001'
        };
      });

    const workloads = (technicians || []).filter((tech: any) => !tech.isDeleted && tech.isActive !== false).map((tech: any) => {
      const activeTickets = tickets.filter((t: any) => t.assignedTechnicianId === tech.id && !['RESOLVED', 'CLOSED'].includes(t.status)).length;
      return {
        id: tech.id,
        name: tech.fullName,
        code: tech.employeeCode,
        specialization: tech.specialization,
        status: tech.status,
        activeTickets,
        maxCapacity: tech.maxActiveTickets || 6
      };
    });

    return {
      kpis: computedKpis,
      metrics: computedMetrics,
      charts: computedCharts,
      chronicMachines: chronics,
      recentTickets: tickets.slice(0, 6),
      technicianWorkloads: workloads
    };
  }, [fleetData]);

  if (isLoading || !fleetData) {
    return <LoadingSpinner message="Querying real-time PostgreSQL telemetry & calculating reliability indices..." />;
  }

  return (
    <div className="space-y-6">
      {/* Top Header with Quick Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-slate-100">{t('dashboard')}</h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              قاعدة البيانات النشطة ({kpis.totalMachines} ماكينة)
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            مؤشرات أداء الأسطول الحقيقي، تذاكر الصيانة، المباني، وجاهزية الماكينات التشغيلية
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isReadOnly && canManageFleet && (
            <Button
              variant="outline"
              size="sm"
              icon={FileSpreadsheet}
              onClick={() => onNavigate('import-export')}
              className="text-xs text-blue-400 border-blue-500/30 hover:bg-blue-950/40"
            >
              رفع شيت إكسيل (Master)
            </Button>
          )}

          {canPurgeDatabase && kpis.totalMachines > 0 && (
            <Button
              variant="outline"
              size="sm"
              icon={Trash2}
              onClick={handlePurgeVirtualData}
              disabled={isPurging}
              className="text-xs text-rose-400 border-rose-500/30 hover:bg-rose-950/40 hover:text-rose-300"
            >
              {isPurging ? 'جاري المسح...' : 'مسح البيانات الافتراضية'}
            </Button>
          )}

          {canCreateTicket && !isReadOnly && (
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => onNavigate('tickets', 'new')}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
            >
              + تذكرة صيانة جديدة
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            icon={RefreshCw}
            onClick={loadData}
          >
            {t('refresh')}
          </Button>

          <Button
            variant="outline"
            size="sm"
            icon={BarChart3}
            onClick={() => onNavigate('reports')}
          >
            التقارير التنفيذية
          </Button>
        </div>
      </div>

      {/* 10 KPI Cards Grid */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Operational Fleet & Ticket KPIs (Real Database Metrics)
          </h4>
          <span className="text-[11px] text-slate-500">10 Core Telemetry Indicators</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {/* 1. Total Machines */}
          <StatCard
            title={t('totalMachines')}
            value={kpis.totalMachines}
            subValue="Registered Fleet Units"
            icon={Cpu}
            variant="blue"
            onClick={() => onNavigate('machines')}
          />

          {/* 2. Operational */}
          <StatCard
            title={t('statusOperational')}
            value={kpis.operationalMachines}
            subValue={`${Math.round((kpis.operationalMachines / Math.max(1, kpis.totalMachines)) * 100)}% Fleet Online`}
            icon={CheckCircle2}
            variant="emerald"
            onClick={() => onNavigate('machines')}
          />

          {/* 3. Warning */}
          <StatCard
            title={t('statusWarning')}
            value={kpis.warningMachines}
            subValue="Attention Needed"
            icon={AlertTriangle}
            variant="amber"
            onClick={() => onNavigate('machines')}
          />

          {/* 4. Under Maintenance */}
          <StatCard
            title={t('statusUnderMaintenance')}
            value={kpis.underMaintenanceMachines}
            subValue="Tech Assigned"
            icon={Wrench}
            variant="blue"
            onClick={() => onNavigate('maintenance')}
          />

          {/* 5. Out of Service */}
          <StatCard
            title={t('statusOutOfService')}
            value={kpis.outOfServiceMachines}
            subValue="Immediate Action"
            icon={ShieldAlert}
            variant="rose"
            onClick={() => onNavigate('machines')}
          />

          {/* 6. Open Tickets */}
          <StatCard
            title={t('openTickets')}
            value={kpis.openTickets}
            subValue="Active Incidents"
            icon={Ticket}
            variant="amber"
            onClick={() => onNavigate('tickets')}
          />

          {/* 7. Critical Tickets */}
          <StatCard
            title="Critical Tickets"
            value={kpis.criticalTickets}
            subValue="SLA: 4h Escalation"
            icon={AlertCircle}
            variant="rose"
            onClick={() => onNavigate('tickets')}
          />

          {/* 8. Waiting Parts */}
          <StatCard
            title="Waiting Parts"
            value={kpis.waitingPartsTickets}
            subValue="Requisition Active"
            icon={Package}
            variant="purple"
            onClick={() => onNavigate('part-requests')}
          />

          {/* 9. Technicians */}
          <StatCard
            title={t('technicians')}
            value={kpis.techniciansCount}
            subValue="Field Force Active"
            icon={Users}
            variant="emerald"
            onClick={() => onNavigate('technicians')}
          />

          {/* 10. Low Stock Parts */}
          <StatCard
            title={t('inventoryDeficit')}
            value={kpis.lowStockPartsCount}
            subValue="Below Min Safe Level"
            icon={Package}
            variant="rose"
            onClick={() => onNavigate('spare-parts')}
          />
        </div>
      </div>

      {/* 9 Calculated Reliability & Engineering Indices Banner */}
      <Card
        title="Reliability Engineering & Financial Indices"
        subtitle="Mathematical calculations derived directly from ticket lifecycles and parts inventory"
        action={
          <Button variant="ghost" size="sm" icon={ArrowRight} iconPosition="end" onClick={() => onNavigate('reports')}>
            Deep Analytics Hub
          </Button>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-800/80 pt-1">
          {/* MTTR */}
          <div className="px-2 py-1">
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">MTTR</span>
            <span className="text-base font-bold font-mono text-blue-400 mt-0.5 block">{metrics.mttrHours}h</span>
            <span className="text-[10px] text-slate-500">Mean Time To Repair</span>
          </div>

          {/* MTBF */}
          <div className="px-2 py-1">
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">MTBF</span>
            <span className="text-base font-bold font-mono text-emerald-400 mt-0.5 block">{metrics.mtbfHours}h</span>
            <span className="text-[10px] text-slate-500">Mean Time Between Failures</span>
          </div>

          {/* Avg Response Time */}
          <div className="px-2 py-1">
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">Avg Response</span>
            <span className="text-base font-bold font-mono text-indigo-400 mt-0.5 block">{metrics.avgResponseTimeMinutes}m</span>
            <span className="text-[10px] text-slate-500">Triage & Acceptance</span>
          </div>

          {/* Avg Resolution Time */}
          <div className="px-2 py-1">
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">Resolution Time</span>
            <span className="text-base font-bold font-mono text-sky-400 mt-0.5 block">{metrics.avgResolutionTimeHours}h</span>
            <span className="text-[10px] text-slate-500">End-to-End Fix Time</span>
          </div>

          {/* First-Time Fix Rate */}
          <div className="px-2 py-1">
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">First-Time Fix</span>
            <span className="text-base font-bold font-mono text-emerald-400 mt-0.5 block">{metrics.firstTimeFixRate}%</span>
            <span className="text-[10px] text-slate-500">Zero Repeat Visit</span>
          </div>

          {/* SLA Compliance */}
          <div className="px-2 py-1">
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">SLA Compliance</span>
            <span className="text-base font-bold font-mono text-teal-400 mt-0.5 block">{metrics.slaComplianceRate}%</span>
            <span className="text-[10px] text-slate-500">Target: 95.0%</span>
          </div>

          {/* Machine Availability */}
          <div className="px-2 py-1">
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">Availability</span>
            <span className="text-base font-bold font-mono text-amber-400 mt-0.5 block">{metrics.machineAvailability}%</span>
            <span className="text-[10px] text-slate-500">Fleet Uptime</span>
          </div>

          {/* Repeat Failure Rate */}
          <div className="px-2 py-1">
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">Repeat Failure</span>
            <span className="text-base font-bold font-mono text-rose-400 mt-0.5 block">{metrics.repeatFailureRate}%</span>
            <span className="text-[10px] text-slate-500">Chronic Defect Rate</span>
          </div>

          {/* Maintenance Cost */}
          <div className="px-2 py-1">
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">Maint. Cost</span>
            <span className="text-base font-bold font-mono text-emerald-400 mt-0.5 block">${metrics.totalMaintenanceCost}</span>
            <span className="text-[10px] text-slate-500">Parts + Field Labor</span>
          </div>
        </div>
      </Card>

      {/* Quick Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            {t('quickActions')}:
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canCreateTicket && !isReadOnly && (
            <Button
              variant="primary"
              size="sm"
              icon={Ticket}
              onClick={() => onNavigate('tickets', 'new')}
            >
              {t('newTicket')}
            </Button>
          )}

          {!isReadOnly && canManageFleet && (
            <Button
              variant="secondary"
              size="sm"
              icon={Cpu}
              onClick={() => onNavigate('machines')}
            >
              {t('registerMachine')}
            </Button>
          )}

          {!isReadOnly && canManageFleet && (
            <Button
              variant="outline"
              size="sm"
              icon={FileSpreadsheet}
              onClick={() => onNavigate('import-export')}
            >
              {t('importExcel')}
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            icon={QrCode}
            onClick={() => onNavigate('public-portal')}
          >
            {t('publicPortal')}
          </Button>

          {canPurgeDatabase && kpis.totalMachines > 0 && (
            <Button
              variant="outline"
              size="sm"
              icon={Trash2}
              onClick={handlePurgeVirtualData}
              disabled={isPurging}
              className="text-rose-400 border-rose-500/30 hover:bg-rose-950/40"
            >
              مسح البيانات الافتراضية
            </Button>
          )}
        </div>
      </div>

      {/* Empty Database Onboarding Banner */}
      {kpis.totalMachines === 0 && (
        <div className="p-6 rounded-2xl bg-gradient-to-r from-blue-950/60 to-slate-900 border border-blue-500/30 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center mx-auto">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div className="max-w-xl mx-auto space-y-1">
            <h3 className="text-lg font-bold text-slate-100">قاعدة البيانات جاهزة ونظيفة لاستقبال بياناتك الحقيقية</h3>
            <p className="text-xs text-slate-300">
              تم مسح البيانات الافتراضية بالكامل. يمكنك الآن رفع شيت إكسيل (Excel Master Sheet) للماكينات والمباني أو تسجيل ماكينة جديدة مباشرة.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button
              variant="primary"
              size="md"
              icon={FileSpreadsheet}
              onClick={() => onNavigate('import-export')}
              className="bg-blue-600 hover:bg-blue-700 font-bold"
            >
              الانتقال إلى صفحة رفع شيت إكسيل
            </Button>
            <Button
              variant="secondary"
              size="md"
              icon={Plus}
              onClick={() => onNavigate('machines')}
            >
              إضافة ماكينة يدوياً
            </Button>
          </div>
        </div>
      )}

      {/* CHARTS ROW 1: Status Donut + Category Breakdown + Location Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: Tickets by Status */}
        <Card title="1. Tickets by Status" subtitle="Breakdown of active vs completed tickets">
          <div className="h-64 flex flex-col justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={charts.ticketsByStatus}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="count"
                >
                  {charts.ticketsByStatus.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                />
                <Legend
                  formatter={(val) => <span className="text-xs text-slate-300">{val}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Chart 2: Tickets by Category */}
        <Card title="2. Tickets by Category" subtitle="Primary fault drivers & subsystem failures">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.ticketsByCategory} layout="vertical" margin={{ left: 10, right: 20, top: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" horizontal={false} />
                <XAxis type="number" stroke="#64748B" fontSize={11} />
                <YAxis dataKey="name" type="category" stroke="#94A3B8" fontSize={10} width={90} tickFormatter={(v) => v.split(' ')[0]} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                />
                <Bar dataKey="count" fill="#3B82F6" radius={[0, 4, 4, 0]} name="Ticket Count" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Chart 3: Tickets by Location */}
        <Card title="3. Tickets by Location" subtitle="Campus building breakdown distribution">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.ticketsByLocation} margin={{ top: 10, right: 10, left: -15, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="name" stroke="#94A3B8" fontSize={9} angle={-25} textAnchor="end" />
                <YAxis stroke="#64748B" fontSize={10} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
                />
                <Bar dataKey="count" fill="#10B981" radius={[4, 4, 0, 0]} name="Tickets" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* CHARTS ROW 2: Tickets by Machine + Tickets by Month + Technician Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 4: Tickets by Machine */}
        <Card title="4. Tickets by Machine" subtitle="Highest failure / maintenance units">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.ticketsByMachine} margin={{ top: 10, right: 10, left: -15, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="machineNumber" stroke="#94A3B8" fontSize={9} angle={-20} textAnchor="end" />
                <YAxis stroke="#64748B" fontSize={10} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                />
                <Bar dataKey="count" fill="#F59E0B" radius={[4, 4, 0, 0]} name="Incidents" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Chart 5: Tickets by Month */}
        <Card title="5. Tickets by Month" subtitle="Monthly incident volume & resolutions">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={charts.ticketsByMonth} margin={{ top: 10, right: 10, left: -15, bottom: 10 }}>
                <defs>
                  <linearGradient id="colorTickets" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorResolved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="month" stroke="#64748B" fontSize={11} />
                <YAxis stroke="#64748B" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                />
                <Legend />
                <Area type="monotone" dataKey="tickets" stroke="#3B82F6" fillOpacity={1} fill="url(#colorTickets)" name="Logged Tickets" />
                <Area type="monotone" dataKey="resolved" stroke="#10B981" fillOpacity={1} fill="url(#colorResolved)" name="Resolved Fixes" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Chart 6: Technician Performance */}
        <Card title="6. Technician Performance" subtitle="Completed tickets vs SLA compliance %">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.technicianPerformance} margin={{ top: 10, right: 10, left: -15, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="name" stroke="#94A3B8" fontSize={10} />
                <YAxis stroke="#64748B" fontSize={10} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
                />
                <Legend />
                <Bar dataKey="completed" fill="#8B5CF6" radius={[4, 4, 0, 0]} name="Completed" />
                <Bar dataKey="slaRate" fill="#10B981" radius={[4, 4, 0, 0]} name="SLA %" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* CHARTS ROW 3: Chart 7 Spare Parts Consumption + Chronic Failures Alert */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 7: Spare Parts Consumption */}
        <Card
          title="7. Spare Parts Consumption"
          subtitle="Top components used and cumulative inventory expense ($)"
          action={
            <Button variant="ghost" size="sm" icon={ArrowRight} iconPosition="end" onClick={() => onNavigate('spare-parts')}>
              {t('viewAll')}
            </Button>
          }
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.sparePartsConsumption.slice(0, 5)} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="partNumber" stroke="#94A3B8" fontSize={10} />
                <YAxis yAxisId="left" orientation="left" stroke="#3B82F6" fontSize={10} />
                <YAxis yAxisId="right" orientation="right" stroke="#10B981" fontSize={10} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
                  formatter={(val, name) => [name === 'Total Cost ($)' ? `$${val}` : val, name]}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="usedQty" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Units Consumed" />
                <Bar yAxisId="right" dataKey="totalCost" fill="#10B981" radius={[4, 4, 0, 0]} name="Total Cost ($)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Chronic Failures & Recurring Defect Alert */}
        <Card
          title="Chronic Breakdown & Fatigue Watchlist"
          subtitle="Hardware units with repeat incidents in active operating cycles"
          action={
            <Button variant="ghost" size="sm" icon={ArrowRight} iconPosition="end" onClick={() => onNavigate('reports')}>
              Full Root Cause Report
            </Button>
          }
        >
          <div className="space-y-3">
            {chronicMachines.map((mch: any, idx: number) => (
              <div key={idx} className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition-colors flex items-start gap-3">
                <div className={`p-2 rounded-lg shrink-0 ${mch.status === 'OUT_OF_SERVICE' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'}`}>
                  {mch.status === 'OUT_OF_SERVICE' ? <ShieldAlert className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-xs font-mono font-bold text-slate-100">{mch.machineNumber}</span>
                      <StatusBadge type="machine" status={mch.status} />
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-500/20 text-rose-300 shrink-0">
                      {mch.failureCount} Failures
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 mt-1 truncate">
                    {mch.location} • <span className="text-blue-400">{mch.primaryFault}</span>
                  </p>

                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onNavigate('machine-detail', mch.id)}
                    >
                      Inspect Machine
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Technician Live Workloads & Recent Dispatches */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Technician Live Workload Capacity */}
        <Card
          title={t('technicianWorkloads')}
          subtitle="Real-time ticket load vs max shift capacity"
          action={
            <Button variant="ghost" size="sm" icon={ArrowRight} iconPosition="end" onClick={() => onNavigate('technicians')}>
              {t('viewAll')}
            </Button>
          }
        >
          <div className="space-y-4">
            {technicianWorkloads.map((tech: any) => {
              const pct = Math.min(100, Math.round((tech.activeTickets / tech.maxCapacity) * 100));
              return (
                <div key={tech.id} className="p-3 rounded-xl bg-slate-950/40 border border-slate-800">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-mono font-bold">
                        {tech.name.split(' ')[0]?.[0] || 'T'}
                      </div>
                      <div>
                        <h5 className="text-xs font-bold text-slate-200">{tech.name} ({tech.code})</h5>
                        <span className="text-[10px] text-slate-400">{tech.specialization}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono font-bold text-slate-100">
                        {tech.activeTickets} / {tech.maxCapacity}
                      </span>
                      <span className="text-[10px] text-slate-400 block">tickets</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        pct >= 80 ? 'bg-rose-500' : pct >= 50 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Live Recent Activity Feed */}
        <Card
          title={t('recentActivity')}
          subtitle="Live stream of dispatches, diagnostics and resolution updates"
          action={
            <Button variant="ghost" size="sm" icon={ArrowRight} iconPosition="end" onClick={() => onNavigate('tickets')}>
              {t('viewAll')}
            </Button>
          }
        >
          <div className="divide-y divide-slate-800/60 max-h-96 overflow-y-auto pr-1">
            {recentTickets.map((tck: any) => (
              <div
                key={tck.id}
                onClick={() => onNavigate('ticket-detail', tck.id)}
                className="py-2.5 flex items-center justify-between gap-3 hover:bg-slate-800/30 px-2 rounded-lg cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 shrink-0">
                    <Ticket className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono font-bold text-slate-100">{tck.ticketNumber}</span>
                      <StatusBadge type="priority" status={tck.priority} />
                      <StatusBadge type="ticket" status={tck.status} />
                    </div>
                    <p className="text-xs text-slate-300 line-clamp-1 mt-0.5">{tck.description}</p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[10px] text-slate-400 block">{formatDate(tck.createdAt)}</span>
                  <span className="text-[10px] text-blue-400">{tck.machine?.machineNumber}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

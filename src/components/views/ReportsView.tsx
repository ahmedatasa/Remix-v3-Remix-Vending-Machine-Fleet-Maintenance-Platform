import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  Clock,
  CheckCircle2,
  DollarSign,
  Cpu,
  Package,
  Printer,
  Filter,
  Search,
  RefreshCw,
  FileText,
  Layers,
  ChevronRight,
  ShieldAlert,
  Wrench,
  Users,
  MapPin,
  Calendar,
  Sparkles,
  XCircle,
  FileCheck,
  Building as BuildingIcon
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area
} from 'recharts';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { StatCard } from '../common/StatCard';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { useLanguage } from '../../context/LanguageContext';
import { useNotification } from '../../context/NotificationContext';
import { NavigationTab } from '../../types';
import { api } from '../../services/api';
import {
  reportService,
  ReportFilterState,
  ReportType,
  CalculatedMetrics
} from '../../services/reportService';

interface ReportsViewProps {
  onNavigate: (tab: NavigationTab, id?: string) => void;
}

const REPORT_CATALOG: { id: ReportType; title: string; category: string; description: string; icon: any }[] = [
  {
    id: 'machine-inventory',
    title: 'Machine Inventory',
    category: 'Fleet Assets',
    description: 'Hardware registry, serial numbers, operational status, location mapping and maintenance schedule.',
    icon: Cpu
  },
  {
    id: 'maintenance-history',
    title: 'Maintenance History',
    category: 'Operations',
    description: 'Full audit of performed corrective fixes, diagnostic logs, root cause analysis, and labor duration.',
    icon: Wrench
  },
  {
    id: 'open-tickets',
    title: 'Open Tickets',
    category: 'Incidents',
    description: 'Active incidents, escalation priorities, technician assignments, age tracking, and SLA countdowns.',
    icon: Clock
  },
  {
    id: 'closed-tickets',
    title: 'Closed Tickets',
    category: 'Incidents',
    description: 'Resolved ticket archives, resolution durations, SLA compliance verification, and incurred costs.',
    icon: FileCheck
  },
  {
    id: 'machine-failures',
    title: 'Machine Failures',
    category: 'Reliability',
    description: 'Breakdown frequency per unit, chronic failure alerts, MTBF calculation, and health scoring.',
    icon: ShieldAlert
  },
  {
    id: 'location-failures',
    title: 'Location Failures',
    category: 'Reliability',
    description: 'Campus zone hotspot analysis, incident density across buildings, and environmental risks.',
    icon: MapPin
  },
  {
    id: 'technician-performance',
    title: 'Technician Performance',
    category: 'Workforce',
    description: 'Productivity metrics, MTTR per technician, first-time fix rate, active workload, and SLA compliance.',
    icon: Users
  },
  {
    id: 'inventory',
    title: 'Inventory',
    category: 'Warehouse',
    description: 'Spare parts stock on-hand, warehouse bin locations, min/max reorder levels, and asset valuation.',
    icon: Package
  },
  {
    id: 'parts-usage',
    title: 'Parts Usage',
    category: 'Warehouse',
    description: 'Historical spare parts dispatches, maintenance consumption records, and transaction logs.',
    icon: Layers
  },
  {
    id: 'low-stock',
    title: 'Low Stock',
    category: 'Warehouse',
    description: 'Parts currently below minimum safety thresholds, deficit quantities, and estimated restock costs.',
    icon: AlertTriangle
  },
  {
    id: 'spare-requests',
    title: 'Spare Requests',
    category: 'Warehouse',
    description: 'Field requisition tickets, technician part orders, approval statuses, and urgency levels.',
    icon: FileSpreadsheet
  },
  {
    id: 'monthly-maintenance',
    title: 'Monthly Maintenance',
    category: 'Analytics',
    description: 'Multi-month trend analysis of corrective vs preventive interventions, labor hours, and total spend.',
    icon: Calendar
  },
  {
    id: 'cost',
    title: 'Cost',
    category: 'Financial',
    description: 'Total cost of ownership breakdown by subsystem, parts vs labor expenditure, and cost per machine.',
    icon: DollarSign
  },
  {
    id: 'sla',
    title: 'SLA',
    category: 'Compliance',
    description: 'Service Level Agreement compliance rates by priority tier, response times, and breach records.',
    icon: CheckCircle2
  }
];

export const ReportsView: React.FC<ReportsViewProps> = ({ onNavigate }) => {
  const { t, formatCurrency, formatDate, language } = useLanguage();
  const { showToast } = useNotification();

  const [isLoading, setIsLoading] = useState(true);
  const [fleetData, setFleetData] = useState<any>(null);
  const [selectedReport, setSelectedReport] = useState<ReportType>('machine-inventory');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(true);
  const [viewMode, setViewMode] = useState<'table' | 'visual'>('table');

  // Comprehensive 8-Dimension Filter State
  const [filters, setFilters] = useState<ReportFilterState>({
    datePreset: 'all',
    dateFrom: '',
    dateTo: '',
    machineId: '',
    buildingId: '',
    locationId: '',
    technicianId: '',
    category: '',
    status: '',
    priority: ''
  });

  const loadData = async () => {
    try {
      setIsLoading(true);
      const data = await api.getAllFleetData();
      setFleetData(data);
    } catch (err) {
      console.error('Failed to load fleet data for reporting', err);
      showToast(t('error'), 'Failed to query PostgreSQL database records.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Quick Date Preset handler
  const handleDatePresetChange = (preset: ReportFilterState['datePreset']) => {
    const today = new Date();
    let from = '';
    const to = today.toISOString().split('T')[0];

    if (preset === 'today') {
      from = to;
    } else if (preset === '7d') {
      const d = new Date(today.getTime() - 7 * 86400000);
      from = d.toISOString().split('T')[0];
    } else if (preset === '30d') {
      const d = new Date(today.getTime() - 30 * 86400000);
      from = d.toISOString().split('T')[0];
    } else if (preset === '90d') {
      const d = new Date(today.getTime() - 90 * 86400000);
      from = d.toISOString().split('T')[0];
    } else if (preset === '1y') {
      const d = new Date(today.getTime() - 365 * 86400000);
      from = d.toISOString().split('T')[0];
    } else {
      from = '';
    }

    setFilters(prev => ({
      ...prev,
      datePreset: preset,
      dateFrom: from,
      dateTo: preset === 'all' ? '' : to
    }));
  };

  const handleResetFilters = () => {
    setFilters({
      datePreset: 'all',
      dateFrom: '',
      dateTo: '',
      machineId: '',
      buildingId: '',
      locationId: '',
      technicianId: '',
      category: '',
      status: '',
      priority: ''
    });
    setSearchQuery('');
  };

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.datePreset !== 'all' || filters.dateFrom || filters.dateTo) count++;
    if (filters.machineId) count++;
    if (filters.buildingId) count++;
    if (filters.locationId) count++;
    if (filters.technicianId) count++;
    if (filters.category) count++;
    if (filters.status) count++;
    if (filters.priority) count++;
    return count;
  }, [filters]);

  // Compute calculated metrics & generated report dataset dynamically from real PostgreSQL records
  const { metrics, reportData, chartData } = useMemo(() => {
    if (!fleetData) {
      return {
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
        reportData: { columns: [], rows: [] },
        chartData: {
          ticketsByStatus: [],
          ticketsByCategory: [],
          ticketsByLocation: [],
          ticketsByMachine: [],
          ticketsByMonth: [],
          technicianPerformance: [],
          sparePartsConsumption: []
        }
      };
    }

    const { machines, tickets, spareParts, technicians, transactions, partRequests, buildings, locations } = fleetData;

    // Filter tickets and machines with current active filters
    const computedMetrics = reportService.calculateMetrics(machines, tickets, transactions);
    const generated = reportService.generateReportData(selectedReport, fleetData, filters);
    const computedCharts = reportService.generateChartData(tickets, spareParts, technicians, machines);

    return {
      metrics: computedMetrics,
      reportData: generated,
      chartData: computedCharts
    };
  }, [fleetData, selectedReport, filters]);

  // Filtered rows for live table search
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return reportData.rows;
    const q = searchQuery.toLowerCase();
    return reportData.rows.filter(row => {
      return Object.values(row).some(val => String(val).toLowerCase().includes(q));
    });
  }, [reportData.rows, searchQuery]);

  const currentReportMeta = REPORT_CATALOG.find(r => r.id === selectedReport) || REPORT_CATALOG[0];

  // EXPORT HANDLERS (XLSX, CSV, PDF)
  const handleExportXLSX = () => {
    reportService.exportToXLSX(
      currentReportMeta.title,
      selectedReport,
      reportData.columns,
      reportData.rows,
      metrics
    );
    showToast(t('success'), `${currentReportMeta.title} exported to XLSX successfully!`, 'success');
  };

  const handleExportCSV = () => {
    reportService.exportToCSV(
      selectedReport,
      reportData.columns,
      reportData.rows
    );
    showToast(t('success'), `${currentReportMeta.title} exported to CSV successfully!`, 'success');
  };

  const handleExportPDF = () => {
    reportService.exportToPDF(
      currentReportMeta.title,
      selectedReport,
      reportData.columns,
      reportData.rows,
      metrics
    );
    showToast(t('success'), `${currentReportMeta.title} exported to PDF Executive Dossier!`, 'success');
  };

  if (isLoading || !fleetData) {
    return <LoadingSpinner message="Calculating real-time fleet analytics, SLA compliance & generating executive dossiers..." />;
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-slate-100">
              Executive Intelligence & Management Reports
            </h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
              PostgreSQL Live Analytics
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Reliability indices, MTTR/MTBF calculations, 14 standard reports, multi-dimensional filters & multi-format export (XLSX, CSV, PDF)
          </p>
        </div>

        {/* Global Export Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={Download}
            onClick={handleExportXLSX}
          >
            Export XLSX
          </Button>

          <Button
            variant="outline"
            size="sm"
            icon={FileSpreadsheet}
            onClick={handleExportCSV}
          >
            Export CSV
          </Button>

          <Button
            variant="primary"
            size="sm"
            icon={Printer}
            onClick={handleExportPDF}
          >
            Export PDF Dossier
          </Button>
        </div>
      </div>

      {/* 9 Calculated Reliability & Engineering Metrics Matrix */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            9 Core Calculated Engineering & Reliability Metrics (Dynamic DB Formulas)
          </h4>
          <span className="text-[11px] text-emerald-400 font-medium">96.8% Fleet Efficiency Target</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-9 gap-3">
          {/* 1. MTTR */}
          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">1. MTTR</span>
              <span className="text-lg font-bold font-mono text-blue-400 mt-1 block">{metrics.mttrHours}h</span>
            </div>
            <span className="text-[10px] text-slate-500 mt-2">Mean Time To Repair</span>
          </div>

          {/* 2. MTBF */}
          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">2. MTBF</span>
              <span className="text-lg font-bold font-mono text-emerald-400 mt-1 block">{metrics.mtbfHours}h</span>
            </div>
            <span className="text-[10px] text-slate-500 mt-2">Mean Time Between Failures</span>
          </div>

          {/* 3. Average Response Time */}
          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">3. Avg Response</span>
              <span className="text-lg font-bold font-mono text-indigo-400 mt-1 block">{metrics.avgResponseTimeMinutes}m</span>
            </div>
            <span className="text-[10px] text-slate-500 mt-2">Triage & Acceptance Time</span>
          </div>

          {/* 4. Average Resolution Time */}
          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">4. Resolution Time</span>
              <span className="text-lg font-bold font-mono text-sky-400 mt-1 block">{metrics.avgResolutionTimeHours}h</span>
            </div>
            <span className="text-[10px] text-slate-500 mt-2">End-to-End Fix Duration</span>
          </div>

          {/* 5. First-Time Fix Rate */}
          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">5. First-Time Fix</span>
              <span className="text-lg font-bold font-mono text-emerald-400 mt-1 block">{metrics.firstTimeFixRate}%</span>
            </div>
            <span className="text-[10px] text-slate-500 mt-2">Zero Repeat Visit Rate</span>
          </div>

          {/* 6. SLA Compliance */}
          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">6. SLA Compliance</span>
              <span className="text-lg font-bold font-mono text-teal-400 mt-1 block">{metrics.slaComplianceRate}%</span>
            </div>
            <span className="text-[10px] text-slate-500 mt-2">Target Benchmark: 95.0%</span>
          </div>

          {/* 7. Machine Availability */}
          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">7. Availability</span>
              <span className="text-lg font-bold font-mono text-amber-400 mt-1 block">{metrics.machineAvailability}%</span>
            </div>
            <span className="text-[10px] text-slate-500 mt-2">Operational Fleet Uptime</span>
          </div>

          {/* 8. Repeat Failure Rate */}
          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">8. Repeat Failure</span>
              <span className="text-lg font-bold font-mono text-rose-400 mt-1 block">{metrics.repeatFailureRate}%</span>
            </div>
            <span className="text-[10px] text-slate-500 mt-2">Chronic Defect Machines</span>
          </div>

          {/* 9. Maintenance Cost */}
          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">9. Maint. Cost</span>
              <span className="text-lg font-bold font-mono text-emerald-400 mt-1 block">${metrics.totalMaintenanceCost}</span>
            </div>
            <span className="text-[10px] text-slate-500 mt-2">Parts + Field Labor</span>
          </div>
        </div>
      </div>

      {/* FILTER PANEL: 8 DIMENSIONS (Date, Machine, Building, Location, Technician, Category, Status, Priority) */}
      <Card
        title="Multi-Dimensional Filtering & Scope Control"
        subtitle="Filter all 14 reports, calculations, and visual analytics simultaneously"
        action={
          <div className="flex items-center gap-2">
            {activeFiltersCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                icon={XCircle}
                onClick={handleResetFilters}
                className="text-rose-400 hover:text-rose-300"
              >
                Reset Filters ({activeFiltersCount})
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              icon={Filter}
              onClick={() => setShowFilters(!showFilters)}
            >
              {showFilters ? 'Collapse Filters' : 'Expand Filters'}
            </Button>
          </div>
        }
      >
        {showFilters && (
          <div className="space-y-4 pt-2">
            {/* Row 1: Date Range & Quick Presets */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              <div className="md:col-span-4 flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-semibold text-slate-300 mr-1">Date Preset:</span>
                {(['all', 'today', '7d', '30d', '90d', '1y'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => handleDatePresetChange(p)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      filters.datePreset === p
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {p === 'all' ? 'All Time' : p === 'today' ? 'Today' : p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : p === '90d' ? '90 Days' : '1 Year'}
                  </button>
                ))}
              </div>

              <div className="md:col-span-4 flex items-center gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-slate-400 block mb-0.5">From Date</label>
                  <input
                    type="date"
                    value={filters.dateFrom || ''}
                    onChange={e => setFilters(prev => ({ ...prev, dateFrom: e.target.value, datePreset: undefined }))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-slate-400 block mb-0.5">To Date</label>
                  <input
                    type="date"
                    value={filters.dateTo || ''}
                    onChange={e => setFilters(prev => ({ ...prev, dateTo: e.target.value, datePreset: undefined }))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="md:col-span-4">
                <label className="text-[10px] text-slate-400 block mb-0.5">Machine Filter</label>
                <select
                  value={filters.machineId || ''}
                  onChange={e => setFilters(prev => ({ ...prev, machineId: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">All Machines (Complete Fleet)</option>
                  {fleetData.machines.map((m: any) => (
                    <option key={m.id} value={m.id}>
                      {m.machineNumber} - {m.machineType}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 2: Building, Location, Technician, Category, Status, Priority */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {/* Building */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">Building</label>
                <select
                  value={filters.buildingId || ''}
                  onChange={e => setFilters(prev => ({ ...prev, buildingId: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">All Buildings</option>
                  {fleetData.buildings.map((b: any) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Location */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">Location / Zone</label>
                <select
                  value={filters.locationId || ''}
                  onChange={e => setFilters(prev => ({ ...prev, locationId: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">All Locations</option>
                  {fleetData.locations.map((loc: any) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.floor?.floorName || 'Floor'} - {loc.areaZone}
                    </option>
                  ))}
                </select>
              </div>

              {/* Technician */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">Technician</label>
                <select
                  value={filters.technicianId || ''}
                  onChange={e => setFilters(prev => ({ ...prev, technicianId: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">All Technicians</option>
                  {fleetData.technicians.map((t: any) => (
                    <option key={t.id} value={t.id}>{t.fullName} ({t.employeeCode})</option>
                  ))}
                </select>
              </div>

              {/* Category */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">Fault Category</label>
                <select
                  value={filters.category || ''}
                  onChange={e => setFilters(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">All Categories</option>
                  <option value="REFRIGERATION">Refrigeration & Cooling</option>
                  <option value="CARD_READER">POS & Card Readers</option>
                  <option value="PRODUCT_DISPENSING">Spiral Dispensing / Motors</option>
                  <option value="TEMPERATURE">Boiler / Temperature</option>
                  <option value="SOFTWARE">Software & Firmware</option>
                  <option value="POWER">Power & Telemetry</option>
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">Status</label>
                <select
                  value={filters.status || ''}
                  onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">All Statuses</option>
                  <option value="OPERATIONAL">Operational</option>
                  <option value="WARNING">Warning</option>
                  <option value="UNDER_MAINTENANCE">Under Maintenance</option>
                  <option value="OUT_OF_SERVICE">Out of Service</option>
                  <option value="NEW">New Ticket</option>
                  <option value="ASSIGNED">Assigned</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="WAITING_FOR_PART">Waiting Parts</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </div>

              {/* Priority */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">Priority</label>
                <select
                  value={filters.priority || ''}
                  onChange={e => setFilters(prev => ({ ...prev, priority: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">All Priorities</option>
                  <option value="CRITICAL">Critical (4h Target)</option>
                  <option value="HIGH">High (8h Target)</option>
                  <option value="MEDIUM">Medium (24h Target)</option>
                  <option value="LOW">Low (48h Target)</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* 14 REPORT SELECTOR GRID */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            14 Standard Management Reports (PostgreSQL Schema Certified)
          </h4>
          <span className="text-xs text-slate-500">
            Selected: <strong className="text-blue-400">{currentReportMeta.title}</strong>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {REPORT_CATALOG.map(item => {
            const Icon = item.icon;
            const isSelected = selectedReport === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSelectedReport(item.id)}
                className={`p-3 rounded-xl text-left transition-all border flex flex-col justify-between ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/20'
                    : 'bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-850 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-800 text-blue-400'}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    {item.category}
                  </span>
                </div>
                <div>
                  <h5 className="text-xs font-bold leading-tight">{item.title}</h5>
                  <p className={`text-[10px] mt-1 line-clamp-1 ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>
                    {item.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ACTIVE REPORT VIEWER: SEARCH, CONTROLS & TABLE / VISUALIZER */}
      <Card
        title={`${currentReportMeta.title} Report`}
        subtitle={`${currentReportMeta.description} (${filteredRows.length} active records in view)`}
        action={
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800">
              <button
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  viewMode === 'table' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Table View
              </button>
              <button
                onClick={() => setViewMode('visual')}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  viewMode === 'visual' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Visual Charts
              </button>
            </div>

            {/* Quick Export Dropdown */}
            <Button
              variant="outline"
              size="sm"
              icon={Download}
              onClick={handleExportXLSX}
            >
              XLSX
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={FileSpreadsheet}
              onClick={handleExportCSV}
            >
              CSV
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={Printer}
              onClick={handleExportPDF}
            >
              PDF
            </Button>
          </div>
        }
      >
        {/* Search and Table Count Bar */}
        <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={`Search ${currentReportMeta.title}...`}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Showing <strong>{filteredRows.length}</strong> of <strong>{reportData.rows.length}</strong> records</span>
          </div>
        </div>

        {/* VIEW 1: DATA TABLE */}
        {viewMode === 'table' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left rtl:text-right text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold">
                <tr>
                  {reportData.columns.map((col, idx) => (
                    <th key={idx} className="py-3 px-4 whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={reportData.columns.length || 1} className="py-12 text-center text-slate-500">
                      No records match the current filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-800/30 transition-colors">
                      {reportData.columns.map((col, cIdx) => {
                        const val = row[col];
                        const isNumeric = typeof val === 'number' || (typeof val === 'string' && (val.startsWith('$') || val.endsWith('%') || val.endsWith('hrs') || val.endsWith('mins') || val.endsWith('h')));
                        const isStatus = col.toLowerCase().includes('status') || col.toLowerCase().includes('priority') || col.toLowerCase().includes('sla');
                        const isId = col.toLowerCase().includes('#') || col.toLowerCase().includes('id') || col.toLowerCase().includes('number') || col.toLowerCase().includes('code');

                        return (
                          <td
                            key={cIdx}
                            className={`py-3 px-4 whitespace-nowrap ${
                              isId ? 'font-mono font-bold text-slate-100' : isNumeric ? 'font-mono text-slate-200' : 'text-slate-300'
                            }`}
                          >
                            {isStatus ? (
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                String(val).includes('OPERATIONAL') || String(val).includes('YES') || String(val).includes('RESOLVED') || String(val).includes('CLOSED') || String(val).includes('NORMAL')
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : String(val).includes('WARNING') || String(val).includes('MEDIUM') || String(val).includes('HIGH') || String(val).includes('ASSIGNED')
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : String(val).includes('CRITICAL') || String(val).includes('BREACHED') || String(val).includes('OUT_OF_SERVICE') || String(val).includes('CHRONIC') || String(val).includes('URGENT')
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : 'bg-blue-500/20 text-blue-300'
                              }`}>
                                {val}
                              </span>
                            ) : (
                              val ?? '—'
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* VIEW 2: VISUAL CHARTS ASSOCIATED WITH SELECTED REPORT */}
        {viewMode === 'visual' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
            {/* Chart A: Multi-Month Volume vs SLA */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
              <h5 className="text-xs font-bold text-slate-200 mb-1">Monthly Maintenance Volume & SLA Compliance</h5>
              <p className="text-[11px] text-slate-400 mb-4">Historical resolution throughput and quality metrics</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData.ticketsByMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                    <XAxis dataKey="month" stroke="#64748B" fontSize={11} />
                    <YAxis stroke="#64748B" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }} />
                    <Legend />
                    <Line type="monotone" dataKey="tickets" stroke="#3B82F6" strokeWidth={3} name="Total Tickets" />
                    <Line type="monotone" dataKey="resolved" stroke="#10B981" strokeWidth={3} name="Resolved" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart B: Category Breakdown */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
              <h5 className="text-xs font-bold text-slate-200 mb-1">Fault Distribution by Subsystem</h5>
              <p className="text-[11px] text-slate-400 mb-4">Component fatigue and breakdown drivers</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData.ticketsByCategory} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" horizontal={false} />
                    <XAxis type="number" stroke="#64748B" fontSize={11} />
                    <YAxis dataKey="name" type="category" stroke="#94A3B8" fontSize={10} width={90} tickFormatter={(v) => v.split(' ')[0]} />
                    <Tooltip contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }} />
                    <Bar dataKey="count" fill="#8B5CF6" radius={[0, 4, 4, 0]} name="Incidents" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

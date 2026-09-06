import React, { useState, useEffect } from 'react';
import {
  CalendarCheck,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  Wrench,
  ShieldCheck,
  ListChecks
} from 'lucide-react';
import { DataTable, Column } from '../common/DataTable';
import { StatusBadge } from '../common/StatusBadge';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { useLanguage } from '../../context/LanguageContext';
import { useNotification } from '../../context/NotificationContext';
import { Machine, Technician, NavigationTab } from '../../types';
import { api } from '../../services/api';

interface MaintenanceViewProps {
  onNavigate: (tab: NavigationTab, id?: string) => void;
}

interface PMScheduleItem {
  id: string;
  machine: Machine;
  intervalDays: number;
  lastDone: string;
  nextDue: string;
  assignedTech?: string;
  status: 'UPCOMING' | 'DUE_TODAY' | 'OVERDUE' | 'COMPLETED';
}

export const MaintenanceView: React.FC<MaintenanceViewProps> = ({ onNavigate }) => {
  const { t, formatDate } = useLanguage();
  const { showToast } = useNotification();

  const [machines, setMachines] = useState<Machine[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [schedules, setSchedules] = useState<PMScheduleItem[]>([]);

  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [selectedMachineId, setSelectedMachineId] = useState('');
  const [interval, setInterval] = useState(30);
  const [techId, setTechId] = useState('');

  const [activeChecklistMachine, setActiveChecklistMachine] = useState<PMScheduleItem | null>(null);
  const [checkedItems, setCheckedItems] = useState<{ [key: string]: boolean }>({});

  const standardChecklist = [
    { id: 'chk-1', text: 'Clean condenser coil & verify evaporator fan airflow' },
    { id: 'chk-2', text: 'Sanitize beverage lines, nozzles & descale boiler' },
    { id: 'chk-3', text: 'Inspect bill validator optical sensors and coin mechanism' },
    { id: 'chk-4', text: 'Test Nayax card reader contactless NFC connectivity' },
    { id: 'chk-5', text: 'Calibrate internal temperature sensor (+4.0°C)' },
    { id: 'chk-6', text: 'Verify spiral motor alignment & drop sensor logic' }
  ];

  const loadData = async () => {
    try {
      const [mData, tData] = await Promise.all([
        api.getMachines(),
        api.getTechnicians()
      ]);
      const validMchs = Array.isArray(mData) ? mData : [];
      const validTechs = Array.isArray(tData) ? tData : [];
      setMachines(validMchs);
      setTechnicians(validTechs);

      if (validMchs.length > 0 && !selectedMachineId) {
        setSelectedMachineId(validMchs[0].id);
      }
      if (validTechs.length > 0 && !techId) {
        setTechId(validTechs[0].id);
      }

      // Populate initial schedule from actual machines if none exists yet
      if (validMchs.length > 0) {
        setSchedules(prev => {
          if (prev.length > 0) return prev;
          return validMchs.slice(0, 5).map((m, idx) => ({
            id: `PM-00${idx + 1}`,
            machine: m,
            intervalDays: 30 * (idx + 1),
            lastDone: '2026-01-20',
            nextDue: '2026-02-20',
            assignedTech: validTechs[idx % validTechs.length]?.employeeCode || 'TECH-001',
            status: idx === 0 ? 'OVERDUE' : idx === 1 ? 'DUE_TODAY' : 'UPCOMING'
          }));
        });
      }
    } catch {
      // Keep state
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

  const handleCreateSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    const targetMch = machines.find(m => m.id === selectedMachineId) || machines[0];
    if (!targetMch) {
      showToast(t('error'), 'No machine selected', 'error');
      return;
    }
    const newSchedule: PMScheduleItem = {
      id: `PM-${Date.now().toString().slice(-3)}`,
      machine: targetMch,
      intervalDays: Number(interval),
      lastDone: new Date().toISOString().split('T')[0],
      nextDue: new Date(Date.now() + interval * 86400000).toISOString().split('T')[0],
      assignedTech: technicians.find(t => t.id === techId)?.employeeCode,
      status: 'UPCOMING'
    };
    setSchedules(prev => [newSchedule, ...prev]);
    showToast(t('success'), `Preventive Maintenance schedule logged!`, 'success');
    setIsScheduleOpen(false);
  };

  const handleCompleteChecklist = () => {
    if (!activeChecklistMachine) return;
    setSchedules(prev =>
      prev.map(s => (s.id === activeChecklistMachine.id ? { ...s, status: 'COMPLETED', lastDone: new Date().toISOString().split('T')[0] } : s))
    );
    showToast(t('success'), 'PM Checklist submitted and logged to audit trail!', 'success');
    setActiveChecklistMachine(null);
    setCheckedItems({});
  };

  const columns: Column<PMScheduleItem>[] = [
    {
      key: 'machine',
      header: t('machineNumber'),
      sortable: true,
      render: row => (
        <div>
          <span className="font-mono font-bold text-slate-100 text-xs">{row.machine.machineNumber}</span>
          <span className="text-[11px] text-slate-400 block">{row.machine.currentLocation?.fullDescription}</span>
        </div>
      )
    },
    {
      key: 'intervalDays',
      header: 'Interval',
      render: row => (
        <span className="text-xs font-mono text-slate-200">Every {row.intervalDays} Days</span>
      )
    },
    {
      key: 'lastDone',
      header: 'Last Serviced',
      render: row => <span className="text-xs text-slate-400">{formatDate(row.lastDone)}</span>
    },
    {
      key: 'nextDue',
      header: 'Next Due Date',
      render: row => (
        <span className={`text-xs font-mono font-bold ${row.status === 'OVERDUE' ? 'text-rose-400' : 'text-amber-400'}`}>
          {formatDate(row.nextDue)}
        </span>
      )
    },
    {
      key: 'assignedTech',
      header: t('assignedTo'),
      render: row => (
        <span className="text-xs font-mono text-slate-200">{row.assignedTech || 'Unassigned'}</span>
      )
    },
    {
      key: 'status',
      header: t('status'),
      render: row => {
        const colorMap = {
          OVERDUE: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
          DUE_TODAY: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
          UPCOMING: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
          COMPLETED: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
        };
        return (
          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border font-mono ${colorMap[row.status]}`}>
            {row.status}
          </span>
        );
      }
    },
    {
      key: 'actions',
      header: t('actions'),
      className: 'text-right rtl:text-left',
      render: row => (
        <Button
          variant="outline"
          size="sm"
          icon={ListChecks}
          onClick={() => {
            setActiveChecklistMachine(row);
            setCheckedItems({});
          }}
        >
          Inspection Checklist
        </Button>
      )
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100">{t('maintenance')}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Preventive maintenance scheduling, routine inspections, and sanitation audits
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          icon={Plus}
          onClick={() => setIsScheduleOpen(true)}
        >
          Schedule PM Cycle
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={schedules}
        searchPlaceholder="Search PM schedule by machine..."
      />

      {/* Schedule PM Modal */}
      <Modal
        isOpen={isScheduleOpen}
        onClose={() => setIsScheduleOpen(false)}
        title="Schedule Preventive Maintenance"
        subtitle="Establish routine servicing cycles for fleet longevity"
        maxWidth="md"
      >
        <form onSubmit={handleCreateSchedule} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Select Machine *
            </label>
            <select
              value={selectedMachineId}
              onChange={e => setSelectedMachineId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
            >
              {machines.length === 0 ? (
                <option value="">لا توجد ماكينات مسجلة حالياً</option>
              ) : (
                machines.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.machineNumber} — {m.currentLocation?.fullDescription || m.currentLocation?.areaZone || 'الموقع الرئيسي'}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Interval (Days) *
              </label>
              <select
                value={interval}
                onChange={e => setInterval(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value={30}>30 Days (Monthly Clean & Filter)</option>
                <option value={60}>60 Days (Bi-Monthly Tuneup)</option>
                <option value={90}>90 Days (Quarterly Deep PM)</option>
                <option value={180}>180 Days (Semi-Annual Full Overhaul)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Assign Specialist
              </label>
              <select
                value={techId}
                onChange={e => setTechId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              >
                {technicians.length === 0 ? (
                  <option value="">لا يوجد فنيين مسجلين</option>
                ) : (
                  technicians.map(tech => (
                    <option key={tech.id} value={tech.id}>
                      {tech.fullName || tech.employeeCode} ({tech.specialization || 'فني صيانة'})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsScheduleOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Save Schedule
            </Button>
          </div>
        </form>
      </Modal>

      {/* Inspection Checklist Modal */}
      <Modal
        isOpen={!!activeChecklistMachine}
        onClose={() => setActiveChecklistMachine(null)}
        title="Field Inspection Checklist"
        subtitle={`Standard PM validation for ${activeChecklistMachine?.machine.machineNumber}`}
        maxWidth="lg"
      >
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs">
            Complete all quality inspection checks to verify machine health and clear the PM cycle.
          </div>

          <div className="space-y-2">
            {standardChecklist.map(item => (
              <label
                key={item.id}
                className="flex items-start gap-3 p-3 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={!!checkedItems[item.id]}
                  onChange={e =>
                    setCheckedItems(prev => ({ ...prev, [item.id]: e.target.checked }))
                  }
                  className="mt-0.5 rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs text-slate-200 select-none">{item.text}</span>
              </label>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveChecklistMachine(null)}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="success"
              size="sm"
              icon={CheckCircle2}
              onClick={handleCompleteChecklist}
            >
              Complete Inspection
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

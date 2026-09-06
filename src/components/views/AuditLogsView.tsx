import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Clock,
  User,
  Layers,
  Search,
  Filter,
  FileCode2,
  Cpu,
  Ticket as TicketIcon,
  Package,
  Eye
} from 'lucide-react';
import { DataTable, Column } from '../common/DataTable';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { useLanguage } from '../../context/LanguageContext';
import { AuditLog, NavigationTab } from '../../types';
import { api } from '../../services/api';

interface AuditLogsViewProps {
  onNavigate: (tab: NavigationTab, id?: string) => void;
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({ onNavigate }) => {
  const { t, formatDate } = useLanguage();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [entityFilter, setEntityFilter] = useState<string>('ALL');
  const [inspectedLog, setInspectedLog] = useState<AuditLog | null>(null);

  const loadLogs = async () => {
    try {
      setIsLoading(true);
      const data = await api.getAuditLogs();
      setLogs(data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = logs.filter(l => {
    if (entityFilter !== 'ALL' && l.entityType !== entityFilter) return false;
    return true;
  });

  const columns: Column<AuditLog>[] = [
    {
      key: 'createdAt',
      header: 'Timestamp',
      sortable: true,
      render: row => (
        <span className="text-xs font-mono text-slate-300">{formatDate(row.createdAt)}</span>
      )
    },
    {
      key: 'action',
      header: 'Event Action',
      sortable: true,
      render: row => {
        const actionColors: { [key: string]: string } = {
          CREATE: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
          UPDATE: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
          RELOCATE: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
          RESOLVE: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
          STATUS_CHANGE: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
          INVENTORY_MOVE: 'bg-purple-500/10 text-purple-400 border-purple-500/30'
        };

        return (
          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold border ${actionColors[row.action] || 'bg-slate-800 text-slate-300 border-slate-700'}`}>
            {row.action}
          </span>
        );
      }
    },
    {
      key: 'entityType',
      header: 'Target Entity',
      sortable: true,
      render: row => (
        <div className="flex items-center gap-1.5 text-xs text-slate-200">
          <span className="font-semibold text-slate-100">{row.entityType}</span>
          <span className="font-mono text-[11px] text-blue-400">({row.entityId.substring(0, 12)})</span>
        </div>
      )
    },
    {
      key: 'user',
      header: 'Actor',
      render: row => (
        <div className="flex items-center gap-1.5 text-xs text-slate-300">
          <User className="w-3.5 h-3.5 text-slate-500" />
          <span>{row.user?.fullName || 'System Automated Workflow'}</span>
        </div>
      )
    },
    {
      key: 'actions',
      header: 'Audit Payload',
      className: 'text-right rtl:text-left',
      render: row => (
        <Button
          variant="outline"
          size="sm"
          icon={Eye}
          onClick={() => setInspectedLog(row)}
        >
          View Details
        </Button>
      )
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100">{t('auditLogs')} & Security Ledger</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Cryptographically timestamped immutable audit trail for compliance and operations governance
          </p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filteredLogs}
        isLoading={isLoading}
        searchPlaceholder="Search audit events..."
        filterComponent={
          <select
            value={entityFilter}
            onChange={e => setEntityFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">Entity: All</option>
            <option value="MACHINE">Machines</option>
            <option value="TICKET">Tickets</option>
            <option value="INVENTORY">Inventory</option>
            <option value="USER">Users</option>
          </select>
        }
      />

      {/* Inspect Audit Log Modal */}
      <Modal
        isOpen={!!inspectedLog}
        onClose={() => setInspectedLog(null)}
        title="Audit Trail Detail"
        subtitle={`Event ${inspectedLog?.id} • ${inspectedLog?.action}`}
        maxWidth="lg"
      >
        {inspectedLog && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block mb-0.5">Actor</span>
                <span className="font-semibold text-slate-200">{inspectedLog.user?.fullName || 'System Engine'}</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block mb-0.5">Target</span>
                <span className="font-semibold text-slate-200">{inspectedLog.entityType}: {inspectedLog.entityId}</span>
              </div>
            </div>

            <div>
              <span className="text-xs font-semibold text-slate-300 block mb-1">
                Raw JSON Event Payload
              </span>
              <pre className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-64">
                {JSON.stringify(inspectedLog.changes, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setInspectedLog(null)}
              >
                Close Audit Record
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

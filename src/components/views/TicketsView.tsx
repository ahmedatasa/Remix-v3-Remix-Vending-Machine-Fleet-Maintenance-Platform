import React, { useState, useEffect } from 'react';
import {
  Ticket as TicketIcon,
  Plus,
  Kanban,
  Table as TableIcon,
  Clock,
  AlertTriangle,
  User,
  ExternalLink,
  CheckCircle2,
  Filter,
  Flame,
  ArrowRight,
  Edit2,
  Trash2,
  Archive,
  Ban
} from 'lucide-react';
import { DataTable, Column } from '../common/DataTable';
import { StatusBadge } from '../common/StatusBadge';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { ConfirmActionModal } from '../common/ConfirmActionModal';
import { useLanguage } from '../../context/LanguageContext';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { Ticket, TicketStatus, TicketPriority, FaultCategory, NavigationTab, Machine, Technician } from '../../types';
import { api } from '../../services/api';

interface TicketsViewProps {
  onNavigate: (tab: NavigationTab, id?: string) => void;
  initialAction?: string;
}

export const TicketsView: React.FC<TicketsViewProps> = ({ onNavigate, initialAction }) => {
  const { t, formatDate, isRTL } = useLanguage();
  const { showToast, addInAppNotification } = useNotification();
  const { canAssignTickets, canManageTickets, canCreateTicket, canDeleteTicket, canArchiveTicket, isAdmin, isReadOnly } = useAuth();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('table');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [machineId, setMachineId] = useState('');
  const [machineSearchQuery, setMachineSearchQuery] = useState('');
  const [category, setCategory] = useState<FaultCategory>('REFRIGERATION');
  const [priority, setPriority] = useState<TicketPriority>('HIGH');
  const [description, setDescription] = useState('');
  const [assignedTechId, setAssignedTechId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Modal State
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);

  // Confirm Modal
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

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [ticketsData, machinesData, techsData] = await Promise.all([
        api.getTickets(),
        api.getMachines(),
        api.getTechnicians()
      ]);
      const validTickets = Array.isArray(ticketsData) ? ticketsData : [];
      const validMachines = Array.isArray(machinesData) ? machinesData : [];
      const validTechs = Array.isArray(techsData) ? techsData : [];

      setTickets(validTickets);
      setMachines(validMachines);
      setTechnicians(validTechs);

      let targetMid = '';
      if (initialAction && canCreateTicket) {
        if (initialAction === 'new') {
          setIsCreateOpen(true);
          if (validMachines.length > 0) targetMid = validMachines[0].id;
        } else {
          // Machine ID or Machine Number passed
          const matched = validMachines.find(
            m => m.id === initialAction || m.machineNumber === initialAction || m.publicId === initialAction
          );
          if (matched) {
            targetMid = matched.id;
            setIsCreateOpen(true);
          } else if (validMachines.length > 0) {
            targetMid = validMachines[0].id;
          }
        }
      } else if (validMachines.length > 0 && !machineId) {
        targetMid = validMachines[0].id;
      }

      if (targetMid) {
        setMachineId(targetMid);
      }
    } catch {
      showToast(t('error'), 'Failed to load tickets', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleDataUpdate = () => {
      loadTickets();
    };

    window.addEventListener('vending-fleet-data-updated', handleDataUpdate);
    window.addEventListener('storage', handleDataUpdate);

    // Periodic check every 4 seconds to guarantee up-to-date tickets
    const interval = setInterval(() => {
      api.getTickets().then(data => {
        if (Array.isArray(data)) setTickets(data);
      }).catch(() => {});
    }, 4000);

    return () => {
      window.removeEventListener('vending-fleet-data-updated', handleDataUpdate);
      window.removeEventListener('storage', handleDataUpdate);
      clearInterval(interval);
    };
  }, []);

  const loadTickets = async () => {
    try {
      const data = await api.getTickets();
      setTickets(data);
    } catch {
      showToast(t('error'), 'Failed to load tickets', 'error');
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateTicket || isReadOnly) {
      showToast(t('error'), 'غير مصرح بإنشاء تذاكر جديدة للمستخدمين بصلاحية قراءة فقط', 'error');
      return;
    }
    if (!description.trim()) return;
    if (machines.length === 0 || !machineId) {
      showToast(t('error'), isRTL ? 'لا توجد ماكينات مسجلة لفتح البلاغ عليها. يرجى تسجيل ماكينة أولاً.' : 'No machines registered. Please register a machine first.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await api.createTicket({
        machineId,
        category,
        priority,
        description,
        source: 'MANUAL',
        assignedTechnicianId: assignedTechId || undefined
      });

      showToast(t('success'), `Ticket ${created.ticketNumber} created!`, 'success');
      addInAppNotification({
        title: `Ticket Created: ${created.ticketNumber}`,
        message: description,
        type: 'TICKET_CREATED',
        linkTab: 'ticket-detail',
        linkId: created.id
      });

      setIsCreateOpen(false);
      setDescription('');
      await loadTickets();
    } catch (err: any) {
      showToast(t('error'), err.message || 'Failed to create ticket', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAssignTickets || isReadOnly) {
      showToast(t('error'), 'غير مصرح بتعديل بيانات التذكرة', 'error');
      return;
    }
    if (!editingTicket) return;

    setIsSubmitting(true);
    try {
      const updated = await api.updateTicket(editingTicket.id, {
        category: editingTicket.category,
        priority: editingTicket.priority,
        description: editingTicket.description,
        status: editingTicket.status,
        assignedTechnicianId: editingTicket.assignedTechnicianId
      });

      showToast(t('success'), `Ticket ${updated.ticketNumber} updated!`, 'success');
      setEditingTicket(null);
      await loadTickets();
    } catch (err: any) {
      showToast(t('error'), err.message || 'Failed to update ticket', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickAssign = async (ticketId: string, techId: string) => {
    if (!canAssignTickets || isReadOnly) {
      showToast(t('error'), 'غير مصرح بتعيين الفنيين', 'error');
      return;
    }
    try {
      await api.assignTicket(ticketId, techId);
      showToast(t('success'), 'Technician assigned!', 'success');
      await loadTickets();
    } catch {
      showToast(t('error'), 'Assignment failed', 'error');
    }
  };

  const handlePromptArchiveTicket = (tck: Ticket) => {
    if (!canArchiveTicket || isReadOnly) {
      showToast(t('error'), 'غير مصرح بأرشفة تذاكر الصيانة', 'error');
      return;
    }
    setConfirmModal({
      isOpen: true,
      title: `Archive Ticket: ${tck.ticketNumber}`,
      description: `Are you sure you want to archive maintenance ticket ${tck.ticketNumber}? Reason is required.`,
      warningMessage: 'Archived tickets are moved out of active operational queues.',
      requireReason: true,
      onConfirm: async (reason?: string) => {
        await api.archiveTicket(tck.id, reason);
        showToast(t('success'), `Ticket ${tck.ticketNumber} archived!`, 'success');
        await loadTickets();
      }
    });
  };

  const handlePromptDeleteTicket = async (tck: Ticket) => {
    if (!canDeleteTicket || isReadOnly) {
      showToast(t('error'), 'غير مصرح بحذف تذاكر الصيانة إلا لمديري النظام (Super Admin / Admin)', 'error');
      return;
    }
    const refs = await api.checkTicketReferences(tck.id);
    setConfirmModal({
      isOpen: true,
      title: `Delete Ticket: ${tck.ticketNumber}`,
      description: refs.canDelete
        ? `Are you sure you want to permanently delete ticket ${tck.ticketNumber}?`
        : `This ticket has linked part requests (${refs.partRequestsCount} items). You can archive it instead of hard deletion.`,
      warningMessage: refs.canDelete ? 'Permanent deletion will remove this incident record.' : 'Cannot hard delete ticket with linked part requisitions.',
      requireReason: true,
      referenceCounts: refs.referenceCounts,
      isDeactivation: !refs.canDelete,
      onConfirm: async (reason?: string) => {
        await api.deleteTicket(tck.id, false, reason);
        showToast(t('success'), `Ticket ${tck.ticketNumber} deleted!`, 'success');
        await loadTickets();
      }
    });
  };

  const filteredTickets = tickets.filter(tck => {
    if (priorityFilter !== 'ALL' && tck.priority !== priorityFilter) return false;
    if (categoryFilter !== 'ALL' && tck.category !== categoryFilter) return false;
    return true;
  });

  const columns: Column<Ticket>[] = [
    {
      key: 'ticketNumber',
      header: t('ticketNumber'),
      sortable: true,
      render: row => (
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-slate-100 text-xs">{row.ticketNumber}</span>
            {row.source === 'CUSTOMER_QR' && (
              <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] font-bold border border-blue-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                عميل عبر QR
              </span>
            )}
            {row.isRecurring && (
              <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 text-[10px] font-bold flex items-center gap-0.5">
                <Flame className="w-2.5 h-2.5" />
                {row.recurringOccurrenceCount}x
              </span>
            )}
            {row.isArchived && (
              <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 text-[9px] font-bold border border-slate-700">
                ARCHIVED
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-400 font-mono">{formatDate(row.createdAt)}</span>
        </div>
      )
    },
    {
      key: 'machine',
      header: t('machineNumber'),
      render: row => (
        <div>
          <div className="font-semibold text-slate-200 text-xs">
            {row.machine?.machineNumber || 'VM-UNKNOWN'}
          </div>
          <span className="text-[11px] text-slate-400 truncate max-w-[140px] block">
            {row.location?.areaZone || row.location?.fullDescription || 'General Area'}
          </span>
        </div>
      )
    },
    {
      key: 'category',
      header: t('category'),
      render: row => (
        <span className="text-xs px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300">
          {row.category}
        </span>
      )
    },
    {
      key: 'priority',
      header: t('priority'),
      sortable: true,
      render: row => <StatusBadge type="priority" status={row.priority} />
    },
    {
      key: 'status',
      header: t('status'),
      sortable: true,
      render: row => <StatusBadge type="ticket" status={row.status} />
    },
    {
      key: 'assignedTechnician',
      header: t('assignedTo'),
      render: row => {
        if (row.assignedTechnician) {
          return (
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-bold">
                {row.assignedTechnician.employeeCode.slice(-2)}
              </div>
              <span className="text-xs text-slate-200">{row.assignedTechnician.employeeCode}</span>
            </div>
          );
        }
        if (canAssignTickets) {
          return (
            <select
              onClick={e => e.stopPropagation()}
              onChange={e => handleQuickAssign(row.id, e.target.value)}
              defaultValue=""
              className="bg-slate-950 border border-slate-700/80 rounded px-2 py-1 text-[11px] text-slate-400 focus:outline-none focus:border-blue-500"
            >
              <option value="" disabled>Assign Tech...</option>
              {technicians.map(tech => (
                <option key={tech.id} value={tech.id}>{tech.employeeCode} ({tech.status})</option>
              ))}
            </select>
          );
        }
        return <span className="text-[11px] text-slate-500 italic">Unassigned</span>;
      }
    },
    {
      key: 'slaDueAt',
      header: t('slaDue'),
      render: row => (
        <div className="flex items-center gap-1 text-[11px] text-amber-400 font-mono">
          <Clock className="w-3 h-3 shrink-0" />
          <span>{formatDate(row.slaDueAt)}</span>
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
            onClick={() => onNavigate('ticket-detail', row.id)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors cursor-pointer"
            title="Open Ticket Detail"
          >
            <ExternalLink className="w-4 h-4" />
          </button>

          {!isReadOnly && (
            <>
              {canAssignTickets && (
                <button
                  onClick={() => setEditingTicket({ ...row })}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Edit Ticket"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}

              {canArchiveTicket && (
                <button
                  onClick={() => handlePromptArchiveTicket(row)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Archive Ticket"
                >
                  <Archive className="w-4 h-4" />
                </button>
              )}

              {canDeleteTicket && (
                <button
                  onClick={() => handlePromptDeleteTicket(row)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Delete Ticket"
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

  const kanbanStatuses: { status: TicketStatus; label: string; color: string }[] = [
    { status: 'NEW', label: 'New', color: 'border-blue-500/40 text-blue-400' },
    { status: 'TRIAGED', label: 'Triaged', color: 'border-indigo-500/40 text-indigo-400' },
    { status: 'ASSIGNED', label: 'Assigned', color: 'border-cyan-500/40 text-cyan-400' },
    { status: 'IN_PROGRESS', label: 'In Progress', color: 'border-amber-500/40 text-amber-400' },
    { status: 'WAITING_FOR_PART', label: 'Waiting Part', color: 'border-purple-500/40 text-purple-400' },
    { status: 'RESOLVED', label: 'Resolved', color: 'border-emerald-500/40 text-emerald-400' },
    { status: 'VERIFIED', label: 'Verified', color: 'border-teal-500/40 text-teal-400' },
    { status: 'CLOSED', label: 'Closed', color: 'border-slate-500/40 text-slate-400' }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100">{t('tickets')}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time corrective maintenance dispatches, SLA tracking, and resolution lifecycle
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* View Toggle */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                viewMode === 'table' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>{t('tableView')}</span>
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                viewMode === 'kanban' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>{t('kanbanView')}</span>
            </button>
          </div>

          {canCreateTicket && (
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => setIsCreateOpen(true)}
            >
              {t('newTicket')}
            </Button>
          )}
        </div>
      </div>

      {/* Main Content: Table or Kanban Board */}
      {viewMode === 'table' ? (
        <DataTable
          columns={columns}
          data={filteredTickets}
          isLoading={isLoading}
          searchPlaceholder={t('searchTickets')}
          onRowClick={row => onNavigate('ticket-detail', row.id)}
          filterComponent={
            <div className="flex items-center gap-2">
              <select
                value={priorityFilter}
                onChange={e => setPriorityFilter(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">{t('filterByPriority')}: All</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>

              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">Fault Category: All</option>
                <option value="REFRIGERATION">Refrigeration</option>
                <option value="CARD_READER">Card Reader</option>
                <option value="PRODUCT_DISPENSING">Product Dispensing</option>
                <option value="COFFEE_BREWING">Coffee Brewing</option>
                <option value="POWER_ELECTRICAL">Power</option>
                <option value="SOFTWARE">Software</option>
              </select>
            </div>
          }
        />
      ) : (
        /* Kanban Board View */
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-slate-700">
          {kanbanStatuses.map(col => {
            const colTickets = filteredTickets.filter(t => t.status === col.status);
            return (
              <div
                key={col.status}
                className="flex flex-col bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden min-w-[280px] shrink-0"
              >
                <div className={`p-3 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between`}>
                  <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full border ${col.color}`} />
                    <span>{col.label}</span>
                  </h4>
                  <span className="text-xs font-mono font-bold text-slate-400 px-2 py-0.5 rounded-full bg-slate-800">
                    {colTickets.length}
                  </span>
                </div>

                <div className="p-3 flex-1 overflow-y-auto space-y-3 min-h-[450px]">
                  {colTickets.length === 0 ? (
                    <div className="py-12 text-center text-[11px] text-slate-500 italic">
                      No tickets
                    </div>
                  ) : (
                    colTickets.map(tck => (
                      <div
                        key={tck.id}
                        onClick={() => onNavigate('ticket-detail', tck.id)}
                        className="p-3 rounded-lg bg-slate-950/80 hover:bg-slate-950 border border-slate-800 hover:border-slate-700 shadow-md cursor-pointer transition-all space-y-2 group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono font-bold text-slate-100 group-hover:text-blue-400">
                            {tck.ticketNumber}
                          </span>
                          <StatusBadge type="priority" status={tck.priority} />
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11px] font-semibold text-slate-300">
                            {tck.machine?.machineNumber || 'VM-UNKNOWN'}
                          </div>
                          {tck.source === 'CUSTOMER_QR' && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[9px] font-bold border border-blue-500/30">
                              عميل عبر QR
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                          {tck.description}
                        </p>

                        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
                          <span>{tck.category}</span>
                          {tck.assignedTechnician && (
                            <span className="font-medium text-slate-300">
                              {tck.assignedTechnician.employeeCode}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Ticket Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title={t('createTicket')}
        subtitle="Open a new corrective maintenance ticket and assign field technicians"
        maxWidth="lg"
      >
        <form onSubmit={handleCreateTicket} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-300">
                {t('machineNumber')} * ({machines.length} ماكينة مسجلة)
              </label>
              <input
                type="text"
                placeholder="بحث برقم الماكينة..."
                value={machineSearchQuery}
                onChange={e => setMachineSearchQuery(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 w-36"
              />
            </div>
            {machines.length === 0 ? (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-xs flex items-center justify-between">
                <span>{isRTL ? 'لا توجد ماكينات مسجلة حالياً في النظام. يرجى إضافة ماكينة أولاً.' : 'No machines registered currently. Please add a machine first.'}</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateOpen(false);
                    onNavigate('machines');
                  }}
                  className="underline hover:text-amber-200 font-semibold cursor-pointer ml-2"
                >
                  {isRTL ? 'إضافة ماكينة الآن' : 'Add Machine Now'}
                </button>
              </div>
            ) : (
              <select
                value={machineId}
                onChange={e => setMachineId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              >
                {machines
                  .filter(m => {
                    if (!machineSearchQuery.trim()) return true;
                    const q = machineSearchQuery.toLowerCase();
                    return (
                      m.machineNumber.toLowerCase().includes(q) ||
                      (m.currentLocation?.fullDescription || '').toLowerCase().includes(q) ||
                      (m.currentLocation?.building?.name || '').toLowerCase().includes(q)
                    );
                  })
                  .map(m => (
                    <option key={m.id} value={m.id}>
                      {m.machineNumber} — {m.currentLocation?.fullDescription || m.currentLocation?.areaZone || 'General Area'} ({m.status})
                    </option>
                  ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {t('category')} *
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value as FaultCategory)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="REFRIGERATION">Refrigeration & Cooling</option>
                <option value="CARD_READER">Payment / Card Reader</option>
                <option value="PRODUCT_DISPENSING">Product Dispensing / Spiral</option>
                <option value="COFFEE_BREWING">Coffee Brewer & Pump</option>
                <option value="POWER_ELECTRICAL">Power & Electrical</option>
                <option value="SOFTWARE">Software & DEX Telemetry</option>
                <option value="OTHER">Other / General</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {t('priority')} *
              </label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as TicketPriority)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="CRITICAL">Critical (2 Hours SLA)</option>
                <option value="HIGH">High (4 Hours SLA)</option>
                <option value="MEDIUM">Medium (8 Hours SLA)</option>
                <option value="LOW">Low (24 Hours SLA)</option>
              </select>
            </div>
          </div>

          {canAssignTickets && (
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {t('assignTechnician')} (Optional)
              </label>
              <select
                value={assignedTechId}
                onChange={e => setAssignedTechId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="">Do not assign yet (Auto Dispatch)</option>
                {technicians.map(tech => (
                  <option key={tech.id} value={tech.id}>
                    {tech.employeeCode} ({tech.specialization}) — {tech.status}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              {t('description')} *
            </label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Provide specific failure symptoms, customer report notes, affected components..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCreateOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSubmitting}
            >
              {t('createTicket')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Ticket Modal */}
      {editingTicket && (
        <Modal
          isOpen={!!editingTicket}
          onClose={() => setEditingTicket(null)}
          title={`Edit Ticket ${editingTicket.ticketNumber}`}
          maxWidth="md"
        >
          <form onSubmit={handleUpdateTicket} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Fault Category *
                </label>
                <select
                  value={editingTicket.category}
                  onChange={e => setEditingTicket({ ...editingTicket, category: e.target.value as FaultCategory })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="REFRIGERATION">Refrigeration & Cooling</option>
                  <option value="CARD_READER">Payment / Card Reader</option>
                  <option value="PRODUCT_DISPENSING">Product Dispensing</option>
                  <option value="COFFEE_BREWING">Coffee Brewer & Pump</option>
                  <option value="POWER_ELECTRICAL">Power & Electrical</option>
                  <option value="SOFTWARE">Software & DEX Telemetry</option>
                  <option value="OTHER">Other / General</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Priority Level *
                </label>
                <select
                  value={editingTicket.priority}
                  onChange={e => setEditingTicket({ ...editingTicket, priority: e.target.value as TicketPriority })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="CRITICAL">Critical (2h SLA)</option>
                  <option value="HIGH">High (4h SLA)</option>
                  <option value="MEDIUM">Medium (8h SLA)</option>
                  <option value="LOW">Low (24h SLA)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Assigned Specialist
              </label>
              <select
                value={editingTicket.assignedTechnicianId || ''}
                onChange={e => setEditingTicket({ ...editingTicket, assignedTechnicianId: e.target.value || undefined })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="">Unassigned</option>
                {technicians.map(tech => (
                  <option key={tech.id} value={tech.id}>
                    {tech.employeeCode} ({tech.specialization})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Description / Symptoms *
              </label>
              <textarea
                required
                rows={3}
                value={editingTicket.description}
                onChange={e => setEditingTicket({ ...editingTicket, description: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditingTicket(null)}>
                {t('cancel')}
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

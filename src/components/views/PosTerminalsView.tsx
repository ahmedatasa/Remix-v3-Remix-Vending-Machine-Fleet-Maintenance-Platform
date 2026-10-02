import React, { useEffect, useState } from 'react';
import {
  CreditCard,
  History,
  Link2,
  Link2Off,
  Plus,
  RefreshCw
} from 'lucide-react';

import { Button } from '../common/Button';
import { DataTable, Column } from '../common/DataTable';
import { Modal } from '../common/Modal';

import { useLanguage } from '../../context/LanguageContext';
import { useNotification } from '../../context/NotificationContext';

import {
  Machine,
  NavigationTab,
  PosTerminal,
  PosTerminalMapping,
  PosTerminalSummary
} from '../../types';

import { api } from '../../services/api';

interface PosTerminalsViewProps {
  onNavigate: (
    tab: NavigationTab,
    id?: string
  ) => void;
}

const emptySummary: PosTerminalSummary = {
  totalTerminals: 0,
  activeTerminals: 0,
  inactiveTerminals: 0,
  mappedNow: 0,
  unmappedNow: 0,
  mappingHistoryCount: 0
};

const inputClass =
  'w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500';

function machineLabel(
  machine?: Machine
) {
  if (!machine) return '—';

  return `#${machine.machineNumber}${
    machine.serialNumber
      ? ` — ${machine.serialNumber}`
      : ''
  }`;
}

export const PosTerminalsView:
React.FC<PosTerminalsViewProps> = () => {
  const { isRTL } = useLanguage();
  const { showToast } = useNotification();

  const [summary, setSummary] =
    useState<PosTerminalSummary>(emptySummary);

  const [terminals, setTerminals] =
    useState<PosTerminal[]>([]);

  const [machines, setMachines] =
    useState<Machine[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [createOpen, setCreateOpen] =
    useState(false);

  const [assignOpen, setAssignOpen] =
    useState(false);

  const [historyOpen, setHistoryOpen] =
    useState(false);

  const [selectedTerminal, setSelectedTerminal] =
    useState<PosTerminal | null>(null);

  const [historyRows, setHistoryRows] =
    useState<PosTerminalMapping[]>([]);

  const [createDraft, setCreateDraft] =
    useState({
      terminalReference: '',
      displayName: '',
      providerName: '',
      notes: ''
    });

  const [assignDraft, setAssignDraft] =
    useState({
      machineId: '',
      effectiveFrom: '',
      notes: ''
    });

  const loadAll = async () => {
    setLoading(true);

    try {
      const [
        summaryData,
        terminalRows,
        machineRows
      ] = await Promise.all([
        api.getPosTerminalSummary(),
        api.getPosTerminals(true),
        api.getMachines()
      ]);

      setSummary(summaryData);
      setTerminals(terminalRows);

      setMachines(
        machineRows.filter(
          machine =>
            machine.isDeleted !== true
        )
      );
    } catch (error: any) {
      showToast(
        isRTL ? 'خطأ' : 'Error',
        error?.message ||
          (
            isRTL
              ? 'تعذر تحميل أجهزة الدفع'
              : 'Failed to load POS terminals'
          ),
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const submitCreate =
    async (
      event: React.FormEvent
    ) => {
      event.preventDefault();

      setSubmitting(true);

      try {
        await api.createPosTerminal({
          terminalReference:
            createDraft.terminalReference.trim(),

          displayName:
            createDraft.displayName.trim() ||
            undefined,

          providerName:
            createDraft.providerName.trim() ||
            undefined,

          notes:
            createDraft.notes.trim() ||
            undefined
        });

        setCreateDraft({
          terminalReference: '',
          displayName: '',
          providerName: '',
          notes: ''
        });

        setCreateOpen(false);

        showToast(
          isRTL
            ? 'تم تسجيل جهاز الدفع'
            : 'POS terminal registered',

          isRTL
            ? 'يمكن الآن ربط الجهاز بالماكينة الصحيحة.'
            : 'The terminal can now be mapped to the correct machine.',

          'success'
        );

        await loadAll();
      } catch (error: any) {
        showToast(
          isRTL ? 'خطأ' : 'Error',
          error?.message ||
            'Failed to create POS terminal',
          'error'
        );
      } finally {
        setSubmitting(false);
      }
    };

  const openAssign =
    (terminal: PosTerminal) => {
      setSelectedTerminal(terminal);

      setAssignDraft({
        machineId:
          terminal.currentMapping?.machineId ||
          '',
        effectiveFrom: '',
        notes: ''
      });

      setAssignOpen(true);
    };

  const submitAssign =
    async (
      event: React.FormEvent
    ) => {
      event.preventDefault();

      if (
        !selectedTerminal ||
        !assignDraft.machineId
      ) {
        return;
      }

      setSubmitting(true);

      try {
        await api.assignPosTerminal(
          selectedTerminal.id,
          {
            machineId:
              assignDraft.machineId,

            effectiveFrom:
              assignDraft.effectiveFrom
                ? new Date(
                    assignDraft.effectiveFrom
                  ).toISOString()
                : undefined,

            notes:
              assignDraft.notes.trim() ||
              undefined
          }
        );

        setAssignOpen(false);
        setSelectedTerminal(null);

        showToast(
          isRTL
            ? 'تم حفظ الربط'
            : 'Mapping saved',

          isRTL
            ? 'تم تحديث الربط مع الاحتفاظ بالسجل التاريخي.'
            : 'Mapping updated while preserving historical assignment history.',

          'success'
        );

        await loadAll();
      } catch (error: any) {
        showToast(
          isRTL ? 'خطأ' : 'Error',
          error?.message ||
            'Failed to map POS terminal',
          'error'
        );
      } finally {
        setSubmitting(false);
      }
    };

  const unassign =
    async (
      terminal: PosTerminal
    ) => {
      if (!terminal.currentMapping) {
        return;
      }

      const confirmed =
        window.confirm(
          isRTL
            ? `فك ربط جهاز الدفع ${terminal.terminalReference} من الماكينة الحالية؟`
            : `Unassign terminal ${terminal.terminalReference} from its current machine?`
        );

      if (!confirmed) return;

      try {
        await api.unassignPosTerminal(
          terminal.id,
          {}
        );

        showToast(
          isRTL
            ? 'تم فك الربط'
            : 'Terminal unassigned',

          isRTL
            ? 'تم إغلاق الربط الحالي مع الاحتفاظ بالسجل التاريخي.'
            : 'The current mapping was closed and historical mapping was retained.',

          'success'
        );

        await loadAll();
      } catch (error: any) {
        showToast(
          isRTL ? 'خطأ' : 'Error',
          error?.message ||
            'Failed to unassign terminal',
          'error'
        );
      }
    };

  const toggleActive =
    async (
      terminal: PosTerminal
    ) => {
      try {
        await api.updatePosTerminal(
          terminal.id,
          {
            isActive:
              terminal.isActive === false
          }
        );

        await loadAll();
      } catch (error: any) {
        showToast(
          isRTL ? 'خطأ' : 'Error',
          error?.message ||
            'Failed to update terminal',
          'error'
        );
      }
    };

  const openHistory =
    async (
      terminal: PosTerminal
    ) => {
      try {
        const details =
          await api.getPosTerminal(
            terminal.id
          );

        setSelectedTerminal(details);
        setHistoryRows(
          details.mappingHistory || []
        );

        setHistoryOpen(true);
      } catch (error: any) {
        showToast(
          isRTL ? 'خطأ' : 'Error',
          error?.message ||
            'Failed to load mapping history',
          'error'
        );
      }
    };

  const columns:
    Column<PosTerminal>[] = [
      {
        key: 'terminalReference',
        header:
          isRTL
            ? 'مرجع جهاز الدفع'
            : 'Terminal Reference',

        sortable: true,

        render: row => (
          <div>
            <div className="font-mono text-sm font-bold text-slate-100">
              {row.terminalReference}
            </div>

            <div className="text-[10px] text-slate-500 mt-0.5">
              {row.displayName}
            </div>
          </div>
        )
      },

      {
        key: 'providerName',
        header:
          isRTL
            ? 'مزود الدفع'
            : 'Provider',

        render: row => (
          <span className="text-xs text-slate-300">
            {row.providerName || '—'}
          </span>
        )
      },

      {
        key: 'isActive',
        header:
          isRTL
            ? 'الحالة'
            : 'Status',

        render: row => (
          <span
            className={
              row.isActive !== false
                ? 'inline-flex rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-400'
                : 'inline-flex rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-400'
            }
          >
            {row.isActive !== false
              ? (
                  isRTL
                    ? 'نشط'
                    : 'ACTIVE'
                )
              : (
                  isRTL
                    ? 'غير نشط'
                    : 'INACTIVE'
                )}
          </span>
        )
      },

      {
        key: 'currentMapping',
        header:
          isRTL
            ? 'الماكينة الحالية'
            : 'Current Machine',

        render: row => (
          row.currentMapping
            ? (
                <div>
                  <div className="text-xs font-semibold text-blue-300">
                    {machineLabel(
                      row.currentMapping.machine
                    )}
                  </div>

                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {isRTL
                      ? 'منذ '
                      : 'Since '}

                    {new Date(
                      row.currentMapping.effectiveFrom
                    ).toLocaleString()}
                  </div>
                </div>
              )
            : (
                <span className="text-xs text-amber-400">
                  {isRTL
                    ? 'غير مربوط'
                    : 'UNMAPPED'}
                </span>
              )
        )
      },

      {
        key: 'actions',
        header:
          isRTL
            ? 'الإجراءات'
            : 'Actions',

        render: row => (
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                openAssign(row)
              }
            >
              <Link2 className="w-3.5 h-3.5" />

              {row.currentMapping
                ? (
                    isRTL
                      ? 'إعادة ربط'
                      : 'Reassign'
                  )
                : (
                    isRTL
                      ? 'ربط'
                      : 'Assign'
                  )}
            </Button>

            {row.currentMapping && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  unassign(row)
                }
              >
                <Link2Off className="w-3.5 h-3.5" />

                {isRTL
                  ? 'فك الربط'
                  : 'Unassign'}
              </Button>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                openHistory(row)
              }
            >
              <History className="w-3.5 h-3.5" />

              {isRTL
                ? 'السجل'
                : 'History'}
            </Button>

            <Button
              size="sm"
              variant={
                row.isActive !== false
                  ? 'danger'
                  : 'success'
              }
              disabled={
                row.isActive !== false &&
                !!row.currentMapping
              }
              onClick={() =>
                toggleActive(row)
              }
            >
              {row.isActive !== false
                ? (
                    isRTL
                      ? 'تعطيل'
                      : 'Deactivate'
                  )
                : (
                    isRTL
                      ? 'تفعيل'
                      : 'Activate'
                  )}
            </Button>
          </div>
        )
      }
    ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-blue-400" />

            <h2 className="text-xl font-bold text-slate-100">
              {isRTL
                ? 'أجهزة الدفع وربط الماكينات'
                : 'POS Terminal Registry & Machine Mapping'}
            </h2>
          </div>

          <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
            {isRTL
              ? 'سجل الرقم المرجعي لكل جهاز دفع وربطه بالماكينة الصحيحة مع الاحتفاظ بتاريخ انتقال الجهاز بين الماكينات. لا يتم تخزين أرقام البطاقات أو PAN أو CVV.'
              : 'Register each payment-terminal reference and map it to the correct machine while preserving historical assignments. Card PAN/CVV data is never stored.'}
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadAll}
          >
            <RefreshCw className="w-3.5 h-3.5" />

            {isRTL
              ? 'تحديث'
              : 'Refresh'}
          </Button>

          <Button
            size="sm"
            onClick={() =>
              setCreateOpen(true)
            }
          >
            <Plus className="w-3.5 h-3.5" />

            {isRTL
              ? 'تسجيل جهاز دفع'
              : 'Register Terminal'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Metric
          label={
            isRTL
              ? 'إجمالي الأجهزة'
              : 'Total Terminals'
          }
          value={summary.totalTerminals}
        />

        <Metric
          label={
            isRTL
              ? 'نشطة'
              : 'Active'
          }
          value={summary.activeTerminals}
        />

        <Metric
          label={
            isRTL
              ? 'مربوطة الآن'
              : 'Mapped Now'
          }
          value={summary.mappedNow}
        />

        <Metric
          label={
            isRTL
              ? 'غير مربوطة'
              : 'Unmapped'
          }
          value={summary.unmappedNow}
        />

        <Metric
          label={
            isRTL
              ? 'سجل الربط'
              : 'Mapping History'
          }
          value={summary.mappingHistoryCount}
        />
      </div>

      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-xs text-slate-300 leading-relaxed">
        {isRTL
          ? 'الرقم المرجعي للجهاز ثابت ولا يُعاد استخدامه. عند نقل جهاز دفع من ماكينة إلى أخرى يتم إغلاق الربط القديم بتاريخ النقل وإنشاء ربط جديد، لذلك تظل المعاملات التاريخية مرتبطة بالماكينة التي كان الجهاز يعمل عليها وقت المعاملة.'
          : 'A terminal reference is immutable and never reused. Moving a terminal closes the old mapping at the transfer timestamp and creates a new mapping, preserving historical transaction-to-machine resolution.'}
      </div>

      <DataTable
        columns={columns}
        data={terminals}
        isLoading={loading}
        searchKeys={[
          'terminalReference',
          'displayName',
          'providerName'
        ]}
        searchPlaceholder={
          isRTL
            ? 'بحث برقم الجهاز أو الاسم أو مزود الدفع...'
            : 'Search terminal reference, name or provider...'
        }
        emptyTitle={
          isRTL
            ? 'لا توجد أجهزة دفع مسجلة'
            : 'No POS terminals registered'
        }
        emptySubtitle={
          isRTL
            ? 'يمكن أن يعمل نظام المبيعات بدون POS. أضف الأجهزة فقط عند توفر بيانات كشف المعاملات.'
            : 'Sales continue to work without POS. Register terminals only when transaction-statement data is available.'
        }
      />

      <Modal
        isOpen={createOpen}
        onClose={() =>
          setCreateOpen(false)
        }
        title={
          isRTL
            ? 'تسجيل جهاز دفع'
            : 'Register POS Terminal'
        }
      >
        <form
          onSubmit={submitCreate}
          className="space-y-4"
        >
          <Field
            label={
              isRTL
                ? 'الرقم المرجعي في كشف البنك / مزود الدفع *'
                : 'Bank / Provider Terminal Reference *'
            }
          >
            <input
              required
              value={
                createDraft.terminalReference
              }
              onChange={event =>
                setCreateDraft({
                  ...createDraft,
                  terminalReference:
                    event.target.value
                })
              }
              className={inputClass}
            />

            <p className="text-[10px] text-amber-400 mt-1">
              {isRTL
                ? 'سيصبح هذا المرجع ثابتًا بعد التسجيل لأنه مفتاح مطابقة المعاملات.'
                : 'This reference becomes immutable after registration because it is the transaction-matching key.'}
            </p>
          </Field>

          <Field
            label={
              isRTL
                ? 'اسم توضيحي'
                : 'Display Name'
            }
          >
            <input
              value={
                createDraft.displayName
              }
              onChange={event =>
                setCreateDraft({
                  ...createDraft,
                  displayName:
                    event.target.value
                })
              }
              className={inputClass}
            />
          </Field>

          <Field
            label={
              isRTL
                ? 'مزود الدفع'
                : 'Payment Provider'
            }
          >
            <input
              value={
                createDraft.providerName
              }
              onChange={event =>
                setCreateDraft({
                  ...createDraft,
                  providerName:
                    event.target.value
                })
              }
              className={inputClass}
            />
          </Field>

          <Field
            label={
              isRTL
                ? 'ملاحظات'
                : 'Notes'
            }
          >
            <textarea
              rows={3}
              value={createDraft.notes}
              onChange={event =>
                setCreateDraft({
                  ...createDraft,
                  notes:
                    event.target.value
                })
              }
              className={inputClass}
            />
          </Field>

          <SubmitRow
            loading={submitting}
            isRTL={isRTL}
            onCancel={() =>
              setCreateOpen(false)
            }
            label={
              isRTL
                ? 'تسجيل الجهاز'
                : 'Register Terminal'
            }
          />
        </form>
      </Modal>

      <Modal
        isOpen={assignOpen}
        onClose={() =>
          setAssignOpen(false)
        }
        title={
          selectedTerminal?.currentMapping
            ? (
                isRTL
                  ? 'إعادة ربط جهاز الدفع'
                  : 'Reassign POS Terminal'
              )
            : (
                isRTL
                  ? 'ربط جهاز الدفع بالماكينة'
                  : 'Assign POS Terminal'
              )
        }
      >
        <form
          onSubmit={submitAssign}
          className="space-y-4"
        >
          <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3">
            <div className="text-[10px] text-slate-500">
              {isRTL
                ? 'جهاز الدفع'
                : 'Terminal'}
            </div>

            <div className="font-mono text-sm font-bold text-slate-100 mt-1">
              {selectedTerminal?.terminalReference}
            </div>

            {selectedTerminal?.currentMapping && (
              <div className="text-xs text-amber-300 mt-2">
                {isRTL
                  ? 'الربط الحالي: '
                  : 'Current mapping: '}

                {machineLabel(
                  selectedTerminal.currentMapping.machine
                )}
              </div>
            )}
          </div>

          <Field
            label={
              isRTL
                ? 'الماكينة الجديدة *'
                : 'Target Machine *'
            }
          >
            <select
              required
              value={assignDraft.machineId}
              onChange={event =>
                setAssignDraft({
                  ...assignDraft,
                  machineId:
                    event.target.value
                })
              }
              className={inputClass}
            >
              <option value="">
                {isRTL
                  ? 'اختر الماكينة'
                  : 'Select machine'}
              </option>

              {machines.map(machine => (
                <option
                  key={machine.id}
                  value={machine.id}
                >
                  #{machine.machineNumber}
                  {' — '}
                  {machine.serialNumber || machine.machineType}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label={
              isRTL
                ? 'بداية سريان الربط'
                : 'Effective From'
            }
          >
            <input
              type="datetime-local"
              value={assignDraft.effectiveFrom}
              onChange={event =>
                setAssignDraft({
                  ...assignDraft,
                  effectiveFrom:
                    event.target.value
                })
              }
              className={inputClass}
            />

            <p className="text-[10px] text-slate-500 mt-1">
              {isRTL
                ? 'اتركه فارغًا لاستخدام الوقت الحالي.'
                : 'Leave blank to use the current time.'}
            </p>
          </Field>

          <Field
            label={
              isRTL
                ? 'ملاحظات الربط'
                : 'Mapping Notes'
            }
          >
            <textarea
              rows={3}
              value={assignDraft.notes}
              onChange={event =>
                setAssignDraft({
                  ...assignDraft,
                  notes:
                    event.target.value
                })
              }
              className={inputClass}
            />
          </Field>

          <SubmitRow
            loading={submitting}
            isRTL={isRTL}
            onCancel={() =>
              setAssignOpen(false)
            }
            label={
              isRTL
                ? 'حفظ الربط'
                : 'Save Mapping'
            }
          />
        </form>
      </Modal>

      <Modal
        isOpen={historyOpen}
        onClose={() =>
          setHistoryOpen(false)
        }
        title={
          isRTL
            ? 'السجل التاريخي لربط جهاز الدفع'
            : 'POS Terminal Mapping History'
        }
        maxWidth="2xl"
      >
        <div className="space-y-4">
          <div className="font-mono text-sm font-bold text-slate-100">
            {selectedTerminal?.terminalReference}
          </div>

          {historyRows.length === 0 ? (
            <div className="rounded-lg border border-slate-800 p-4 text-xs text-slate-500">
              {isRTL
                ? 'لا يوجد سجل ربط لهذا الجهاز حتى الآن.'
                : 'No mapping history exists for this terminal yet.'}
            </div>
          ) : (
            <div className="space-y-2">
              {historyRows.map(mapping => (
                <div
                  key={mapping.id}
                  className="rounded-lg border border-slate-800 bg-slate-950/40 p-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-100">
                      {machineLabel(mapping.machine)}
                    </div>

                    <span
                      className={
                        mapping.effectiveTo
                          ? 'text-[10px] text-slate-500'
                          : 'text-[10px] text-emerald-400 font-bold'
                      }
                    >
                      {mapping.effectiveTo
                        ? (
                            isRTL
                              ? 'ربط سابق'
                              : 'HISTORICAL'
                          )
                        : (
                            isRTL
                              ? 'الربط الحالي'
                              : 'CURRENT'
                          )}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-[11px]">
                    <div>
                      <span className="text-slate-500">
                        {isRTL
                          ? 'من: '
                          : 'From: '}
                      </span>

                      <span className="text-slate-300">
                        {new Date(
                          mapping.effectiveFrom
                        ).toLocaleString()}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500">
                        {isRTL
                          ? 'إلى: '
                          : 'To: '}
                      </span>

                      <span className="text-slate-300">
                        {mapping.effectiveTo
                          ? new Date(
                              mapping.effectiveTo
                            ).toLocaleString()
                          : (
                              isRTL
                                ? 'حتى الآن'
                                : 'Present'
                            )}
                      </span>
                    </div>
                  </div>

                  {mapping.notes && (
                    <div className="text-xs text-slate-400 mt-2">
                      {mapping.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

const Metric:
React.FC<{
  label: string;
  value: number;
}> = ({
  label,
  value
}) => (
  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
    <div className="text-[10px] text-slate-400">
      {label}
    </div>

    <div className="text-xl font-bold text-slate-100 mt-2">
      {value}
    </div>
  </div>
);

const Field:
React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({
  label,
  children
}) => (
  <div>
    <label className="block text-xs font-semibold text-slate-300 mb-1">
      {label}
    </label>

    {children}
  </div>
);

const SubmitRow:
React.FC<{
  loading: boolean;
  isRTL: boolean;
  onCancel: () => void;
  label: string;
}> = ({
  loading,
  isRTL,
  onCancel,
  label
}) => (
  <div className="flex justify-end gap-2 pt-2">
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={onCancel}
    >
      {isRTL
        ? 'إلغاء'
        : 'Cancel'}
    </Button>

    <Button
      type="submit"
      size="sm"
      variant="primary"
      isLoading={loading}
    >
      {label}
    </Button>
  </div>
);

import React from 'react';
import {
  Sparkles,
  UserCheck,
  Check,
  Play,
  Clock,
  Package,
  CheckCircle2,
  ShieldCheck,
  Archive,
  ArrowRight,
  AlertCircle
} from 'lucide-react';
import { Ticket, TicketStatus } from '../../types';
import { useLanguage } from '../../context/LanguageContext';

interface TicketWorkflowStepperProps {
  ticket: Ticket;
  onTriage?: () => void;
  onAssign?: () => void;
  onAccept?: () => void;
  onStartWork?: () => void;
  onRecordAction?: () => void;
  onRequestPart?: () => void;
  onResolve?: () => void;
  onVerify?: () => void;
  onClose?: () => void;
  canManage?: boolean;
}

const WORKFLOW_STEPS: Array<{
  status: TicketStatus;
  label: string;
  labelAr: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}> = [
  { status: 'NEW', label: 'New Incident', labelAr: 'بلاغ جديد', icon: Sparkles, description: 'Created by operator or public QR' },
  { status: 'TRIAGED', label: 'Triaged', labelAr: 'تم الفرز', icon: AlertCircle, description: 'Categorized and prioritized' },
  { status: 'ASSIGNED', label: 'Assigned', labelAr: 'تم التعيين', icon: UserCheck, description: 'Assigned to field technician' },
  { status: 'IN_PROGRESS', label: 'In Progress', labelAr: 'قيد الإصلاح', icon: Play, description: 'Technician on-site fixing unit' },
  { status: 'WAITING_FOR_PART', label: 'Parts Pending', labelAr: 'بانتظار القطع', icon: Package, description: 'Warehouse requisition active' },
  { status: 'RESOLVED', label: 'Resolved', labelAr: 'تم الحل', icon: CheckCircle2, description: 'Fix verified by technician' },
  { status: 'VERIFIED', label: 'Verified', labelAr: 'معتمد', icon: ShieldCheck, description: 'QA inspection completed' },
  { status: 'CLOSED', label: 'Closed', labelAr: 'مغلق ومؤرشف', icon: Archive, description: 'Audited and archived' },
];

export const TicketWorkflowStepper: React.FC<TicketWorkflowStepperProps> = ({
  ticket,
  onTriage,
  onAssign,
  onAccept,
  onStartWork,
  onRecordAction,
  onRequestPart,
  onResolve,
  onVerify,
  onClose,
  canManage = true
}) => {
  const { formatDate, isRTL } = useLanguage();

  const getStepIndex = (status: TicketStatus): number => {
    switch (status) {
      case 'NEW': return 0;
      case 'TRIAGED': return 1;
      case 'ASSIGNED': return 2;
      case 'IN_PROGRESS': return 3;
      case 'WAITING_FOR_PART': return 4;
      case 'RESOLVED': return 5;
      case 'VERIFIED': return 6;
      case 'CLOSED': return 7;
      default: return 0;
    }
  };

  const currentIndex = getStepIndex(ticket.status);

  const getStepTimestamp = (status: TicketStatus): string | undefined => {
    switch (status) {
      case 'NEW': return ticket.createdAt;
      case 'TRIAGED': return ticket.triagedAt;
      case 'ASSIGNED': return ticket.acknowledgedAt || ticket.updatedAt;
      case 'IN_PROGRESS': return ticket.startedAt;
      case 'RESOLVED': return ticket.resolvedAt;
      case 'VERIFIED': return ticket.verifiedAt;
      case 'CLOSED': return ticket.closedAt;
      default: return undefined;
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            {isRTL ? 'مسار العمليات والاعتماد' : 'Audited Maintenance Lifecycle'}
          </h3>
          <p className="text-[11px] text-slate-500">
            {isRTL
              ? 'تتبع الحالة خطوة بخطوة من البلاغ وحتى الإغلاق والأرشفة'
              : 'End-to-end status progression with mandatory audit checkpoint logging'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30 font-semibold">
            Stage {currentIndex + 1} of {WORKFLOW_STEPS.length}: {ticket.status}
          </span>
        </div>
      </div>

      {/* Horizontal Step Bar */}
      <div className="overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-700">
        <div className="min-w-[780px] flex items-center justify-between relative">
          {/* Connector Line */}
          <div className="absolute top-5 left-6 right-6 h-0.5 bg-slate-800 -z-0" />
          <div
            className="absolute top-5 left-6 h-0.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 -z-0 transition-all duration-500"
            style={{
              width: `${Math.min(100, Math.max(0, (currentIndex / (WORKFLOW_STEPS.length - 1)) * 100))}%`
            }}
          />

          {WORKFLOW_STEPS.map((step, idx) => {
            const isCompleted = idx < currentIndex;
            const isCurrent = idx === currentIndex;
            const StepIcon = step.icon;
            const timestamp = getStepTimestamp(step.status);

            let stateClasses = 'bg-slate-950 border-slate-800 text-slate-600';
            if (isCompleted) {
              stateClasses = 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20';
            } else if (isCurrent) {
              if (ticket.status === 'WAITING_FOR_PART') {
                stateClasses = 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/30 animate-pulse';
              } else {
                stateClasses = 'bg-blue-600 text-white border-blue-400 shadow-lg shadow-blue-500/30 ring-4 ring-blue-500/20';
              }
            }

            return (
              <div key={step.status} className="flex flex-col items-center relative z-10 group min-w-[90px]">
                <div
                  className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold transition-all duration-300 ${stateClasses}`}
                >
                  {isCompleted ? <Check className="w-5 h-5 stroke-[2.5]" /> : <StepIcon className="w-4 h-4" />}
                </div>

                <span
                  className={`text-[11px] font-bold mt-2 text-center whitespace-nowrap ${
                    isCurrent ? 'text-blue-400 font-mono' : isCompleted ? 'text-slate-200' : 'text-slate-500'
                  }`}
                >
                  {isRTL ? step.labelAr : step.label}
                </span>

                {timestamp ? (
                  <span className="text-[9px] font-mono text-slate-400 mt-0.5 text-center">
                    {formatDate(timestamp).split(',')[0]}
                  </span>
                ) : (
                  <span className="text-[9px] font-mono text-slate-600 mt-0.5 text-center">—</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

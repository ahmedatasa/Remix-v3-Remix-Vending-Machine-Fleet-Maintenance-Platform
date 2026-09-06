import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ArrowLeft,
  Ticket as TicketIcon,
  Cpu,
  Clock,
  Wrench,
  Package,
  CheckCircle2,
  AlertCircle,
  User,
  Plus,
  Play,
  Layers,
  Send,
  DollarSign,
  AlertTriangle,
  Upload,
  Image as ImageIcon,
  FileText,
  ShieldCheck,
  Archive,
  Check,
  Eye,
  Camera,
  MapPin,
  Flame,
  CheckSquare,
  Search,
  Sparkles,
  PackagePlus,
  PackageCheck
} from 'lucide-react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { StatusBadge } from '../common/StatusBadge';
import { Modal } from '../common/Modal';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { TicketWorkflowStepper } from '../tickets/TicketWorkflowStepper';
import { TicketTimeline } from '../tickets/TicketTimeline';
import { useLanguage } from '../../context/LanguageContext';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import {
  Ticket,
  TicketStatus,
  TicketPriority,
  FaultCategory,
  NavigationTab,
  Technician,
  SparePart
} from '../../types';
import {
  api
} from '../../services/api';

interface TicketDetailViewProps {
  ticketId: string;
  onNavigate: (tab: NavigationTab, id?: string) => void;
}

export const TicketDetailView: React.FC<TicketDetailViewProps> = ({ ticketId, onNavigate }) => {
  const { t, formatDate, formatCurrency, isRTL } = useLanguage();
  const { showToast, addInAppNotification } = useNotification();
  const { user, canAssignTickets, canManageFleet, canCloseTicket, isReadOnly } = useAuth();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [spareParts, setSpareParts] = useState<SparePart[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals state
  const [isTriageOpen, setIsTriageOpen] = useState(false);
  const [triagePriority, setTriagePriority] = useState<TicketPriority>('HIGH');
  const [triageCategory, setTriageCategory] = useState<FaultCategory>('REFRIGERATION');
  const [triageComment, setTriageComment] = useState('');

  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [selectedTechId, setSelectedTechId] = useState('');
  const [assignComment, setAssignComment] = useState('');

  const [isAddActionOpen, setIsAddActionOpen] = useState(false);
  const [actionType, setActionType] = useState('CORRECTIVE_MAINTENANCE');
  const [actionTaken, setActionTaken] = useState('');
  const [actionRootCause, setActionRootCause] = useState('');
  const [actionDuration, setActionDuration] = useState(30);
  const [actionPartId, setActionPartId] = useState('');
  const [actionPartQty, setActionPartQty] = useState(1);

  const [isUploadPhotoOpen, setIsUploadPhotoOpen] = useState(false);
  const [photoCaption, setPhotoCaption] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFileName, setPhotoFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isAddNoteOpen, setIsAddNoteOpen] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(true);

  const [isRequestPartOpen, setIsRequestPartOpen] = useState(false);
  const [reqSearchTerm, setReqSearchTerm] = useState('');
  const [reqSelectedPart, setReqSelectedPart] = useState<SparePart | null>(null);
  const [reqIsCustom, setReqIsCustom] = useState(false);
  const [reqCustomName, setReqCustomName] = useState('');
  const [reqCustomSku, setReqCustomSku] = useState('');
  const [reqCustomCost, setReqCustomCost] = useState('');
  const [reqQty, setReqQty] = useState(1);
  const [reqPriority, setReqPriority] = useState<TicketPriority>('HIGH');
  const [reqReason, setReqReason] = useState('');
  const [reqNotes, setReqNotes] = useState('');

  const [isResolveOpen, setIsResolveOpen] = useState(false);
  const [resolveRootCause, setResolveRootCause] = useState('');
  const [resolveSummary, setResolveSummary] = useState('');
  const [resolveDuration, setResolveDuration] = useState(45);
  const [resolvePartId, setResolvePartId] = useState('');
  const [resolvePartQty, setResolvePartQty] = useState(1);

  const [isVerifyOpen, setIsVerifyOpen] = useState(false);
  const [verifyComment, setVerifyComment] = useState('');

  const [isCloseOpen, setIsCloseOpen] = useState(false);
  const [closeComment, setCloseComment] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  const matchingSpareParts = useMemo(() => {
    if (!reqSearchTerm.trim()) return spareParts;
    const term = reqSearchTerm.trim().toLowerCase();
    return spareParts.filter(p =>
      (p.name && p.name.toLowerCase().includes(term)) ||
      (p.nameAr && p.nameAr.toLowerCase().includes(term)) ||
      (p.partNumber && p.partNumber.toLowerCase().includes(term)) ||
      (p.category && String(p.category).toLowerCase().includes(term)) ||
      (p.storageLocation && p.storageLocation.toLowerCase().includes(term))
    );
  }, [spareParts, reqSearchTerm]);

  const loadTicketData = async () => {
    try {
      setIsLoading(true);
      const [tck, techs, parts] = await Promise.all([
        api.getTicketById(ticketId),
        api.getTechnicians(),
        api.getSpareParts()
      ]);
      setTicket(tck || null);
      setTechnicians(techs);
      setSpareParts(parts);
      if (techs.length > 0) setSelectedTechId(techs[0].id);
      if (parts.length > 0) {
        setReqSelectedPart(parts[0]);
        setActionPartId(parts[0].id);
        setResolvePartId(parts[0].id);
      }
    } catch {
      showToast(t('error'), 'Failed to load ticket details', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTicketData();
  }, [ticketId]);

  if (isLoading) {
    return <LoadingSpinner message="Loading ticket dossier and maintenance audit trail..." />;
  }

  if (!ticket) {
    return (
      <div className="text-center py-16 bg-slate-900/40 rounded-xl border border-slate-800 p-8 max-w-xl mx-auto my-8">
        <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-100 mb-1">
          {isRTL ? 'التذكرة غير موجودة' : 'Ticket Not Found'}
        </h3>
        <p className="text-sm text-slate-400 mb-6">
          {isRTL ? 'لم يتم العثور على التذكرة المطلوبة أو ربما تم حذفها.' : 'The requested ticket could not be found or has been removed.'}
        </p>
        <button
          onClick={() => onNavigate('tickets')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors inline-flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{isRTL ? 'العودة لقائمة التذاكر' : 'Back to Tickets'}</span>
        </button>
      </div>
    );
  }

  // Action Handlers
  const handleTriage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !canAssignTickets) return;
    setIsSubmitting(true);
    try {
      await api.triageTicket(ticket.id, {
        priority: triagePriority,
        category: triageCategory,
        comment: triageComment || 'Ticket evaluated, categorized, and prioritized.'
      });
      showToast(t('success'), `Ticket ${ticket.ticketNumber} triaged!`, 'success');
      setIsTriageOpen(false);
      await loadTicketData();
    } catch {
      showToast(t('error'), 'Triage failed', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !canAssignTickets || !selectedTechId) return;
    setIsSubmitting(true);
    try {
      await api.assignTicket(ticket.id, selectedTechId, assignComment);
      showToast(t('success'), 'Technician assigned successfully!', 'success');
      setIsAssignOpen(false);
      await loadTicketData();
    } catch {
      showToast(t('error'), 'Assignment failed', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAccept = async () => {
    if (isReadOnly) return;
    setIsSubmitting(true);
    try {
      await api.acceptTicket(ticket.id, undefined, 'Field technician accepted ticket dispatch and acknowledged SLA.');
      showToast(t('success'), 'Ticket accepted! SLA clock is active.', 'success');
      await loadTicketData();
    } catch {
      showToast(t('error'), 'Acceptance failed', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartWork = async () => {
    if (isReadOnly) return;
    setIsSubmitting(true);
    try {
      await api.startWork(ticket.id, undefined, 'Technician arrived on site at machine unit and commenced diagnostics.');
      showToast(t('success'), 'Work started: Status is now IN PROGRESS.', 'success');
      await loadTicketData();
    } catch {
      showToast(t('error'), 'Failed to start work', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !actionTaken.trim()) return;
    setIsSubmitting(true);
    try {
      const selectedPart = spareParts.find(p => p.id === actionPartId);
      const partsReplaced = selectedPart && actionPartQty > 0 ? [{
        partNumber: selectedPart.partNumber,
        name: selectedPart.name,
        quantity: Number(actionPartQty),
        unitCost: selectedPart.unitCost
      }] : undefined;

      await api.addTicketAction(ticket.id, {
        actionType,
        actionTaken,
        description: actionTaken,
        rootCause: actionRootCause,
        durationMinutes: Number(actionDuration),
        partsReplaced
      });

      showToast(t('success'), 'Maintenance action logged to timeline & audit ledger!', 'success');
      setIsAddActionOpen(false);
      setActionTaken('');
      setActionRootCause('');
      await loadTicketData();
    } catch {
      showToast(t('error'), 'Failed to log action', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFileName(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    const photoUrl = photoPreview || 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?w=800&auto=format&fit=crop&q=80';
    const fileName = photoFileName || `site-photo-${Date.now()}.jpg`;

    setIsSubmitting(true);
    try {
      await api.uploadTicketPhoto(ticket.id, {
        fileName,
        fileUrl: photoUrl,
        caption: photoCaption || 'On-site technical inspection photo',
        uploadedBy: user?.name || ticket.assignedTechnician?.fullName || 'Technician',
        uploaderRole: user?.role || 'TECHNICIAN'
      });

      showToast(t('success'), 'Inspection photo uploaded and attached to timeline!', 'success');
      setIsUploadPhotoOpen(false);
      setPhotoPreview(null);
      setPhotoCaption('');
      setPhotoFileName('');
      await loadTicketData();
    } catch {
      showToast(t('error'), 'Failed to upload photo', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !noteContent.trim()) return;
    setIsSubmitting(true);
    try {
      await api.addTicketNote(ticket.id, {
        authorName: user?.name || ticket.assignedTechnician?.fullName || 'Technician',
        authorRole: user?.role || 'Technician',
        content: noteContent.trim(),
        isInternal: isInternalNote
      });

      showToast(t('success'), 'Work log note appended to ticket audit trail!', 'success');
      setIsAddNoteOpen(false);
      setNoteContent('');
      await loadTicketData();
    } catch {
      showToast(t('error'), 'Failed to add note', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenRequestPart = () => {
    if (isReadOnly) return;
    setReqSearchTerm('');
    setReqSelectedPart(spareParts.length > 0 ? spareParts[0] : null);
    setReqIsCustom(false);
    setReqCustomName('');
    setReqCustomSku('');
    setReqCustomCost('');
    setReqQty(1);
    setReqPriority('HIGH');
    setReqReason('');
    setReqNotes('');
    setIsRequestPartOpen(true);
  };

  const handleRequestPart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    if (reqIsCustom) {
      const name = reqCustomName.trim() || reqSearchTerm.trim();
      if (!name) {
        showToast(t('error'), isRTL ? 'يرجى إدخال اسم قطعة الغيار المطلوبة' : 'Please enter the spare part name', 'error');
        return;
      }
    } else {
      if (!reqSelectedPart) {
        showToast(t('error'), isRTL ? 'يرجى اختيار أو البحث عن قطعة الغيار من الكتالوج أو التبديل إلى طلب جديد' : 'Please select a catalog part or switch to new custom part request', 'error');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (reqIsCustom) {
        const finalPartName = reqCustomName.trim() || reqSearchTerm.trim();
        const finalSku = reqCustomSku.trim() || `REQ-NEW-${Math.floor(1000 + Math.random() * 9000)}`;
        const estCost = Number(reqCustomCost) || 0;

        await api.requestTicketPart(ticket.id, {
          technicianId: user?.id,
          partName: finalPartName,
          partNumber: finalSku,
          isCustomPart: true,
          estimatedCost: estCost,
          quantity: Number(reqQty),
          priority: reqPriority,
          reason: reqReason || (isRTL ? `طلب توريد وشراء قطعة غيار جديدة غير مدرجة بالمخزن للبلاغ ${ticket.ticketNumber}` : `Requisition for uncataloged part for ticket ${ticket.ticketNumber}`),
          notes: reqNotes
        });

        showToast(
          t('success'),
          isRTL
            ? `تم تسجيل طلب توريد لقطعة جديدة: ${finalPartName}! تحولت حالة التذكرة إلى في انتظار القطع.`
            : `Requisition filed for new procurement item: ${finalPartName}! Status updated to WAITING_FOR_PART.`,
          'success'
        );

        addInAppNotification({
          title: isRTL ? `طلب توريد جديد: ${finalPartName}` : `New Procurement Request: ${finalPartName}`,
          message: isRTL
            ? `الكمية: ${reqQty} للبلاغ ${ticket.ticketNumber} (طلب شراء خارجي)`
            : `Qty: ${reqQty} requested for ${ticket.ticketNumber} (external procurement)`,
          type: 'PART_REQUEST',
          linkTab: 'part-requests'
        });
      } else {
        const part = reqSelectedPart!;
        await api.requestTicketPart(ticket.id, {
          technicianId: user?.id,
          sparePartId: part.id,
          partName: part.nameAr || part.name,
          partNumber: part.partNumber,
          quantity: Number(reqQty),
          priority: reqPriority,
          reason: reqReason || (isRTL ? `طلب صرف قطعة من المخزن للبلاغ ${ticket.ticketNumber}` : `Requisition for warehouse item for ticket ${ticket.ticketNumber}`),
          notes: reqNotes
        });

        showToast(
          t('success'),
          isRTL
            ? `تم تقديم طلب صرف قطعة الغيار: ${part.nameAr || part.name}! تحولت حالة التذكرة إلى في انتظار القطع.`
            : `Requisition submitted for ${part.name}! Status updated to WAITING_FOR_PART.`,
          'success'
        );

        addInAppNotification({
          title: isRTL ? `طلب صرف قطعة: ${part.partNumber}` : `Spare Part Requisition: ${part.partNumber}`,
          message: isRTL
            ? `الكمية: ${reqQty} من ${part.nameAr || part.name} للبلاغ ${ticket.ticketNumber}`
            : `Quantity: ${reqQty} requested for ${ticket.ticketNumber}`,
          type: 'PART_REQUEST',
          linkTab: 'part-requests'
        });
      }

      setIsRequestPartOpen(false);
      await loadTicketData();
    } catch (err: any) {
      showToast(t('error'), err?.message || 'Failed to request part', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !resolveSummary.trim() || !resolveRootCause.trim()) return;
    setIsSubmitting(true);
    try {
      const selectedPart = spareParts.find(p => p.id === resolvePartId);
      const partsUsed = selectedPart && resolvePartQty > 0 ? [{
        sparePart: selectedPart,
        partId: selectedPart.id,
        quantity: Number(resolvePartQty),
        unitCostAtUse: selectedPart.unitCost
      }] : undefined;

      await api.resolveTicket(ticket.id, {
        rootCause: resolveRootCause.trim(),
        resolutionSummary: resolveSummary.trim(),
        durationMinutes: Number(resolveDuration),
        partsUsed
      });

      showToast(t('success'), `Ticket ${ticket.ticketNumber} resolved! Machine health restored.`, 'success');
      addInAppNotification({
        title: `Ticket Resolved: ${ticket.ticketNumber}`,
        message: resolveSummary,
        type: 'SYSTEM_ALERT',
        linkTab: 'ticket-detail',
        linkId: ticket.id
      });

      setIsResolveOpen(false);
      await loadTicketData();
    } catch {
      showToast(t('error'), 'Failed to resolve ticket', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !canCloseTicket) return;
    setIsSubmitting(true);
    try {
      await api.verifyTicket(ticket.id, {
        verifiedBy: user?.name || 'QA Lead / Supervisor',
        comment: verifyComment || 'Post-repair telemetry verified. Machine is fully operational.'
      });

      showToast(t('success'), 'Ticket verified and approved!', 'success');
      setIsVerifyOpen(false);
      await loadTicketData();
    } catch {
      showToast(t('error'), 'Verification failed', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !canCloseTicket) return;
    setIsSubmitting(true);
    try {
      await api.closeTicket(ticket.id, {
        closedBy: user?.name || 'System Administrator',
        comment: closeComment || 'Ticket formally closed and archived into system ledger.'
      });

      showToast(t('success'), 'Ticket closed and archived!', 'success');
      setIsCloseOpen(false);
      await loadTicketData();
    } catch {
      showToast(t('error'), 'Close failed', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Navigation & Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <button
          onClick={() => onNavigate('tickets')}
          className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-slate-100 transition-colors cursor-pointer bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('tickets')}</span>
        </button>

        {/* Dynamic Workflow Actions according to ticket state */}
        <div className="flex flex-wrap items-center gap-2">
          {isReadOnly ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300 text-xs font-medium">
              <Eye className="w-3.5 h-3.5 text-slate-400" />
              <span>{isRTL ? 'صلاحية مشاهدة وتدقيق فقط (غير مصرح بالتعديل)' : 'Read-Only Audit Mode (Modifications Disabled)'}</span>
            </div>
          ) : (
            <>
              {ticket.status === 'NEW' && canAssignTickets && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={AlertCircle}
                    onClick={() => {
                      setTriagePriority(ticket.priority);
                      setTriageCategory(ticket.category);
                      setIsTriageOpen(true);
                    }}
                  >
                    {t('triageTicket')}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={User}
                    onClick={() => setIsAssignOpen(true)}
                  >
                    {t('assignTechnician')}
                  </Button>
                </>
              )}

              {ticket.status === 'TRIAGED' && canAssignTickets && (
                <Button
                  variant="primary"
                  size="sm"
                  icon={User}
                  onClick={() => setIsAssignOpen(true)}
                >
                  {t('assignTechnician')}
                </Button>
              )}

              {ticket.status === 'ASSIGNED' && (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Check}
                    onClick={handleAccept}
                  >
                    {t('acceptTicket')}
                  </Button>
                  <Button
                    variant="success"
                    size="sm"
                    icon={Play}
                    onClick={handleStartWork}
                  >
                    {t('startWork')}
                  </Button>
                </>
              )}

              {(ticket.status === 'IN_PROGRESS' || ticket.status === 'WAITING_FOR_PART') && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={Wrench}
                    onClick={() => setIsAddActionOpen(true)}
                  >
                    {t('addAction')}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    icon={Camera}
                    onClick={() => setIsUploadPhotoOpen(true)}
                  >
                    {t('uploadPhoto')}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    icon={FileText}
                    onClick={() => setIsAddNoteOpen(true)}
                  >
                    {t('addNote')}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    icon={Package}
                    onClick={handleOpenRequestPart}
                  >
                    {t('requestParts')}
                  </Button>

                  <Button
                    variant="success"
                    size="sm"
                    icon={CheckCircle2}
                    onClick={() => setIsResolveOpen(true)}
                  >
                    {t('resolveTicket')}
                  </Button>
                </>
              )}

              {ticket.status === 'RESOLVED' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={FileText}
                    onClick={() => setIsAddNoteOpen(true)}
                  >
                    {t('addNote')}
                  </Button>

                  {canCloseTicket && (
                    <Button
                      variant="primary"
                      size="sm"
                      icon={ShieldCheck}
                      onClick={() => setIsVerifyOpen(true)}
                    >
                      {t('verifyTicket')}
                    </Button>
                  )}
                </>
              )}

              {ticket.status === 'VERIFIED' && canCloseTicket && (
                <Button
                  variant="outline"
                  size="sm"
                  icon={Archive}
                  onClick={() => setIsCloseOpen(true)}
                >
                  {t('closeTicket')}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Workflow Stepper Bar */}
      <TicketWorkflowStepper
        ticket={ticket}
        onTriage={() => setIsTriageOpen(true)}
        onAssign={() => setIsAssignOpen(true)}
        onAccept={handleAccept}
        onStartWork={handleStartWork}
        onRecordAction={() => setIsAddActionOpen(true)}
        onRequestPart={handleOpenRequestPart}
        onResolve={() => setIsResolveOpen(true)}
        onVerify={() => setIsVerifyOpen(true)}
        onClose={() => setIsCloseOpen(true)}
        canManage={!isReadOnly && (canManageFleet || canAssignTickets)}
      />

      {/* Ticket Header Profile Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold font-mono text-slate-100 flex items-center gap-2">
                <TicketIcon className="w-6 h-6 text-blue-400" />
                <span>{ticket.ticketNumber}</span>
              </h1>
              <StatusBadge type="priority" status={ticket.priority} />
              <StatusBadge type="ticket" status={ticket.status} />
              {ticket.isRecurring && (
                <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-400 text-xs font-bold font-mono flex items-center gap-1 border border-rose-500/30">
                  <Flame className="w-3.5 h-3.5" />
                  Chronic Failure ({ticket.recurringOccurrenceCount}x)
                </span>
              )}
            </div>

            <p className="text-xs text-slate-400 mt-1.5 flex flex-wrap items-center gap-3">
              <span>Reported: <strong className="text-slate-200">{formatDate(ticket.createdAt)}</strong></span>
              <span>•</span>
              <span>Source: <strong className="text-blue-400">{ticket.source}</strong></span>
              <span>•</span>
              <span>Reporter: <strong className="text-slate-200">{ticket.reporterName || 'Automated Telemetry'}</strong></span>
              {ticket.reporterPhone && (
                <>
                  <span>•</span>
                  <span>Contact: <strong className="text-slate-300 font-mono">{ticket.reporterPhone}</strong></span>
                </>
              )}
            </p>
          </div>

          {/* SLA Countdown Card */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                {t('slaDue')}
              </span>
              <span className="text-xs font-mono font-bold text-amber-300">
                {formatDate(ticket.slaDueAt)}
              </span>
            </div>
          </div>
        </div>

        {/* Issue Description Box */}
        <div className="pt-3 border-t border-slate-800">
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="text-xs font-semibold text-slate-300">
              {t('description')}
            </h4>
            <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
              Fault Category: {ticket.category}
            </span>
          </div>
          <p className="text-xs text-slate-200 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 leading-relaxed font-sans">
            {ticket.description}
          </p>
        </div>
      </div>

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Target Hardware & Technician Assignment & Spare Parts */}
        <div className="space-y-6">
          {/* Target Machine */}
          <Card
            title="Target Machine Unit"
            subtitle="Hardware serial and location hierarchy"
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate('machine-detail', ticket.machine?.id || '')}
              >
                View Machine
              </Button>
            }
          >
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-blue-400 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5" />
                  {ticket.machine?.machineNumber || 'VM-UNKNOWN'}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                  SN: {ticket.machine?.serialNumber || 'SN-N/A'}
                </span>
              </div>

              <div className="text-xs text-slate-300">
                <span className="text-slate-400">Model:</span> {typeof ticket.machine?.model === 'object' && ticket.machine.model !== null ? ((ticket.machine.model as any).modelName || (ticket.machine.model as any).name || (ticket.machine.model as any).code || 'Smart Dispenser Pro') : (ticket.machine?.model || 'Smart Dispenser Pro')}
              </div>

              <div className="text-xs text-slate-300 flex items-start gap-1.5 pt-2 border-t border-slate-800/60">
                <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-200 block">
                    {ticket.location?.building?.name || 'Main Campus'}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {ticket.location?.floor?.name || 'Floor 1'} • {ticket.location?.areaZone || ticket.location?.fullDescription || 'Lobby Zone'}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* Assigned Technician Profile */}
          <Card
            title={t('assignedTo')}
            subtitle="Responsible field technician"
            action={
              canAssignTickets ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAssignOpen(true)}
                >
                  Change
                </Button>
              ) : undefined
            }
          >
            {ticket.assignedTechnician ? (
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold text-xs font-mono">
                      {ticket.assignedTechnician.employeeCode.slice(-3)}
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-slate-200">
                        {ticket.assignedTechnician.fullName || ticket.assignedTechnician.employeeCode}
                      </h5>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {ticket.assignedTechnician.employeeCode}
                      </span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    {ticket.assignedTechnician.status}
                  </span>
                </div>

                <div className="text-xs text-slate-300 space-y-1 pt-2 border-t border-slate-800/60">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Specialization:</span>
                    <span className="text-slate-200 font-medium">{ticket.assignedTechnician.specialization}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Response SLA:</span>
                    <span className="text-emerald-400 font-mono font-semibold">
                      {ticket.assignedTechnician.kpis?.responseTimeMinutes || 15}m avg
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">First-Time Fix:</span>
                    <span className="text-blue-400 font-mono font-semibold">
                      {ticket.assignedTechnician.kpis?.firstTimeFixRate || 92}%
                    </span>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => onNavigate('technician-detail', ticket.assignedTechnician?.id || '')}
                >
                  View Technician Dossier
                </Button>
              </div>
            ) : (
              <div className="text-center py-6 space-y-3 bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
                <User className="w-8 h-8 text-slate-600 mx-auto" />
                <span className="text-xs text-slate-400 italic block">No technician assigned yet</span>
                {canAssignTickets && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setIsAssignOpen(true)}
                  >
                    Assign Field Technician
                  </Button>
                )}
              </div>
            )}
          </Card>

          {/* Requisitioned Spare Parts & Costs */}
          <Card
            title="Parts & Cost Ledger"
            subtitle="Replaced components & inventory billing"
            action={
              !isReadOnly && (ticket.status === 'IN_PROGRESS' || ticket.status === 'WAITING_FOR_PART') ? (
                <Button
                  variant="outline"
                  size="sm"
                  icon={Plus}
                  onClick={() => setIsRequestPartOpen(true)}
                >
                  Request
                </Button>
              ) : undefined
            }
          >
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-400">Total Parts Cost:</span>
                <span className="text-sm font-mono font-bold text-amber-400">
                  ${(ticket.totalPartsCost || 0).toFixed(2)}
                </span>
              </div>

              {ticket.maintenanceActions && ticket.maintenanceActions.length > 0 ? (
                <div className="space-y-2">
                  {ticket.maintenanceActions.map(action => (
                    <div key={action.id} className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800 text-xs space-y-1">
                      <div className="flex items-center justify-between font-semibold text-slate-200">
                        <span>{action.actionType.replace(/_/g, ' ')}</span>
                        <span className="text-slate-400 font-mono text-[10px]">{action.durationMinutes || 30}m labor</span>
                      </div>
                      {action.partsReplaced && action.partsReplaced.length > 0 && (
                        <div className="text-[11px] text-amber-300/90 font-mono">
                          Replaced: {action.partsReplaced[0].name} ({action.partsReplaced[0].quantity}x @ ${action.partsReplaced[0].unitCost})
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic text-center py-2">No spare parts charged to this incident.</p>
              )}
            </div>
          </Card>
        </div>

        {/* Right 2 Columns: Audit Timeline with Actions, Photos, Notes */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <TicketTimeline
              ticket={ticket}
              onOpenPhotoUpload={() => setIsUploadPhotoOpen(true)}
              onOpenAddAction={() => setIsAddActionOpen(true)}
              onOpenAddNote={() => setIsAddNoteOpen(true)}
            />
          </Card>
        </div>
      </div>

      {/* MODAL 1: Triage Ticket */}
      {isTriageOpen && (
        <Modal
          isOpen={isTriageOpen}
          onClose={() => setIsTriageOpen(false)}
          title="Triage Maintenance Incident"
          size="md"
        >
          <form onSubmit={handleTriage} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Priority Level</label>
              <select
                value={triagePriority}
                onChange={e => setTriagePriority(e.target.value as TicketPriority)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="CRITICAL">CRITICAL (1 Hour Response)</option>
                <option value="HIGH">HIGH (4 Hours Response)</option>
                <option value="MEDIUM">MEDIUM (8 Hours Response)</option>
                <option value="LOW">LOW (24 Hours Response)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Fault Classification Category</label>
              <select
                value={triageCategory}
                onChange={e => setTriageCategory(e.target.value as FaultCategory)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="REFRIGERATION">REFRIGERATION & COOLING</option>
                <option value="CARD_READER">PAYMENT / MDB CARD READER</option>
                <option value="PRODUCT_DISPENSING">MOTOR & DISPENSING SPIRAL</option>
                <option value="POWER">POWER / ELECTRICAL SUPPLY</option>
                <option value="SOFTWARE">TELEMETRY / FIRMWARE SOFTWARE</option>
                <option value="PHYSICAL_DAMAGE">PHYSICAL CHASSIS / GLASS</option>
                <option value="OTHER">OTHER MAINTENANCE</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Triage Diagnostic Notes</label>
              <textarea
                value={triageComment}
                onChange={e => setTriageComment(e.target.value)}
                placeholder="Notes on symptoms, customer reports, or automated sensor alert logs..."
                rows={3}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsTriageOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={isSubmitting}>
                Save Triage & Advance
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 2: Assign Technician */}
      {isAssignOpen && (
        <Modal
          isOpen={isAssignOpen}
          onClose={() => setIsAssignOpen(false)}
          title="Assign Technician Dispatch"
          size="md"
        >
          <form onSubmit={handleAssign} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Select Certified Technician</label>
              <select
                value={selectedTechId}
                onChange={e => setSelectedTechId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                {technicians.map(tech => (
                  <option key={tech.id} value={tech.id}>
                    {tech.employeeCode} — {tech.fullName || tech.employeeCode} ({tech.specialization}) [{tech.status}]
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Assignment Dispatch Instructions</label>
              <textarea
                value={assignComment}
                onChange={e => setAssignComment(e.target.value)}
                placeholder="Provide access codes, keycard info, or specific diagnostic requirements..."
                rows={3}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsAssignOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={isSubmitting}>
                Confirm Assignment
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 3: Add Maintenance Action */}
      {isAddActionOpen && (
        <Modal
          isOpen={isAddActionOpen}
          onClose={() => setIsAddActionOpen(false)}
          title="Record Maintenance Action & Labor"
          size="md"
        >
          <form onSubmit={handleAddAction} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Action Category</label>
              <select
                value={actionType}
                onChange={e => setActionType(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="CORRECTIVE_MAINTENANCE">CORRECTIVE MAINTENANCE</option>
                <option value="PART_REPLACEMENT">PART REPLACEMENT</option>
                <option value="CLEANING_AND_SANITIZATION">CLEANING & SANITIZATION</option>
                <option value="FIRMWARE_RELOAD">FIRMWARE / SOFTWARE UPDATE</option>
                <option value="CALIBRATION_TEST">CALIBRATION & DISPENSE TEST</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Action Description *</label>
              <textarea
                required
                value={actionTaken}
                onChange={e => setActionTaken(e.target.value)}
                placeholder="Specific procedures performed (e.g., cleared jam in column 3, tested compressor relay, replaced gasket)..."
                rows={3}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Diagnosed Root Cause</label>
              <input
                type="text"
                value={actionRootCause}
                onChange={e => setActionRootCause(e.target.value)}
                placeholder="e.g. Dust accumulation on condenser coils causing overheating"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Labor Duration (Minutes)</label>
                <input
                  type="number"
                  min="5"
                  max="480"
                  value={actionDuration}
                  onChange={e => setActionDuration(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Spare Part Consumed</label>
                <select
                  value={actionPartId}
                  onChange={e => setActionPartId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">No Part Used</option>
                  {spareParts.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.partNumber} - {p.name} (${p.unitCost})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsAddActionOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={isSubmitting}>
                Save Maintenance Action
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 4: Upload Photo Evidence */}
      {isUploadPhotoOpen && (
        <Modal
          isOpen={isUploadPhotoOpen}
          onClose={() => setIsUploadPhotoOpen(false)}
          title="Upload On-Site Photo Evidence"
          size="md"
        >
          <form onSubmit={handleUploadPhoto} className="space-y-4">
            <div className="border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-2xl p-6 text-center bg-slate-950/60 transition-colors">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoSelect}
                className="hidden"
              />

              {photoPreview ? (
                <div className="space-y-3">
                  <div className="max-h-48 rounded-xl overflow-hidden border border-slate-800 mx-auto flex items-center justify-center bg-black">
                    <img src={photoPreview} alt="Upload preview" className="max-h-48 object-contain" />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Change Image
                  </Button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="cursor-pointer space-y-2"
                >
                  <div className="w-12 h-12 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center mx-auto">
                    <Upload className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-semibold text-slate-200">
                    Click to browse or take inspection photo
                  </p>
                  <p className="text-[11px] text-slate-500">
                    JPEG, PNG, WebP up to 10MB
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Photo Caption / Context</label>
              <input
                type="text"
                value={photoCaption}
                onChange={e => setPhotoCaption(e.target.value)}
                placeholder="e.g. Broken refrigeration fan bearing before replacement"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsUploadPhotoOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={isSubmitting}>
                Upload & Attach
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 5: Add Work Note */}
      {isAddNoteOpen && (
        <Modal
          isOpen={isAddNoteOpen}
          onClose={() => setIsAddNoteOpen(false)}
          title="Append Work Log Note"
          size="md"
        >
          <form onSubmit={handleAddNote} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Note Content *</label>
              <textarea
                required
                value={noteContent}
                onChange={e => setNoteContent(e.target.value)}
                placeholder="Observations, client feedback, or temporary workarounds..."
                rows={4}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="internalNote"
                checked={isInternalNote}
                onChange={e => setIsInternalNote(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-0 cursor-pointer"
              />
              <label htmlFor="internalNote" className="text-xs text-slate-300 cursor-pointer">
                Internal team note (visible only to maintenance operations staff)
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsAddNoteOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={isSubmitting}>
                Append Note
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 6: Request Spare Part (Smart Catalog Lookup & New Procurement) */}
      {isRequestPartOpen && (
        <Modal
          isOpen={isRequestPartOpen}
          onClose={() => setIsRequestPartOpen(false)}
          title={isRTL ? "طلب قطعة غيار للصيانة" : "Spare Part Requisition"}
          subtitle={isRTL ? "ابحث بالاسم أو الكود في كتالوج المخزن، أو اطلب قطعة جديدة غير مدرجة" : "Search inventory catalog by typing name or SKU, or request an unlisted new part"}
          maxWidth="lg"
        >
          <form onSubmit={handleRequestPart} className="space-y-4">
            {/* Mode Switcher Tabs */}
            <div className="flex items-center gap-2 p-1 bg-slate-950 border border-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setReqIsCustom(false);
                  if (!reqSelectedPart && spareParts.length > 0) {
                    setReqSelectedPart(spareParts[0]);
                  }
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  !reqIsCustom
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                <span>{isRTL ? "البحث والتحقق في المخزن" : "Catalog Search & Verify"}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setReqIsCustom(true);
                  if (!reqCustomName && reqSearchTerm) {
                    setReqCustomName(reqSearchTerm);
                  }
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  reqIsCustom
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <PackagePlus className="w-3.5 h-3.5" />
                <span>{isRTL ? "طلب قطعة جديدة غير مدرجة" : "Request New Unlisted Part"}</span>
              </button>
            </div>

            {/* TAB 1: Smart Catalog Search Mode */}
            {!reqIsCustom && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                    <span>{isRTL ? "اكتب اسم أو كود قطعة الغيار للبحث في المخزن" : "Type Spare Part Name or SKU to check stock"}</span>
                    {reqSearchTerm && (
                      <button
                        type="button"
                        onClick={() => setReqSearchTerm('')}
                        className="text-[11px] text-slate-400 hover:text-slate-200 underline cursor-pointer"
                      >
                        {isRTL ? "مسح البحث" : "Clear"}
                      </button>
                    )}
                  </label>

                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 rtl:left-auto rtl:right-3 top-2.5 pointer-events-none" />
                    <input
                      type="text"
                      value={reqSearchTerm}
                      onChange={e => {
                        const val = e.target.value;
                        setReqSearchTerm(val);
                        // Auto-select exact or first match if available
                        const matches = spareParts.filter(p =>
                          (p.name && p.name.toLowerCase().includes(val.toLowerCase())) ||
                          (p.nameAr && p.nameAr.toLowerCase().includes(val.toLowerCase())) ||
                          (p.partNumber && p.partNumber.toLowerCase().includes(val.toLowerCase()))
                        );
                        if (matches.length > 0 && val.trim().length >= 2) {
                          setReqSelectedPart(matches[0]);
                        }
                      }}
                      placeholder={isRTL ? "مثال: صمام، حساس حرارة، سير، مضخة، VALVE-01..." : "e.g. valve, sensor, pump, filter, SKU-101..."}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 rtl:pl-3 rtl:pr-9 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                </div>

                {/* Selected Catalog Part Card */}
                {reqSelectedPart && (
                  <div className="p-3 bg-slate-950/80 border border-blue-500/40 rounded-xl space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-xs text-blue-400">
                            {reqSelectedPart.partNumber}
                          </span>
                          <span className="text-xs font-bold text-slate-100">
                            {reqSelectedPart.nameAr || reqSelectedPart.name}
                          </span>
                          {reqSelectedPart.nameAr && reqSelectedPart.name !== reqSelectedPart.nameAr && (
                            <span className="text-[11px] text-slate-400">
                              ({reqSelectedPart.name})
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          {isRTL ? "التصنيف:" : "Category:"} {String(reqSelectedPart.category)} • {isRTL ? "موقع التخزين:" : "Location:"} {reqSelectedPart.storageLocation || 'المستودع الرئيسي'}
                        </span>
                      </div>

                      {/* Stock availability indicator */}
                      <div className="text-right rtl:text-left shrink-0">
                        {reqSelectedPart.currentQuantity > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            {isRTL ? `متوفر بالمخزن (${reqSelectedPart.currentQuantity} قطعة)` : `In Stock (${reqSelectedPart.currentQuantity})`}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            <AlertCircle className="w-3 h-3" />
                            {isRTL ? "الرصيد 0 (إعادة تعبئة)" : "Out of Stock (0)"}
                          </span>
                        )}
                        <span className="text-[11px] font-mono text-slate-400 block mt-1">
                          ${reqSelectedPart.unitCost} / unit
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Search Matching Suggestions if filtering */}
                {reqSearchTerm.trim().length > 0 && matchingSpareParts.length > 0 && (
                  <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60 max-h-48 overflow-y-auto divide-y divide-slate-800/60">
                    <div className="px-3 py-1.5 bg-slate-900/60 text-[10px] font-semibold text-slate-400">
                      {isRTL ? `نتائج البحث في المخزن (${matchingSpareParts.length})` : `Warehouse Matching Items (${matchingSpareParts.length})`}
                    </div>
                    {matchingSpareParts.map(p => {
                      const isSelected = reqSelectedPart?.id === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setReqSelectedPart(p)}
                          className={`w-full text-left rtl:text-right px-3 py-2 text-xs flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                            isSelected ? 'bg-blue-600/20 text-blue-200' : 'hover:bg-slate-900 text-slate-300'
                          }`}
                        >
                          <div className="truncate">
                            <span className="font-mono font-bold text-slate-200 mr-2 rtl:mr-0 rtl:ml-2">
                              {p.partNumber}
                            </span>
                            <span>{p.nameAr || p.name}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                              p.currentQuantity > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                            }`}>
                              {p.currentQuantity > 0 ? `${p.currentQuantity} in stock` : '0 in stock'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">${p.unitCost}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* When typed part has NO matches in catalog */}
                {reqSearchTerm.trim().length > 0 && matchingSpareParts.length === 0 && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
                    <div className="flex items-start gap-2 text-xs text-amber-300">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                      <div>
                        <p className="font-semibold">
                          {isRTL ? `القطعة "${reqSearchTerm}" غير مسجلة في المخزن حالياً.` : `Part "${reqSearchTerm}" is not found in inventory.`}
                        </p>
                        <p className="text-[11px] text-amber-200/80 mt-0.5">
                          {isRTL ? "يمكنك تسجيل طلب توريد وشراء جديد مباشرة لقسم المشتريات." : "You can file a new procurement request for this uncataloged item."}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setReqIsCustom(true);
                        setReqCustomName(reqSearchTerm);
                      }}
                      className="w-full py-1.5 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow"
                    >
                      <PackagePlus className="w-3.5 h-3.5" />
                      <span>{isRTL ? `طلب توريد جديد باسم "${reqSearchTerm}"` : `Order as New Item: "${reqSearchTerm}"`}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Custom / New Unlisted Part Requisition Form */}
            {reqIsCustom && (
              <div className="space-y-3 bg-amber-500/5 border border-amber-500/20 p-3.5 rounded-xl">
                <div className="flex items-center justify-between pb-2 border-b border-amber-500/20">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                    <PackagePlus className="w-4 h-4 text-amber-400" />
                    <span>{isRTL ? "بيانات طلب قطعة جديدة غير مدرجة بالمخزن" : "New Non-Catalog Part Procurement Requisition"}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReqIsCustom(false)}
                    className="text-[11px] text-slate-400 hover:text-slate-200 underline cursor-pointer"
                  >
                    {isRTL ? "الرجوع لكتالوج المخزن" : "Back to catalog"}
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    {isRTL ? "اسم قطعة الغيار المطلوبة *" : "Part Name / Description *"}
                  </label>
                  <input
                    type="text"
                    required
                    value={reqCustomName}
                    onChange={e => setReqCustomName(e.target.value)}
                    placeholder={isRTL ? "اكتب اسم القطعة بالتفصيل..." : "e.g. High Pressure Solenoid Valve 24V"}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {isRTL ? "كود / موديل القطعة (إن وجد)" : "OEM Part # / Model (Optional)"}
                    </label>
                    <input
                      type="text"
                      value={reqCustomSku}
                      onChange={e => setReqCustomSku(e.target.value)}
                      placeholder="e.g. OEM-9942A"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {isRTL ? "التكلفة التقديرية للقطعة ($)" : "Estimated Unit Cost ($)"}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={reqCustomCost}
                      onChange={e => setReqCustomCost(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Common Request Details */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {isRTL ? "الكمية المطلوبة *" : "Required Quantity *"}
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  required
                  value={reqQty}
                  onChange={e => setReqQty(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {isRTL ? "درجة الأهمية / الأولوية *" : "Urgency Priority *"}
                </label>
                <select
                  value={reqPriority}
                  onChange={e => setReqPriority(e.target.value as TicketPriority)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="CRITICAL">{isRTL ? "حرجة للغاية (عاجل فوري)" : "CRITICAL (Immediate Dispatch)"}</option>
                  <option value="HIGH">{isRTL ? "عالية (صيانة طارئة)" : "HIGH (Urgent Maintenance)"}</option>
                  <option value="MEDIUM">{isRTL ? "متوسطة (عادية)" : "MEDIUM (Standard Restock)"}</option>
                  <option value="LOW">{isRTL ? "منخفضة" : "LOW"}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {isRTL ? "مبرر طلب القطعة وتفاصيل العطل" : "Requisition Justification / Failure Details"}
              </label>
              <textarea
                value={reqReason}
                onChange={e => setReqReason(e.target.value)}
                placeholder={isRTL ? "سبب الحاجة للقطعة وملاحظات العطل الفني..." : "Reason why component failed and why replacement is required..."}
                rows={2}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {isRTL ? "ملاحظات ومواصفات إضافية للمورد والمخزن" : "Additional Specs / Procurement Notes"}
              </label>
              <input
                type="text"
                value={reqNotes}
                onChange={e => setReqNotes(e.target.value)}
                placeholder={isRTL ? "أبعاد، جهد كهربائي، مورد مقترح..." : "Dimensions, voltage, vendor preference..."}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Status Workflow Notification */}
            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex items-start gap-2.5 text-[11px] text-slate-300">
              <Package className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <div>
                {isRTL ? (
                  <>
                    عند إرسال هذا الطلب، سيتم تحويل حالة التذكرة تلقائياً إلى <strong className="text-amber-400 font-mono">في انتظار القطع (WAITING_FOR_PART)</strong> وسيتم إدراج الطلب في سجل التذكرة وقائمة طلبات الصرف.
                  </>
                ) : (
                  <>
                    Submitting this requisition will automatically transition the ticket state to <strong className="text-amber-400 font-mono">WAITING_FOR_PART</strong> until the warehouse or procurement team processes it.
                  </>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsRequestPartOpen(false)}>
                {t('cancel')}
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={isSubmitting}
                icon={reqIsCustom ? PackagePlus : PackageCheck}
                className={reqIsCustom ? "bg-amber-600 hover:bg-amber-500 text-white" : ""}
              >
                {reqIsCustom
                  ? (isRTL ? "تقديم طلب توريد وشراء جديد" : "Submit New Procurement Request")
                  : (isRTL ? "تقديم طلب صرف من المخزن" : "Submit Warehouse Request")}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 7: Resolve Ticket */}
      {isResolveOpen && (
        <Modal
          isOpen={isResolveOpen}
          onClose={() => setIsResolveOpen(false)}
          title="Resolve Maintenance Ticket"
          size="md"
        >
          <form onSubmit={handleResolve} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Root Cause of Failure *</label>
              <input
                required
                type="text"
                value={resolveRootCause}
                onChange={e => setResolveRootCause(e.target.value)}
                placeholder="e.g. Burnt condenser coil start relay due to power fluctuation"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Resolution Summary & Test Outcomes *</label>
              <textarea
                required
                value={resolveSummary}
                onChange={e => setResolveSummary(e.target.value)}
                placeholder="Detail the complete repair steps, calibration tests, and confirm normal dispensing operation..."
                rows={3}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Total Labor Duration (Mins)</label>
                <input
                  type="number"
                  min="5"
                  max="600"
                  value={resolveDuration}
                  onChange={e => setResolveDuration(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Final Part Consumed</label>
                <select
                  value={resolvePartId}
                  onChange={e => setResolvePartId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">No Additional Part</option>
                  {spareParts.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.partNumber} - {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsResolveOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="success" size="sm" loading={isSubmitting}>
                Sign Off & Resolve Ticket
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 8: Verify Repair */}
      {isVerifyOpen && (
        <Modal
          isOpen={isVerifyOpen}
          onClose={() => setIsVerifyOpen(false)}
          title="Verify & Certify Repair (QA Sign-off)"
          size="md"
        >
          <form onSubmit={handleVerify} className="space-y-4">
            <p className="text-xs text-slate-300 leading-relaxed">
              Confirm that the machine's telemetry reports operational status, sensor telemetry is nominal, and quality requirements are met.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Verification Notes</label>
              <textarea
                value={verifyComment}
                onChange={e => setVerifyComment(e.target.value)}
                placeholder="Telemetry verified: Cooling temperature at 4°C, test vend passed successfully."
                rows={3}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsVerifyOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={isSubmitting}>
                Certify & Mark Verified
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 9: Close Ticket */}
      {isCloseOpen && (
        <Modal
          isOpen={isCloseOpen}
          onClose={() => setIsCloseOpen(false)}
          title="Close & Archive Ticket"
          size="md"
        >
          <form onSubmit={handleClose} className="space-y-4">
            <p className="text-xs text-slate-300 leading-relaxed">
              This will lock the ticket history and permanently record all labor hours, parts replacement costs, and MTTR metrics in the compliance database.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Closing Remarks</label>
              <textarea
                value={closeComment}
                onChange={e => setCloseComment(e.target.value)}
                placeholder="Final closure remarks..."
                rows={3}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsCloseOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={isSubmitting}>
                Confirm Final Closure
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

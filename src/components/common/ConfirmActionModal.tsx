import React, { useState, useEffect } from 'react';
import { AlertTriangle, AlertCircle, Trash2, Power, ShieldAlert, Check } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

export interface ReferenceCountItem {
  label: string;
  count: number;
}

export interface ConfirmActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
  title: string;
  subtitle?: string;
  description?: string;
  warningMessage?: string;
  entityName?: string;
  entityType?: string;
  actionType?: 'DELETE' | 'DEACTIVATE' | 'REACTIVATE' | 'ARCHIVE' | 'CANCEL' | 'PURGE';
  requiredConfirmationText?: string;
  referenceCounts?: ReferenceCountItem[];
  canHardDelete?: boolean;
  onAlternativeAction?: () => void;
  alternativeActionLabel?: string;
  requireReason?: boolean;
  isDeactivation?: boolean;
  isLoading?: boolean;
}

export const ConfirmActionModal: React.FC<ConfirmActionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  subtitle,
  description,
  warningMessage,
  entityName = 'Record',
  entityType = 'Item',
  actionType,
  requiredConfirmationText,
  referenceCounts = [],
  canHardDelete = true,
  onAlternativeAction,
  alternativeActionLabel = 'Deactivate Instead',
  requireReason = true,
  isDeactivation = false,
  isLoading = false
}) => {
  const [reason, setReason] = useState('');
  const [confirmationInput, setConfirmationInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const effectiveActionType: 'DELETE' | 'DEACTIVATE' | 'REACTIVATE' | 'ARCHIVE' | 'CANCEL' | 'PURGE' = 
    actionType || (isDeactivation ? 'DEACTIVATE' : 'DELETE');
  const effectiveEntityType = entityType || 'Item';
  const effectiveEntityName = entityName || title || 'Record';

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setConfirmationInput('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const hasReferences = referenceCounts && referenceCounts.some(r => r.count > 0);
  const isHardDeleteBlocked = effectiveActionType === 'DELETE' && !canHardDelete && hasReferences;

  const isConfirmationMatched = !requiredConfirmationText || confirmationInput.trim().toUpperCase() === requiredConfirmationText.trim().toUpperCase();
  const isReasonProvided = !requireReason || reason.trim().length >= 3;
  const isConfirmDisabled = isLoading || isSubmitting || isHardDeleteBlocked || !isConfirmationMatched || !isReasonProvided;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isConfirmDisabled) return;

    try {
      setIsSubmitting(true);
      await onConfirm(reason.trim());
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDestructive = effectiveActionType === 'DELETE' || effectiveActionType === 'PURGE' || effectiveActionType === 'CANCEL';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title || 'Confirm Action'}
      subtitle={subtitle || description || `Managing ${effectiveEntityType}: ${effectiveEntityName}`}
      maxWidth="md"
    >
      <form onSubmit={handleConfirm} className="space-y-4">
        {/* Banner Alert */}
        {isHardDeleteBlocked ? (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 space-y-2">
            <div className="flex items-center gap-2 font-bold text-xs">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Hard Deletion Prevented (Referential Integrity Constraint)</span>
            </div>
            <p className="text-[11px] text-amber-200/90 leading-relaxed">
              {warningMessage || `This ${effectiveEntityType.toLowerCase()} is currently linked to historical records in the system and cannot be permanently deleted.`}
            </p>
            <div className="mt-2 pt-2 border-t border-amber-500/20 flex flex-wrap gap-2 text-[10px]">
              {referenceCounts.map((ref, idx) => (
                <span key={idx} className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 font-mono">
                  {ref.label}: {ref.count}
                </span>
              ))}
            </div>
          </div>
        ) : isDestructive ? (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <span className="font-bold text-rose-200">Destructive Action Warning</span>
              <p className="text-rose-300/80 text-[11px]">
                {warningMessage || (
                  <>
                    You are about to execute a {effectiveActionType.toLowerCase()} action on <strong>{effectiveEntityName}</strong>. This operation will be permanently recorded in the system audit log.
                  </>
                )}
              </p>
            </div>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-300 flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <span className="font-bold text-blue-200">Status Transition</span>
              <p className="text-blue-300/80 text-[11px]">
                {warningMessage || (
                  effectiveActionType === 'DEACTIVATE'
                    ? `Deactivating this ${effectiveEntityType.toLowerCase()} will mark it inactive while preserving all historical references and telemetry.`
                    : effectiveActionType === 'ARCHIVE'
                    ? `Archiving will remove this ${effectiveEntityType.toLowerCase()} from active workflows while maintaining full audit compliance.`
                    : `Reactivating will restore this ${effectiveEntityType.toLowerCase()} to active operations.`
                )}
              </p>
            </div>
          </div>
        )}

        {/* Typing Confirmation Requirement */}
        {requiredConfirmationText && !isHardDeleteBlocked && (
          <div className="space-y-1.5 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <label className="text-xs font-semibold text-slate-300 block">
              Please type <strong className="text-rose-400 font-mono select-all">{requiredConfirmationText}</strong> to confirm:
            </label>
            <input
              type="text"
              required
              value={confirmationInput}
              onChange={e => setConfirmationInput(e.target.value)}
              placeholder={requiredConfirmationText}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-none focus:border-rose-500"
            />
          </div>
        )}

        {/* Reason for Modification / Deletion */}
        {requireReason && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 block">
              Reason for {effectiveActionType.toLowerCase()} <span className="text-rose-400">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={`Please provide detailed operational reasoning (min 3 characters)...`}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
            />
            {reason.trim().length > 0 && reason.trim().length < 3 && (
              <p className="text-[10px] text-rose-400">Reason must be at least 3 characters long.</p>
            )}
          </div>
        )}

        {/* Actions Footer */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <div>
            {isHardDeleteBlocked && onAlternativeAction && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={Power}
                onClick={() => {
                  onClose();
                  onAlternativeAction();
                }}
              >
                {alternativeActionLabel}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting || isLoading}
            >
              Cancel
            </Button>

            {!isHardDeleteBlocked && (
              <Button
                type="submit"
                variant={isDestructive ? 'danger' : 'primary'}
                size="sm"
                icon={isDestructive ? Trash2 : Check}
                disabled={isConfirmDisabled}
              >
                {isSubmitting || isLoading ? 'Processing...' : `Confirm ${effectiveActionType}`}
              </Button>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
};


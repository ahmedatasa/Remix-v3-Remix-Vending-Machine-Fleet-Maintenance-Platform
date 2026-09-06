import React, { useState } from 'react';
import {
  Clock,
  User,
  Wrench,
  Package,
  Image as ImageIcon,
  FileText,
  CheckCircle2,
  AlertCircle,
  Play,
  UserCheck,
  ShieldCheck,
  Archive,
  ExternalLink,
  DollarSign,
  Maximize2,
  X
} from 'lucide-react';
import { Ticket, TicketTimelineItem, TicketAttachment } from '../../types';
import { useLanguage } from '../../context/LanguageContext';

interface TicketTimelineProps {
  ticket: Ticket;
  onOpenPhotoUpload?: () => void;
  onOpenAddAction?: () => void;
  onOpenAddNote?: () => void;
}

export const TicketTimeline: React.FC<TicketTimelineProps> = ({
  ticket,
  onOpenPhotoUpload,
  onOpenAddAction,
  onOpenAddNote
}) => {
  const { t, formatDate, formatCurrency, isRTL } = useLanguage();
  const [filterType, setFilterType] = useState<string>('ALL');
  const [previewPhoto, setPreviewPhoto] = useState<TicketAttachment | null>(null);

  const items = ticket.timeline || [];

  const filteredItems = items.filter(item => {
    if (filterType === 'ALL') return true;
    if (filterType === 'ACTIONS' && (item.action.includes('ACTION') || item.action.includes('MAINTENANCE') || item.action === 'RESOLVED' || item.action === 'WORK_STARTED')) return true;
    if (filterType === 'PARTS' && (item.part || item.action.includes('PART'))) return true;
    if (filterType === 'PHOTOS' && (item.attachment || item.action.includes('PHOTO'))) return true;
    if (filterType === 'NOTES' && (item.action.includes('NOTE') || item.action === 'NOTE_ADDED')) return true;
    if (filterType === 'STATUS' && (item.action === 'STATUS_CHANGE' || item.action === 'TRIAGED' || item.action === 'ASSIGNED' || item.action === 'VERIFIED' || item.action === 'CLOSED')) return true;
    return true;
  });

  const getActionIcon = (action: string) => {
    if (action.includes('PHOTO')) return ImageIcon;
    if (action.includes('PART')) return Package;
    if (action.includes('NOTE')) return FileText;
    if (action === 'WORK_STARTED' || action === 'IN_PROGRESS') return Play;
    if (action === 'ASSIGNED' || action === 'ACCEPTED') return UserCheck;
    if (action === 'RESOLVED') return CheckCircle2;
    if (action === 'VERIFIED') return ShieldCheck;
    if (action === 'CLOSED') return Archive;
    if (action === 'TRIAGED') return AlertCircle;
    return Wrench;
  };

  const getActionBadgeColor = (action: string) => {
    if (action.includes('PHOTO')) return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
    if (action.includes('PART')) return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    if (action.includes('NOTE')) return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
    if (action === 'WORK_STARTED') return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    if (action === 'ASSIGNED' || action === 'ACCEPTED') return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30';
    if (action === 'RESOLVED') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    if (action === 'VERIFIED') return 'bg-teal-500/10 text-teal-400 border-teal-500/30';
    if (action === 'CLOSED') return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
    return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
  };

  return (
    <div className="space-y-4">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-400" />
            <span>{t('timeline')}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
              {filteredItems.length} records
            </span>
          </h3>
          <p className="text-[11px] text-slate-400">
            Chronological audit of all actions, parts requisitions, photo evidence, and technician logs
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs">
          {[
            { id: 'ALL', label: 'All Events' },
            { id: 'ACTIONS', label: 'Actions' },
            { id: 'PARTS', label: 'Parts' },
            { id: 'PHOTOS', label: 'Photos' },
            { id: 'NOTES', label: 'Notes' },
            { id: 'STATUS', label: 'Status' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilterType(f.id)}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer text-[11px] ${
                filterType === f.id
                  ? 'bg-blue-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline Stream */}
      {filteredItems.length === 0 ? (
        <div className="py-12 text-center bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
          <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-xs text-slate-400 font-medium">No timeline records matching current filter</p>
          <p className="text-[11px] text-slate-500 mt-1">Actions taken on this ticket will appear here with full audit history.</p>
        </div>
      ) : (
        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-800">
          {filteredItems.map((item, idx) => {
            const Icon = getActionIcon(item.action);
            const badgeClass = getActionBadgeColor(item.action);

            return (
              <div key={item.id || idx} className="relative group">
                {/* Node Dot */}
                <div className="absolute -left-6 top-1.5 w-5 h-5 rounded-full bg-slate-900 border-2 border-blue-500/80 flex items-center justify-center shadow-md">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 group-hover:scale-125 transition-transform" />
                </div>

                {/* Timeline Card */}
                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 shadow-sm hover:border-slate-700 transition-colors space-y-3">
                  {/* Top Bar: Timestamp + Technician + Action */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${badgeClass}`}>
                        {item.actionLabel || item.action.replace(/_/g, ' ')}
                      </span>

                      {item.technicianName && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-300">
                          <User className="w-3.5 h-3.5 text-slate-500" />
                          <span className="font-semibold text-slate-200">{item.technicianName}</span>
                          {item.technicianCode && (
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded">
                              {item.technicianCode}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>{formatDate(item.timestamp)}</span>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-200 leading-relaxed bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/60">
                    {item.description}
                  </p>

                  {/* Part Info if attached */}
                  {item.part && (
                    <div className="bg-amber-950/20 border border-amber-500/20 rounded-lg p-2.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold">
                          <Package className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-amber-200">{item.part.name}</div>
                          <span className="text-[10px] font-mono text-amber-400/80">SKU: {item.part.partNumber}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-mono font-bold text-amber-300">Qty: {item.part.quantity}</span>
                        {item.part.unitCost && (
                          <div className="text-[10px] text-slate-400">
                            ${(item.part.quantity * item.part.unitCost).toFixed(2)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Photo Attachment if attached */}
                  {item.attachment && (
                    <div className="bg-purple-950/20 border border-purple-500/20 rounded-lg p-2.5 space-y-2">
                      <div className="flex items-center justify-between text-xs text-purple-300">
                        <span className="font-semibold flex items-center gap-1.5">
                          <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
                          {item.attachment.caption || 'Site Photo Attachment'}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">{item.attachment.fileName}</span>
                      </div>

                      <div
                        onClick={() => setPreviewPhoto(item.attachment!)}
                        className="relative group/img cursor-pointer rounded-lg overflow-hidden border border-purple-500/30 max-w-sm h-36 bg-slate-900"
                      >
                        <img
                          src={item.attachment.fileUrl}
                          alt={item.attachment.caption || 'Site evidence'}
                          className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white gap-1.5 text-xs font-semibold">
                          <Maximize2 className="w-4 h-4" />
                          <span>View Full Photo</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox Photo Preview Modal */}
      {previewPhoto && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
          <div className="relative max-w-3xl w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div>
                <h4 className="text-sm font-bold text-slate-100">{previewPhoto.caption || previewPhoto.fileName}</h4>
                <p className="text-xs text-slate-400 font-mono">{previewPhoto.fileName}</p>
              </div>
              <button
                onClick={() => setPreviewPhoto(null)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-slate-950/60 max-h-[70vh] overflow-auto">
              <img
                src={previewPhoto.fileUrl}
                alt={previewPhoto.caption}
                className="max-h-[60vh] max-w-full rounded-lg object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

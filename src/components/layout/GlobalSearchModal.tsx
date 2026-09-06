import React, { useState, useEffect } from 'react';
import { Search, Cpu, Ticket as TicketIcon, Package, MapPin, ArrowRight } from 'lucide-react';
import { Modal } from '../common/Modal';
import { useLanguage } from '../../context/LanguageContext';
import { NavigationTab, Machine, Ticket, SparePart, Location } from '../../types';
import { api } from '../../services/api';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectResult: (tab: NavigationTab, id: string) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectResult
}) => {
  const { t, isRTL } = useLanguage();
  const [query, setQuery] = useState('');

  const [machines, setMachines] = useState<Machine[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [spareParts, setSpareParts] = useState<SparePart[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  const loadData = async () => {
    try {
      const [mData, tData, pData, lData] = await Promise.all([
        api.getMachines(),
        api.getTickets(),
        api.getSpareParts(),
        api.getLocations()
      ]);
      if (Array.isArray(mData)) setMachines(mData);
      if (Array.isArray(tData)) setTickets(tData);
      if (Array.isArray(pData)) setSpareParts(pData);
      if (Array.isArray(lData)) setLocations(lData);
    } catch {
      // Keep state
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  // Listen to ⌘K or Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const q = query.toLowerCase().trim();

  const matchingMachines = q
    ? machines.filter(
        m =>
          (m.machineNumber && m.machineNumber.toLowerCase().includes(q)) ||
          (m.publicId && m.publicId.toLowerCase().includes(q)) ||
          (m.publicQrId && m.publicQrId.toLowerCase().includes(q)) ||
          (m.serialNumber && m.serialNumber.toLowerCase().includes(q)) ||
          (m.currentLocation?.fullDescription && m.currentLocation.fullDescription.toLowerCase().includes(q)) ||
          (m.currentLocation?.building?.name && m.currentLocation.building.name.toLowerCase().includes(q))
      )
    : [];

  const matchingTickets = q
    ? tickets.filter(
        t =>
          (t.ticketNumber && t.ticketNumber.toLowerCase().includes(q)) ||
          (t.description && t.description.toLowerCase().includes(q)) ||
          (t.category && t.category.toLowerCase().includes(q)) ||
          (t.title && t.title.toLowerCase().includes(q)) ||
          (t.titleAr && t.titleAr.toLowerCase().includes(q))
      )
    : [];

  const matchingParts = q
    ? spareParts.filter(
        p =>
          (p.partNumber && p.partNumber.toLowerCase().includes(q)) ||
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.nameAr && p.nameAr.toLowerCase().includes(q))
      )
    : [];

  const matchingLocations = q
    ? locations.filter(
        l =>
          (l.areaZone && l.areaZone.toLowerCase().includes(q)) ||
          (l.areaZoneAr && l.areaZoneAr.toLowerCase().includes(q)) ||
          (l.fullDescription && l.fullDescription.toLowerCase().includes(q)) ||
          (l.building?.name && l.building.name.toLowerCase().includes(q))
      )
    : [];

  const hasResults =
    matchingMachines.length > 0 ||
    matchingTickets.length > 0 ||
    matchingParts.length > 0 ||
    matchingLocations.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Global Fleet Search"
      subtitle="Instantly jump to machines, tickets, spare parts or campuses"
      maxWidth="xl"
    >
      <div className="space-y-4">
        <div className="relative">
          <Search className={`absolute top-3 ${isRTL ? 'right-3.5' : 'left-3.5'} w-4 h-4 text-blue-400`} />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type machine ID (e.g. VM-B01), ticket # (e.g. TCK-2026), SKU (e.g. SP-VAL), or location..."
            className={`w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 ${
              isRTL ? 'pr-10 pl-4' : 'pl-10 pr-4'
            } text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20`}
          />
        </div>

        <div className="max-h-96 overflow-y-auto space-y-4 divide-y divide-slate-800">
          {!q && (
            <div className="py-8 text-center text-xs text-slate-500">
              Start typing to search the entire enterprise database...
            </div>
          )}

          {q && !hasResults && (
            <div className="py-8 text-center text-xs text-slate-400">
              No matching records found for "{query}"
            </div>
          )}

          {/* Machines */}
          {matchingMachines.length > 0 && (
            <div className="pt-3">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                Machines ({matchingMachines.length})
              </span>
              <div className="space-y-1.5">
                {matchingMachines.map(m => (
                  <button
                    key={m.id}
                    onClick={() => {
                      onSelectResult('machine-detail', m.id);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 text-left rtl:text-right transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded bg-blue-500/10 text-blue-400">
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-100">{m.machineNumber}</div>
                        <div className="text-[11px] text-slate-400">{m.currentLocation?.fullDescription}</div>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-blue-400">{m.publicId}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tickets */}
          {matchingTickets.length > 0 && (
            <div className="pt-3">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                Tickets ({matchingTickets.length})
              </span>
              <div className="space-y-1.5">
                {matchingTickets.map(t => (
                  <button
                    key={t.id}
                    onClick={() => {
                      onSelectResult('ticket-detail', t.id);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 text-left rtl:text-right transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded bg-amber-500/10 text-amber-400">
                        <TicketIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-100">{t.ticketNumber} ({t.priority})</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-sm">{t.description}</div>
                      </div>
                    </div>
                    <span className="text-[11px] text-slate-400">{t.status}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Spare Parts */}
          {matchingParts.length > 0 && (
            <div className="pt-3">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                Spare Parts ({matchingParts.length})
              </span>
              <div className="space-y-1.5">
                {matchingParts.map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onSelectResult('spare-parts', p.id);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 text-left rtl:text-right transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded bg-purple-500/10 text-purple-400">
                        <Package className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-100">{p.partNumber} - {p.name}</div>
                        <div className="text-[11px] text-slate-400">Qty: {p.currentQuantity} • {p.storageLocation}</div>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-emerald-400">${p.unitCost}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

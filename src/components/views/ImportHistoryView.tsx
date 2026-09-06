import React, { useState, useEffect } from 'react';
import {
  History,
  FileSpreadsheet,
  Calendar,
  User,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Eye,
  Download,
  Search,
  Filter,
  ArrowLeft,
  Layers,
  Database,
  ExternalLink,
  ShieldCheck,
  X
} from 'lucide-react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { StatusBadge } from '../common/StatusBadge';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { useLanguage } from '../../context/LanguageContext';
import { useNotification } from '../../context/NotificationContext';
import { api } from '../../services/api';
import { excelService } from '../../services/excelService';
import { ImportBatch, ImportRowEntity, NavigationTab } from '../../types';

interface ImportHistoryViewProps {
  onNavigate: (tab: NavigationTab, id?: string) => void;
}

export const ImportHistoryView: React.FC<ImportHistoryViewProps> = ({ onNavigate }) => {
  const { t, formatNumber, formatDate, isRTL } = useLanguage();
  const { showToast } = useNotification();

  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Selected batch for drilldown inspection
  const [selectedBatch, setSelectedBatch] = useState<ImportBatch | null>(null);
  const [batchRows, setBatchRows] = useState<ImportRowEntity[]>([]);
  const [isLoadingRows, setIsLoadingRows] = useState(false);
  const [rowSearchQuery, setRowSearchQuery] = useState('');
  const [rowStatusFilter, setRowStatusFilter] = useState<'ALL' | 'VALID' | 'REVIEW_REQUIRED' | 'INVALID'>('ALL');

  useEffect(() => {
    loadBatches();
  }, []);

  const loadBatches = async () => {
    setIsLoading(true);
    try {
      const data = await api.getImportBatches();
      setBatches(data);
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to load import batches', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInspectBatch = async (batch: ImportBatch) => {
    setSelectedBatch(batch);
    setIsLoadingRows(true);
    try {
      const rows = await api.getImportBatchRows(batch.id);
      setBatchRows(rows);
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to load batch rows', 'error');
    } finally {
      setIsLoadingRows(false);
    }
  };

  const filteredBatches = batches.filter(b => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      b.fileName.toLowerCase().includes(q) ||
      b.id.toLowerCase().includes(q) ||
      (b.importedBy && b.importedBy.toLowerCase().includes(q))
    );
  });

  const filteredRows = batchRows.filter(r => {
    if (rowStatusFilter !== 'ALL' && r.dataQualityStatus !== rowStatusFilter) {
      return false;
    }
    if (!rowSearchQuery) return true;
    const q = rowSearchQuery.toLowerCase();
    return (
      r.originalMachineNumber.toLowerCase().includes(q) ||
      (r.originalSerialNumber && r.originalSerialNumber.toLowerCase().includes(q)) ||
      r.originalBuilding.toLowerCase().includes(q) ||
      r.originalLocation.toLowerCase().includes(q) ||
      (r.normalizedMachineId && r.normalizedMachineId.toLowerCase().includes(q)) ||
      r.sourceSheet.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            <History className="w-4 h-4" />
            <span>Audit & Compliance Archive</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            Excel Import History & Batch Audit
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Immutable log of all spreadsheet ingestion jobs, coordinate maps, and data quality status.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            size="sm"
            onClick={() => onNavigate('import-export')}
            className="flex items-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>New Excel Ingestion</span>
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <div className="text-xs text-slate-500">Total Import Batches</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {batches.length} Jobs
          </div>
          <div className="text-xs text-slate-400 mt-1">Recorded audit trails</div>
        </Card>

        <Card className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <div className="text-xs text-slate-500">Total Imported Fleet Machines</div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
            {batches.reduce((acc, b) => acc + (b.totalRecordsCreated || 0), 0)}
          </div>
          <div className="text-xs text-slate-400 mt-1">Directly synchronized</div>
        </Card>

        <Card className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <div className="text-xs text-slate-500">Quality Review Flags</div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            {batches.reduce((acc, b) => acc + (b.reviewRequiredCount || 0), 0)}
          </div>
          <div className="text-xs text-slate-400 mt-1">Flagged for serial review</div>
        </Card>
      </div>

      {/* Search & Filter Toolbar */}
      <Card className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by file name, Batch ID, user..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
          />
        </div>
      </Card>

      {/* Batches Table */}
      <Card className="p-0 overflow-hidden bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        {isLoading ? (
          <div className="p-12 text-center">
            <LoadingSpinner size="lg" />
          </div>
        ) : filteredBatches.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            No import history batches found matching your search.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-4 py-3">Batch ID</th>
                  <th className="px-4 py-3">File Name</th>
                  <th className="px-4 py-3">Execution Date</th>
                  <th className="px-4 py-3">Imported By</th>
                  <th className="px-4 py-3 text-center">Total Rows</th>
                  <th className="px-4 py-3 text-center">Valid</th>
                  <th className="px-4 py-3 text-center">Review Req.</th>
                  <th className="px-4 py-3 text-center">Invalid</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {filteredBatches.map(batch => (
                  <tr
                    key={batch.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-750/50 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                      {batch.id}
                    </td>

                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="truncate max-w-xs">{batch.fileName}</span>
                    </td>

                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {formatDate(batch.createdAt)}
                    </td>

                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      {batch.importedBy || 'System Administrator'}
                    </td>

                    <td className="px-4 py-3 text-center font-semibold text-slate-900 dark:text-white">
                      {batch.totalRecordsCreated}
                    </td>

                    <td className="px-4 py-3 text-center font-semibold text-emerald-600">
                      {batch.validCount ?? (batch.totalRecordsCreated - batch.reviewRequiredCount)}
                    </td>

                    <td className="px-4 py-3 text-center font-semibold text-amber-600">
                      {batch.reviewRequiredCount}
                    </td>

                    <td className="px-4 py-3 text-center font-semibold text-red-600">
                      {batch.invalidRecordsCount}
                    </td>

                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleInspectBatch(batch)}
                        className="text-xs flex items-center gap-1 ml-auto"
                      >
                        <Eye className="w-3.5 h-3.5 text-blue-600" />
                        <span>Inspect Rows</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* BATCH DRILLDOWN DRAWER / MODAL */}
      {selectedBatch && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-700">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400">
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Batch Ingestion Audit: {selectedBatch.id}</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                  {selectedBatch.fileName}
                </h3>
                <div className="text-xs text-slate-400 mt-0.5">
                  Imported on {formatDate(selectedBatch.createdAt)} by {selectedBatch.importedBy}
                </div>
              </div>
              <button
                onClick={() => setSelectedBatch(null)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Filter Bar */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter row data..."
                  value={rowSearchQuery}
                  onChange={e => setRowSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="flex items-center gap-2">
                {(['ALL', 'VALID', 'REVIEW_REQUIRED', 'INVALID'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setRowStatusFilter(tab)}
                    className={`px-2.5 py-1 rounded text-xs font-medium ${
                      rowStatusFilter === tab
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {tab === 'ALL' ? 'All Rows' : tab.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Body: Row Coordinates & Issues */}
            <div className="p-4 overflow-y-auto flex-1">
              {isLoadingRows ? (
                <div className="p-12 text-center">
                  <LoadingSpinner size="md" />
                </div>
              ) : filteredRows.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-xs">
                  No row entities found for this batch.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="px-3 py-2">Quality</th>
                        <th className="px-3 py-2">Source Coordinate</th>
                        <th className="px-3 py-2">Original Machine ID</th>
                        <th className="px-3 py-2">Original Serial</th>
                        <th className="px-3 py-2">Original Building & Location</th>
                        <th className="px-3 py-2">Detected Issues</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700 font-mono">
                      {filteredRows.map(row => (
                        <tr
                          key={row.id}
                          className="hover:bg-slate-50/60 dark:hover:bg-slate-750/30"
                        >
                          <td className="px-3 py-2 whitespace-nowrap font-sans">
                            <StatusBadge status={row.dataQualityStatus} type="dataQuality" />
                          </td>

                          <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                            {row.sourceSheet}:{row.sourceColumn}{row.sourceRow}
                          </td>

                          <td className="px-3 py-2 font-bold text-slate-900 dark:text-white">
                            {row.originalMachineNumber}
                          </td>

                          <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                            {row.originalSerialNumber || <span className="text-amber-500 font-sans italic">(Missing)</span>}
                          </td>

                          <td className="px-3 py-2 font-sans text-slate-700 dark:text-slate-300">
                            <div>{row.originalBuilding}</div>
                            <div className="text-[10px] text-slate-400">{row.originalLocation}</div>
                          </td>

                          <td className="px-3 py-2 font-sans">
                            {row.detectedIssues && row.detectedIssues.length > 0 ? (
                              <div className="space-y-0.5">
                                {row.detectedIssues.map((iss, iIdx) => (
                                  <div
                                    key={iIdx}
                                    className="text-[10px] text-amber-700 dark:text-amber-400 font-medium"
                                  >
                                    • {iss.message || iss.code}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-emerald-600 text-[10px]">Clean</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="text-xs text-slate-500">
                Preserved Source Integrity: 100% Audit Coordinated
              </div>
              <Button variant="outline" size="sm" onClick={() => setSelectedBatch(null)}>
                Close Inspector
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

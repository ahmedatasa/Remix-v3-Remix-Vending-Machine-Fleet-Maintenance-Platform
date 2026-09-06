import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Search, ArrowUpDown } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render?: (row: T, index: number) => React.ReactNode;
  sortable?: boolean;
  className?: string;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  searchPlaceholder?: string;
  searchKeys?: (keyof T | string)[];
  filterComponent?: React.ReactNode;
  actionsComponent?: React.ReactNode;
  pageSize?: number;
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
  emptyTitle?: string;
  emptySubtitle?: string;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  searchPlaceholder,
  searchKeys = [],
  filterComponent,
  actionsComponent,
  pageSize = 10,
  onRowClick,
  isLoading = false,
  emptyTitle,
  emptySubtitle
}: DataTableProps<T>) {
  const { t, isRTL } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Filter and search
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return data;
    const query = searchQuery.toLowerCase().trim();

    return data.filter(item => {
      if (searchKeys.length > 0) {
        return searchKeys.some(key => {
          const val = item[key as string];
          if (val === undefined || val === null) return false;
          return String(val).toLowerCase().includes(query);
        });
      }
      return Object.values(item).some(val => {
        if (typeof val === 'object' && val !== null) {
          return Object.values(val).some(nested => String(nested).toLowerCase().includes(query));
        }
        return String(val).toLowerCase().includes(query);
      });
    });
  }, [data, searchQuery, searchKeys]);

  // Sort
  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal === bVal) return 0;
      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;

      const comp = aVal > bVal ? 1 : -1;
      return sortDirection === 'asc' ? comp : -comp;
    });
  }, [filteredData, sortKey, sortDirection]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortKey(null);
      }
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
      {/* Header Search & Toolbar */}
      <div className="p-4 border-b border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-950/40">
        <div className="relative w-full sm:w-80">
          <Search className={`absolute top-2.5 ${isRTL ? 'right-3' : 'left-3'} w-4 h-4 text-slate-400`} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder={searchPlaceholder || t('search')}
            className={`w-full bg-slate-900 border border-slate-700/80 rounded-lg py-2 ${
              isRTL ? 'pr-9 pl-3' : 'pl-9 pr-3'
            } text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500`}
          />
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          {filterComponent}
          {actionsComponent}
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto min-h-[300px]">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-950/70 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`px-4 py-3 ${col.sortable ? 'cursor-pointer hover:text-slate-200 select-none' : ''} ${col.className || ''}`}
                  style={{ width: col.width }}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{col.header}</span>
                    {col.sortable && (
                      <ArrowUpDown className="w-3 h-3 text-slate-500 hover:text-slate-300" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-16 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <span>{t('loading')}</span>
                  </div>
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-16 text-center">
                  <div className="max-w-sm mx-auto flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-400 mb-3">
                      <Search className="w-5 h-5" />
                    </div>
                    <h4 className="text-sm font-semibold text-slate-200">
                      {emptyTitle || t('noData')}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1">
                      {emptySubtitle || t('noDataSubtitle')}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedData.map((row, idx) => (
                <tr
                  key={row.id || idx}
                  onClick={() => onRowClick && onRowClick(row)}
                  className={`transition-colors duration-150 ${
                    onRowClick ? 'cursor-pointer hover:bg-slate-800/50' : 'hover:bg-slate-800/30'
                  }`}
                >
                  {columns.map(col => (
                    <td key={col.key} className={`px-4 py-3.5 ${col.className || ''}`}>
                      {col.render ? col.render(row, idx) : row[col.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="px-4 py-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 bg-slate-950/40">
        <div>
          <span>
            {t('page')} <strong className="text-slate-200">{currentPage}</strong> {t('of')}{' '}
            <strong className="text-slate-200">{totalPages}</strong> ({sortedData.length} total records)
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1 || isLoading}
            className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isRTL ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages || isLoading}
            className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isRTL ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

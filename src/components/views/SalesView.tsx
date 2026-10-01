import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CreditCard,
  Package,
  RefreshCw
} from 'lucide-react';

import { Button } from '../common/Button';
import {
  Column,
  DataTable
} from '../common/DataTable';

import { useLanguage } from '../../context/LanguageContext';
import { useNotification } from '../../context/NotificationContext';

import {
  CommercialProduct,
  Machine,
  ManualSalesLedgerRow,
  ManualSalesQuery,
  ManualSalesSummary,
  NavigationTab
} from '../../types';

import { api } from '../../services/api';

interface SalesViewProps {
  onNavigate: (
    tab: NavigationTab,
    id?: string
  ) => void;
}

const emptySummary: ManualSalesSummary = {
  source: 'MANUAL_STOCK',
  posDataStatus: 'NOT_AVAILABLE',
  totalPeriods: 0,
  totalEstimatedUnitsSold: 0,
  totalEstimatedRevenue: 0,
  varianceReviewCount: 0,
  priceReviewRequiredCount: 0,
  machineCount: 0,
  productCount: 0
};

const inputClass =
  'w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500';

function MetricCard({
  title,
  value,
  subtitle,
  icon
}: {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {title}
          </p>

          <div className="text-2xl font-bold text-slate-100 mt-2">
            {value}
          </div>

          {subtitle && (
            <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>

        <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-blue-400 shrink-0">
          {icon}
        </div>
      </div>
    </div>
  );
}

export const SalesView: React.FC<SalesViewProps> = () => {
  const {
    isRTL,
    formatNumber,
    formatDate
  } = useLanguage();

  const { showToast } = useNotification();

  const [summary, setSummary] =
    useState<ManualSalesSummary>(emptySummary);

  const [ledger, setLedger] =
    useState<ManualSalesLedgerRow[]>([]);

  const [machines, setMachines] =
    useState<Machine[]>([]);

  const [products, setProducts] =
    useState<CommercialProduct[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [filters, setFilters] =
    useState<ManualSalesQuery>({
      machineId: '',
      productId: '',
      from: '',
      to: ''
    });

  const [appliedFilters, setAppliedFilters] =
    useState<ManualSalesQuery>({});

  const loadReferenceData = async () => {
    const [machineRows, productRows] =
      await Promise.all([
        api.getMachines(),
        api.getProducts(false)
      ]);

    setMachines(
      machineRows.filter(
        (machine: Machine) =>
          machine.isDeleted !== true
      )
    );

    setProducts(productRows);
  };

  const loadSales = async (
    query: ManualSalesQuery = appliedFilters
  ) => {
    setLoading(true);

    try {
      const [summaryData, ledgerRows] =
        await Promise.all([
          api.getManualSalesSummary(query),
          api.getManualSalesLedger(query)
        ]);

      setSummary(summaryData);
      setLedger(ledgerRows);
    } catch (error: any) {
      showToast(
        isRTL ? 'خطأ' : 'Error',
        error?.message ||
          (
            isRTL
              ? 'تعذر تحميل بيانات المبيعات'
              : 'Failed to load sales data'
          ),
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([
      loadReferenceData(),
      loadSales({})
    ]).catch((error: any) => {
      showToast(
        isRTL ? 'خطأ' : 'Error',
        error?.message ||
          'Failed to initialize sales view',
        'error'
      );

      setLoading(false);
    });
  }, []);

  const applyFilters = async (
    event: React.FormEvent
  ) => {
    event.preventDefault();

    const clean: ManualSalesQuery = {
      machineId:
        filters.machineId || undefined,

      productId:
        filters.productId || undefined,

      from:
        filters.from || undefined,

      to:
        filters.to || undefined
    };

    setAppliedFilters(clean);
    await loadSales(clean);
  };

  const clearFilters = async () => {
    const empty: ManualSalesQuery = {
      machineId: '',
      productId: '',
      from: '',
      to: ''
    };

    setFilters(empty);
    setAppliedFilters({});
    await loadSales({});
  };

  const reviewCount =
    Number(summary.varianceReviewCount || 0) +
    Number(
      summary.priceReviewRequiredCount || 0
    );

  const statusBadge = (
    row: ManualSalesLedgerRow
  ) => {
    if (
      row.qualityStatus ===
      'VARIANCE_REVIEW'
    ) {
      return (
        <span className="inline-flex px-2 py-1 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          {isRTL
            ? 'مراجعة فرق الجرد'
            : 'VARIANCE REVIEW'}
        </span>
      );
    }

    if (
      row.qualityStatus ===
      'PRICE_REVIEW_REQUIRED'
    ) {
      return (
        <span className="inline-flex px-2 py-1 rounded-md text-[10px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20">
          {isRTL
            ? 'السعر يحتاج مراجعة'
            : 'PRICE REVIEW'}
        </span>
      );
    }

    return (
      <span className="inline-flex px-2 py-1 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        {isRTL
          ? 'تقديري'
          : 'ESTIMATED'}
      </span>
    );
  };

  const columns:
    Column<ManualSalesLedgerRow>[] = [
      {
        key: 'periodEndAt',
        header:
          isRTL
            ? 'الفترة'
            : 'Period',
        sortable: true,
        render: row => (
          <div>
            <div className="text-xs text-slate-200">
              {formatDate(row.periodEndAt)}
            </div>

            <div className="text-[10px] text-slate-500 mt-0.5">
              {isRTL ? 'من ' : 'From '}
              {formatDate(row.periodStartAt)}
            </div>
          </div>
        )
      },

      {
        key: 'machineId',
        header:
          isRTL
            ? 'الماكينة'
            : 'Machine',
        render: row => (
          <div>
            <div className="text-xs font-semibold text-slate-100">
              {row.machine?.machineNumber ||
                row.machineId}
            </div>

            <div className="text-[10px] text-slate-500">
              {row.machine?.machineType || '—'}
            </div>
          </div>
        )
      },

      {
        key: 'productId',
        header:
          isRTL
            ? 'المنتج'
            : 'Product',
        render: row => (
          <div>
            <div className="text-xs font-semibold text-slate-100">
              {isRTL
                ? (
                    row.product?.nameAr ||
                    row.product?.name ||
                    row.productId
                  )
                : (
                    row.product?.name ||
                    row.product?.nameAr ||
                    row.productId
                  )}
            </div>

            <div className="text-[10px] font-mono text-slate-500">
              {row.product?.sku || '—'}
            </div>
          </div>
        )
      },

      {
        key: 'openingQuantity',
        header:
          isRTL
            ? 'افتتاحي'
            : 'Opening',
        render: row => (
          <span className="font-mono text-xs">
            {formatNumber(
              row.openingQuantity
            )}
          </span>
        )
      },

      {
        key: 'refilledQuantity',
        header:
          isRTL
            ? 'تعبئة'
            : 'Refill',
        render: row => (
          <span className="font-mono text-xs text-blue-400">
            +{formatNumber(
              row.refilledQuantity
            )}
          </span>
        )
      },

      {
        key: 'returnedQuantity',
        header:
          isRTL
            ? 'مرتجع'
            : 'Return',
        render: row => (
          <span className="font-mono text-xs text-violet-400">
            {formatNumber(
              row.returnedQuantity
            )}
          </span>
        )
      },

      {
        key: 'wasteQuantity',
        header:
          isRTL
            ? 'تالف'
            : 'Waste',
        render: row => (
          <span className="font-mono text-xs text-rose-400">
            {formatNumber(
              row.wasteQuantity
            )}
          </span>
        )
      },

      {
        key: 'closingQuantity',
        header:
          isRTL
            ? 'ختامي'
            : 'Closing',
        render: row => (
          <span className="font-mono text-xs">
            {formatNumber(
              row.closingQuantity
            )}
          </span>
        )
      },

      {
        key: 'estimatedUnitsSold',
        header:
          isRTL
            ? 'المباع تقديريًا'
            : 'Est. Sold',
        sortable: true,
        render: row => (
          <div>
            <span className="font-mono text-sm font-bold text-emerald-400">
              {formatNumber(
                row.estimatedUnitsSold
              )}
            </span>

            {row.rawEstimatedUnitsSold < 0 && (
              <div className="text-[10px] text-amber-400 mt-0.5">
                Raw:
                {' '}
                {formatNumber(
                  row.rawEstimatedUnitsSold
                )}
              </div>
            )}
          </div>
        )
      },

      {
        key: 'sellingPriceSnapshot',
        header:
          isRTL
            ? 'سعر البيع'
            : 'Sell Price',
        render: row => (
          row.sellingPriceSnapshot === null
            ? (
                <span className="text-xs text-amber-400">
                  {isRTL
                    ? 'غير موثق'
                    : 'Not snapshotted'}
                </span>
              )
            : (
                <span className="font-mono text-xs">
                  {formatNumber(
                    row.sellingPriceSnapshot
                  )}
                </span>
              )
        )
      },

      {
        key: 'estimatedRevenue',
        header:
          isRTL
            ? 'القيمة التقديرية'
            : 'Est. Revenue',
        sortable: true,
        render: row => (
          row.estimatedRevenue === null
            ? (
                <span className="text-xs text-slate-500">
                  —
                </span>
              )
            : (
                <span className="font-mono text-sm font-bold text-cyan-400">
                  {formatNumber(
                    row.estimatedRevenue
                  )}
                </span>
              )
        )
      },

      {
        key: 'qualityStatus',
        header:
          isRTL
            ? 'الحالة'
            : 'Quality',
        render: row =>
          statusBadge(row)
      }
    ];

  const machineLabelMap =
    useMemo(
      () =>
        new Map(
          machines.map(machine => [
            machine.id,
            machine.machineNumber
          ])
        ),
      [machines]
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-400" />

            <h2 className="text-xl font-bold text-slate-100">
              {isRTL
                ? 'المبيعات والإيرادات التقديرية'
                : 'Sales & Estimated Revenue'}
            </h2>
          </div>

          <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
            {isRTL
              ? 'المبيعات محسوبة من فروق الجرد الفعلي وحركات التعبئة والمرتجع والتالف. لا يلزم توفر بيانات POS لتشغيل هذه الشاشة.'
              : 'Sales are derived from physical stock counts, refills, returns and waste. POS data is not required for this workflow.'}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            loadSales(appliedFilters)
          }
        >
          <RefreshCw className="w-3.5 h-3.5" />

          {isRTL
            ? 'تحديث'
            : 'Refresh'}
        </Button>
      </div>

      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <CreditCard className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />

            <div>
              <div className="text-sm font-semibold text-slate-100">
                {isRTL
                  ? 'حالة بيانات نقاط البيع POS'
                  : 'POS Data Status'}
              </div>

              <p className="text-xs text-slate-400 mt-1">
                {isRTL
                  ? 'عدم وجود بيانات POS لا يمنع احتساب المبيعات من الجرد اليدوي.'
                  : 'Missing POS data does not block inventory-derived sales estimation.'}
              </p>
            </div>
          </div>

          <span className="inline-flex self-start sm:self-auto px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 bg-slate-900 text-slate-300">
            {summary.posDataStatus ===
            'NOT_AVAILABLE'
              ? (
                  isRTL
                    ? 'غير متوفر — الوضع اليدوي فعال'
                    : 'NOT AVAILABLE — MANUAL MODE ACTIVE'
                )
              : summary.posDataStatus}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          title={
            isRTL
              ? 'الوحدات المباعة تقديريًا'
              : 'Estimated Units Sold'
          }
          value={formatNumber(
            summary.totalEstimatedUnitsSold
          )}
          subtitle={
            isRTL
              ? 'محسوبة من فترات الجرد المكتملة'
              : 'Derived from completed count periods'
          }
          icon={
            <Package className="w-5 h-5" />
          }
        />

        <MetricCard
          title={
            isRTL
              ? 'القيمة التقديرية المسعّرة'
              : 'Priced Estimated Revenue'
          }
          value={formatNumber(
            summary.totalEstimatedRevenue
          )}
          subtitle={
            summary.priceReviewRequiredCount > 0
              ? (
                  isRTL
                    ? `${formatNumber(summary.priceReviewRequiredCount)} فترة مستبعدة لعدم وجود سعر تاريخي موثق`
                    : `${formatNumber(summary.priceReviewRequiredCount)} period(s) excluded because historical price was not snapshotted`
                )
              : (
                  isRTL
                    ? 'كل الفترات تحتوي سعر بيع موثق'
                    : 'All periods have a captured selling price'
                )
          }
          icon={
            <BarChart3 className="w-5 h-5" />
          }
        />

        <MetricCard
          title={
            isRTL
              ? 'فترات المبيعات'
              : 'Sales Periods'
          }
          value={formatNumber(
            summary.totalPeriods
          )}
          subtitle={
            isRTL
              ? `${formatNumber(summary.machineCount)} ماكينة — ${formatNumber(summary.productCount)} منتج`
              : `${formatNumber(summary.machineCount)} machine(s) — ${formatNumber(summary.productCount)} product(s)`
          }
          icon={
            <BarChart3 className="w-5 h-5" />
          }
        />

        <MetricCard
          title={
            isRTL
              ? 'تحتاج مراجعة'
              : 'Needs Review'
          }
          value={formatNumber(
            reviewCount
          )}
          subtitle={
            isRTL
              ? `فرق جرد: ${formatNumber(summary.varianceReviewCount)} — سعر: ${formatNumber(summary.priceReviewRequiredCount)}`
              : `Variance: ${formatNumber(summary.varianceReviewCount)} — Price: ${formatNumber(summary.priceReviewRequiredCount)}`
          }
          icon={
            <AlertTriangle className="w-5 h-5" />
          }
        />
      </div>

      <form
        onSubmit={applyFilters}
        className="bg-slate-900 border border-slate-800 rounded-xl p-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div>
            <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">
              {isRTL
                ? 'الماكينة'
                : 'Machine'}
            </label>

            <select
              value={filters.machineId || ''}
              onChange={event =>
                setFilters(current => ({
                  ...current,
                  machineId:
                    event.target.value
                }))
              }
              className={inputClass}
            >
              <option value="">
                {isRTL
                  ? 'كل الماكينات'
                  : 'All machines'}
              </option>

              {machines.map(machine => (
                <option
                  key={machine.id}
                  value={machine.id}
                >
                  {machine.machineNumber}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">
              {isRTL
                ? 'المنتج'
                : 'Product'}
            </label>

            <select
              value={filters.productId || ''}
              onChange={event =>
                setFilters(current => ({
                  ...current,
                  productId:
                    event.target.value
                }))
              }
              className={inputClass}
            >
              <option value="">
                {isRTL
                  ? 'كل المنتجات'
                  : 'All products'}
              </option>

              {products.map(product => (
                <option
                  key={product.id}
                  value={product.id}
                >
                  {isRTL
                    ? (
                        product.nameAr ||
                        product.name
                      )
                    : (
                        product.name ||
                        product.nameAr
                      )}
                  {' — '}
                  {product.sku}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">
              {isRTL
                ? 'من تاريخ'
                : 'From'}
            </label>

            <input
              type="date"
              value={filters.from || ''}
              onChange={event =>
                setFilters(current => ({
                  ...current,
                  from:
                    event.target.value
                }))
              }
              className={inputClass}
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">
              {isRTL
                ? 'إلى تاريخ'
                : 'To'}
            </label>

            <input
              type="date"
              value={filters.to || ''}
              onChange={event =>
                setFilters(current => ({
                  ...current,
                  to:
                    event.target.value
                }))
              }
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 mt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearFilters}
          >
            {isRTL
              ? 'مسح الفلاتر'
              : 'Clear Filters'}
          </Button>

          <Button
            type="submit"
            variant="primary"
            size="sm"
          >
            {isRTL
              ? 'تطبيق'
              : 'Apply'}
          </Button>
        </div>
      </form>

      {reviewCount > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />

          <div>
            <h3 className="text-sm font-semibold text-amber-300">
              {isRTL
                ? 'توجد فترات تحتاج مراجعة'
                : 'Some periods require review'}
            </h3>

            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              {isRTL
                ? 'فرق الجرد السالب لا يُسجل كمبيعات سالبة، والفترات التاريخية التي لا تحتوي سعر بيع محفوظ لا تدخل قيمتها المالية في إجمالي الإيراد.'
                : 'Negative stock variance is never treated as negative sales, and legacy periods without a captured selling price are excluded from the monetary revenue total.'}
            </p>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-100">
              {isRTL
                ? 'سجل المبيعات المشتق من الجرد'
                : 'Inventory-Derived Sales Ledger'}
            </h3>

            <p className="text-[11px] text-slate-500 mt-1">
              {isRTL
                ? 'المصدر: MANUAL_STOCK — لا توجد معاملات POS مطلوبة.'
                : 'Source: MANUAL_STOCK — POS transactions are not required.'}
            </p>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={ledger}
          pageSize={20}
          isLoading={loading}
          searchPlaceholder={
            isRTL
              ? 'بحث في سجل المبيعات...'
              : 'Search sales ledger...'
          }
          emptyTitle={
            isRTL
              ? 'لا توجد فترات مبيعات محسوبة بعد'
              : 'No calculated sales periods yet'
          }
          emptySubtitle={
            isRTL
              ? 'أول جرد فعلي ينشئ خط الأساس، والجرد في زيارة لاحقة ينشئ أول فترة مبيعات.'
              : 'The first physical count creates the baseline; a count on a later visit creates the first sales period.'
          }
        />
      </div>

      <div className="text-[10px] text-slate-500 leading-relaxed">
        {isRTL
          ? `ملاحظة: الأرقام هنا تقديرية مبنية على الجرد وليست تحصيلًا بنكيًا مؤكدًا. ${machineLabelMap.size} ماكينة متاحة للفلاتر.`
          : `Note: values shown here are inventory-derived estimates, not confirmed bank settlement. ${machineLabelMap.size} machines are available for filtering.`}
      </div>
    </div>
  );
};

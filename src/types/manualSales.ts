import type { CommercialProduct, Machine } from './database';

export type ManualSalesSource = 'MANUAL_STOCK';

export type ManualSalesQualityStatus =
  | 'ESTIMATED'
  | 'VARIANCE_REVIEW'
  | 'PRICE_REVIEW_REQUIRED';

export type ManualSalesPriceSource =
  | 'COUNT_SNAPSHOT'
  | 'PRICE_NOT_SNAPSHOTTED';

export interface ManualSalesLedgerRow {
  id: string;
  source: ManualSalesSource;
  qualityStatus: ManualSalesQualityStatus;

  machineId: string;
  productId: string;

  periodStartAt: string;
  periodEndAt: string;

  openingQuantity: number;
  refilledQuantity: number;
  returnedQuantity: number;
  wasteQuantity: number;
  closingQuantity: number;

  rawEstimatedUnitsSold: number;
  estimatedUnitsSold: number;

  sellingPriceSnapshot: number | null;
  estimatedRevenue: number | null;
  priceSource: ManualSalesPriceSource;

  baselineCountMovementId: string;
  closingCountMovementId: string;

  baselineVisitId?: string;
  closingVisitId?: string;

  machine?: Machine;
  product?: CommercialProduct;
}

export interface ManualSalesSummary {
  source: ManualSalesSource;
  posDataStatus: 'NOT_AVAILABLE';

  totalPeriods: number;
  totalEstimatedUnitsSold: number;
  totalEstimatedRevenue: number;

  varianceReviewCount: number;
  priceReviewRequiredCount: number;
  machineCount: number;
  productCount: number;

  firstPeriodStartAt?: string;
  lastPeriodEndAt?: string;
}

export interface ManualSalesQuery {
  machineId?: string;
  productId?: string;
  from?: string;
  to?: string;
}

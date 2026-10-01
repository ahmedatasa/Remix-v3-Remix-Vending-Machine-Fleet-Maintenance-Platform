import type { CommercialProduct, Supplier } from './database';

export type CommercialInventoryBatchStatus =
  | 'ACTIVE'
  | 'NEAR_EXPIRY'
  | 'EXPIRED'
  | 'DEPLETED'
  | 'NO_EXPIRY';

export type CommercialInventoryMovementType =
  | 'RECEIPT'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'WRITE_OFF_EXPIRED'
  | 'MACHINE_REFILL_OUT'
  | 'MACHINE_RETURN_IN';

export interface CommercialInventoryBatch {
  id: string;
  productId: string;
  lotNumber: string;
  supplierId?: string;
  productionDate?: string;
  expiryDate?: string;
  quantityReceived: number;
  quantityOnHand: number;
  unitCost: number;
  status?: CommercialInventoryBatchStatus;
  daysToExpiry?: number | null;
  product?: CommercialProduct;
  supplier?: Supplier;
  createdAt: string;
  updatedAt?: string;
}

export interface CommercialInventoryMovement {
  id: string;
  type: CommercialInventoryMovementType;
  productId: string;
  batchId: string;
  quantityChange: number;
  balanceAfter: number;
  unitCost: number;
  supplierId?: string;
  reason?: string;
  notes?: string;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
  product?: CommercialProduct;
  batch?: CommercialInventoryBatch;
  createdAt: string;
}

export interface CommercialInventorySummary {
  totalUnits: number;
  totalValuation: number;
  activeBatchCount: number;
  nearExpiryBatchCount: number;
  expiredBatchCount: number;
  depletedBatchCount: number;
  lowStockProductCount: number;
  productCount: number;
}

export interface CommercialInventoryReceiptInput {
  productId: string;
  lotNumber: string;
  supplierId?: string;
  productionDate?: string;
  expiryDate?: string;
  quantity: number;
  unitCost: number;
  notes?: string;
}

export interface CommercialInventoryAdjustmentInput {
  batchId: string;
  quantityDelta: number;
  reason: string;
  notes?: string;
}

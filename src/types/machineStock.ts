import type { CommercialProduct, Machine } from './database';
import type { CommercialInventoryBatch } from './commercialInventory';

export type MachineStockMovementType =
  | 'COUNT_RECONCILIATION'
  | 'REFILL_IN'
  | 'RETURN_TO_WAREHOUSE'
  | 'WASTE';

export type RefillVisitStatus = 'OPEN' | 'COMPLETED';

export interface MachineStockRecord {
  id: string;
  machineId: string;
  productId: string;
  quantityOnHand: number;
  lastCountedAt?: string;
  lastRefilledAt?: string;
  lastVisitId?: string;
  machine?: Machine;
  product?: CommercialProduct;
  createdAt: string;
  updatedAt?: string;
}

export interface MachineStockMovement {
  id: string;
  type: MachineStockMovementType;
  visitId: string;
  machineId: string;
  productId: string;
  batchId?: string;
  quantityChange: number;
  balanceAfter: number;
  warehouseBatchBalanceAfter?: number;

  // Captured at physical count time so historical estimated sales
  // are not silently changed by future product price edits.
  sellingPriceSnapshot?: number;
  purchaseCostSnapshot?: number;

  reason?: string;
  notes?: string;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
  machine?: Machine;
  product?: CommercialProduct;
  batch?: CommercialInventoryBatch;
  createdAt: string;
}

export interface RefillVisit {
  id: string;
  machineId: string;
  status: RefillVisitStatus;
  delegateId?: string;
  delegateName?: string;
  delegateRole?: string;
  notes?: string;
  startedAt: string;
  completedAt?: string;
  completedNotes?: string;
  machine?: Machine;
  movementCount?: number;
}

export interface MachineStockSummary {
  totalUnitsInMachines: number;
  machinesWithStock: number;
  stockedProductCount: number;
  openVisitCount: number;
  movementCount: number;
}

export interface StartRefillVisitInput {
  machineId: string;
  notes?: string;
}

export interface MachineCountInput {
  productId: string;
  countedQuantity: number;
  reason?: string;
  notes?: string;
}

export interface MachineRefillInput {
  batchId: string;
  quantity: number;
  countedBefore?: number;
  notes?: string;
}

export interface MachineReturnInput {
  productId: string;
  batchId: string;
  quantity: number;
  reason?: string;
  notes?: string;
}

export interface MachineWasteInput {
  productId: string;
  quantity: number;
  reason: string;
  notes?: string;
}

import express from 'express';
import type { RuntimeStoreData } from './runtimeStoreTypes';

interface ManualSalesRouteDeps {
  getStore: () => RuntimeStoreData;
}

type Accumulator = {
  lastCount: any;
  refilled: number;
  returned: number;
  waste: number;
  operationalMovementCount: number;
};

function numberValue(value: any): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function movementTime(row: any): number {
  const parsed = new Date(row?.createdAt || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildManualSalesLedger(store: RuntimeStoreData) {
  const movements = Array.isArray(store.machineStockMovements)
    ? store.machineStockMovements
    : [];

  const machines = Array.isArray(store.machines)
    ? store.machines
    : [];

  const products = Array.isArray(store.products)
    ? store.products
    : [];

  const machineMap = new Map(
    machines.map((machine: any) => [machine.id, machine])
  );

  const productMap = new Map(
    products.map((product: any) => [product.id, product])
  );

  const ordered = movements
    .map((movement: any, index: number) => ({
      movement,
      index
    }))
    .sort((a, b) => {
      const timeDiff =
        movementTime(a.movement) -
        movementTime(b.movement);

      return timeDiff || a.index - b.index;
    });

  const states = new Map<string, Accumulator>();
  const ledger: any[] = [];

  for (const entry of ordered) {
    const movement = entry.movement || {};

    const machineId =
      String(movement.machineId || '').trim();

    const productId =
      String(movement.productId || '').trim();

    if (!machineId || !productId) {
      continue;
    }

    const key = `${machineId}::${productId}`;

    let state = states.get(key);

    if (!state) {
      state = {
        lastCount: null,
        refilled: 0,
        returned: 0,
        waste: 0,
        operationalMovementCount: 0
      };

      states.set(key, state);
    }

    const type =
      String(movement.type || '').toUpperCase();

    if (type === 'REFILL_IN') {
      if (state.lastCount) {
        state.refilled +=
          Math.max(0, numberValue(movement.quantityChange));

        state.operationalMovementCount++;
      }

      continue;
    }

    if (type === 'RETURN_TO_WAREHOUSE') {
      if (state.lastCount) {
        state.returned +=
          Math.abs(numberValue(movement.quantityChange));

        state.operationalMovementCount++;
      }

      continue;
    }

    if (type === 'WASTE') {
      if (state.lastCount) {
        state.waste +=
          Math.abs(numberValue(movement.quantityChange));

        state.operationalMovementCount++;
      }

      continue;
    }

    if (type !== 'COUNT_RECONCILIATION') {
      continue;
    }

    /*
     * First physical count establishes the opening baseline.
     * No sale is invented before a real opening count exists.
     */
    if (!state.lastCount) {
      state.lastCount = movement;
      state.refilled = 0;
      state.returned = 0;
      state.waste = 0;
      state.operationalMovementCount = 0;
      continue;
    }

    /*
     * Any additional count inside the SAME visit is treated as a
     * corrected/final physical baseline, never as a sales period.
     *
     * This includes a post-refill verification count. Sales periods
     * are created only between physical counts from different visits.
     */
    if (
      String(state.lastCount.visitId || '') ===
      String(movement.visitId || '')
    ) {
      state.lastCount = movement;
      state.refilled = 0;
      state.returned = 0;
      state.waste = 0;
      state.operationalMovementCount = 0;
      continue;
    }

    const opening =
      numberValue(state.lastCount.balanceAfter);

    const closing =
      numberValue(movement.balanceAfter);

    const rawEstimatedUnitsSold =
      opening +
      state.refilled -
      state.returned -
      state.waste -
      closing;

    const hasCountPrice =
      Number.isFinite(
        Number(movement.sellingPriceSnapshot)
      );

    const qualityStatus =
      rawEstimatedUnitsSold < 0
        ? 'VARIANCE_REVIEW'
        : (
            hasCountPrice
              ? 'ESTIMATED'
              : 'PRICE_REVIEW_REQUIRED'
          );

    /*
     * Never represent a negative variance as negative sales.
     * Keep the raw value for investigation.
     */
    const estimatedUnitsSold =
      Math.max(0, rawEstimatedUnitsSold);

    const product: any =
      productMap.get(productId);

    /*
     * Never price a historical period using today's product price.
     * Legacy counts created before price snapshots existed retain
     * their unit estimate but require explicit price review.
     */
    const sellingPriceSnapshot =
      hasCountPrice
        ? Number(movement.sellingPriceSnapshot)
        : null;

    const priceSource =
      hasCountPrice
        ? 'COUNT_SNAPSHOT'
        : 'PRICE_NOT_SNAPSHOTTED';

    const machine: any =
      machineMap.get(machineId);

    const periodStartAt =
      String(state.lastCount.createdAt || '');

    const periodEndAt =
      String(movement.createdAt || '');

    ledger.push({
      id:
        `manual-sale-${String(state.lastCount.id || 'baseline')}` +
        `-${String(movement.id || 'closing')}`,

      source: 'MANUAL_STOCK',
      qualityStatus,

      machineId,
      productId,

      periodStartAt,
      periodEndAt,

      openingQuantity: opening,
      refilledQuantity: state.refilled,
      returnedQuantity: state.returned,
      wasteQuantity: state.waste,
      closingQuantity: closing,

      rawEstimatedUnitsSold,
      estimatedUnitsSold,

      sellingPriceSnapshot,
      estimatedRevenue:
        sellingPriceSnapshot === null
          ? null
          : estimatedUnitsSold * sellingPriceSnapshot,

      priceSource,

      baselineCountMovementId:
        String(state.lastCount.id || ''),

      closingCountMovementId:
        String(movement.id || ''),

      baselineVisitId:
        state.lastCount.visitId || undefined,

      closingVisitId:
        movement.visitId || undefined,

      machine,
      product
    });

    /*
     * Closing count becomes the next opening baseline.
     */
    state.lastCount = movement;
    state.refilled = 0;
    state.returned = 0;
    state.waste = 0;
    state.operationalMovementCount = 0;
  }

  return ledger.sort((a, b) =>
    String(b.periodEndAt).localeCompare(
      String(a.periodEndAt)
    )
  );
}

function parseDateFilter(
  value: any,
  endOfDay = false
): number | null {
  const clean = String(value || '').trim();

  if (!clean) return null;

  let parsed: Date;

  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    parsed = new Date(
      `${clean}T${endOfDay
        ? '23:59:59.999'
        : '00:00:00.000'}Z`
    );
  } else {
    parsed = new Date(clean);
  }

  const ms = parsed.getTime();

  return Number.isFinite(ms) ? ms : null;
}

function filterLedger(
  rows: any[],
  req: express.Request
) {
  const machineId =
    String(req.query.machine_id || '').trim();

  const productId =
    String(req.query.product_id || '').trim();

  const fromRaw =
    String(req.query.from || '').trim();

  const toRaw =
    String(req.query.to || '').trim();

  const fromMs =
    parseDateFilter(fromRaw, false);

  const toMs =
    parseDateFilter(toRaw, true);

  if (fromRaw && fromMs === null) {
    throw new Error('FROM_DATE_INVALID');
  }

  if (toRaw && toMs === null) {
    throw new Error('TO_DATE_INVALID');
  }

  return rows.filter((row: any) => {
    if (
      machineId &&
      row.machineId !== machineId
    ) {
      return false;
    }

    if (
      productId &&
      row.productId !== productId
    ) {
      return false;
    }

    const periodEndMs =
      new Date(row.periodEndAt).getTime();

    if (
      fromMs !== null &&
      periodEndMs < fromMs
    ) {
      return false;
    }

    if (
      toMs !== null &&
      periodEndMs > toMs
    ) {
      return false;
    }

    return true;
  });
}

export function createManualSalesRouter(
  deps: ManualSalesRouteDeps
) {
  const router = express.Router();

  router.get('/ledger', (req, res) => {
    try {
      const store = deps.getStore();

      const rows = filterLedger(
        buildManualSalesLedger(store),
        req
      );

      return res.json(rows);
    } catch (error: any) {
      if (
        error?.message === 'FROM_DATE_INVALID' ||
        error?.message === 'TO_DATE_INVALID'
      ) {
        return res.status(400).json({
          error: error.message
        });
      }

      console.error(
        '[ManualSales] Ledger generation failed:',
        error
      );

      return res.status(500).json({
        error: 'MANUAL_SALES_LEDGER_FAILED'
      });
    }
  });

  router.get('/summary', (req, res) => {
    try {
      const store = deps.getStore();

      const rows = filterLedger(
        buildManualSalesLedger(store),
        req
      );

      const machineIds =
        new Set<string>();

      const productIds =
        new Set<string>();

      let totalEstimatedUnitsSold = 0;
      let totalEstimatedRevenue = 0;
      let varianceReviewCount = 0;
      let priceReviewRequiredCount = 0;

      for (const row of rows) {
        machineIds.add(row.machineId);
        productIds.add(row.productId);

        totalEstimatedUnitsSold +=
          numberValue(row.estimatedUnitsSold);

        if (row.estimatedRevenue !== null) {
          totalEstimatedRevenue +=
            numberValue(row.estimatedRevenue);
        }

        if (
          row.qualityStatus ===
          'VARIANCE_REVIEW'
        ) {
          varianceReviewCount++;
        }

        if (
          row.qualityStatus ===
          'PRICE_REVIEW_REQUIRED'
        ) {
          priceReviewRequiredCount++;
        }
      }

      const chronological = rows
        .slice()
        .sort((a, b) =>
          String(a.periodStartAt).localeCompare(
            String(b.periodStartAt)
          )
        );

      return res.json({
        source: 'MANUAL_STOCK',
        posDataStatus: 'NOT_AVAILABLE',

        totalPeriods: rows.length,
        totalEstimatedUnitsSold,
        totalEstimatedRevenue,

        varianceReviewCount,
        priceReviewRequiredCount,
        machineCount: machineIds.size,
        productCount: productIds.size,

        firstPeriodStartAt:
          chronological[0]?.periodStartAt,

        lastPeriodEndAt:
          chronological.length
            ? chronological[
                chronological.length - 1
              ]?.periodEndAt
            : undefined
      });
    } catch (error: any) {
      if (
        error?.message === 'FROM_DATE_INVALID' ||
        error?.message === 'TO_DATE_INVALID'
      ) {
        return res.status(400).json({
          error: error.message
        });
      }

      console.error(
        '[ManualSales] Summary generation failed:',
        error
      );

      return res.status(500).json({
        error: 'MANUAL_SALES_SUMMARY_FAILED'
      });
    }
  });

  return router;
}

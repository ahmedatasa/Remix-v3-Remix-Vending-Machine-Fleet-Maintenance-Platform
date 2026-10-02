import express from 'express';
import crypto from 'crypto';
import { createRequireEnterpriseRole } from './authSecurity';
import type { RuntimeStoreData } from './runtimeStoreTypes';

interface MachineStockRouteDeps {
  getStore: () => RuntimeStoreData;
  saveStore: (store?: RuntimeStoreData) => void;
}

const WRITE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER', 'WAREHOUSE', 'WAREHOUSE_OFFICER'];
const DAY_MS = 24 * 60 * 60 * 1000;

function nextId(prefix: string) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

function ensureCollections(store: RuntimeStoreData) {
  const mutable = store as RuntimeStoreData & {
    machineStockRecords?: any[];
    machineStockMovements?: any[];
    refillVisits?: any[];
    commercialInventoryBatches?: any[];
    commercialInventoryMovements?: any[];
  };

  if (!Array.isArray(mutable.machineStockRecords)) mutable.machineStockRecords = [];
  if (!Array.isArray(mutable.machineStockMovements)) mutable.machineStockMovements = [];
  if (!Array.isArray(mutable.refillVisits)) mutable.refillVisits = [];
  if (!Array.isArray(mutable.commercialInventoryBatches)) mutable.commercialInventoryBatches = [];
  if (!Array.isArray(mutable.commercialInventoryMovements)) mutable.commercialInventoryMovements = [];
  if (!Array.isArray(mutable.auditLogs)) mutable.auditLogs = [];
  return mutable;
}

function actorFromRequest(req: express.Request) {
  const user = (req as any).user || {};
  return {
    actorId: String(user.id || '').trim() || undefined,
    actorName: String(user.fullName || user.name || user.email || user.id || 'SYSTEM').trim(),
    actorRole: String(user.role || '').trim().toUpperCase() || undefined
  };
}

function dateOnly(value?: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  const ms = parsed.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isExpiredBatch(batch: any, now = new Date()) {
  const expiryMs = dateOnly(batch?.expiryDate);
  if (expiryMs === null) return false;
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((expiryMs - todayMs) / DAY_MS) < 0;
}

function findMachine(store: RuntimeStoreData, machineId: string) {
  return (store.machines || []).find((item: any) => item.id === machineId && item.isDeleted !== true);
}

function findProduct(store: RuntimeStoreData, productId: string, requireActive = false) {
  return (store.products || []).find((item: any) =>
    item.id === productId &&
    item.isDeleted !== true &&
    (!requireActive || item.isActive !== false)
  );
}

function getStockRecord(store: any, machineId: string, productId: string, create = false) {
  let record = (store.machineStockRecords || []).find((item: any) =>
    item.machineId === machineId && item.productId === productId
  );

  if (!record && create) {
    const now = new Date().toISOString();
    record = {
      id: nextId('msr'),
      machineId,
      productId,
      quantityOnHand: 0,
      createdAt: now,
      updatedAt: now
    };
    store.machineStockRecords.push(record);
  }

  return record;
}

function getOpenVisit(store: any, visitId: string) {
  return (store.refillVisits || []).find((item: any) => item.id === visitId && item.status === 'OPEN');
}

function enrichStock(store: RuntimeStoreData, row: any) {
  return {
    ...row,
    machine: findMachine(store, row.machineId),
    product: findProduct(store, row.productId)
  };
}

function enrichMovement(store: any, row: any) {
  return {
    ...row,
    machine: findMachine(store, row.machineId),
    product: findProduct(store, row.productId),
    batch: row.batchId
      ? (store.commercialInventoryBatches || []).find((item: any) => item.id === row.batchId)
      : undefined
  };
}

function enrichVisit(store: any, visit: any) {
  return {
    ...visit,
    machine: findMachine(store, visit.machineId),
    movementCount: (store.machineStockMovements || []).filter((item: any) => item.visitId === visit.id).length
  };
}

function appendAudit(store: any, action: string, entityName: string, entityId: string, actor: any, values: any) {
  store.auditLogs.unshift({
    id: nextId('aud'),
    action,
    entityName,
    entityId,
    newValues: values,
    userId: actor.actorId,
    userName: actor.actorName,
    createdAt: new Date().toISOString()
  });
}

export function createMachineStockRouter(deps: MachineStockRouteDeps) {
  const router = express.Router();
  const requireWriteRole = createRequireEnterpriseRole(WRITE_ROLES);

  router.get('/summary', (_req, res) => {
    const store = ensureCollections(deps.getStore());
    const activeRecords = (store.machineStockRecords || []).filter((row: any) => Number(row.quantityOnHand || 0) > 0);
    const summary = {
      totalUnitsInMachines: activeRecords.reduce((sum: number, row: any) => sum + Math.max(0, Number(row.quantityOnHand || 0)), 0),
      machinesWithStock: new Set(activeRecords.map((row: any) => row.machineId)).size,
      stockedProductCount: new Set(activeRecords.map((row: any) => row.productId)).size,
      openVisitCount: (store.refillVisits || []).filter((visit: any) => visit.status === 'OPEN').length,
      movementCount: (store.machineStockMovements || []).length
    };
    res.json(summary);
  });

  router.get('/records', (req, res) => {
    const store = ensureCollections(deps.getStore());
    const machineId = String(req.query.machine_id || '').trim();
    const rows = (store.machineStockRecords || [])
      .filter((row: any) => !machineId || row.machineId === machineId)
      .map((row: any) => enrichStock(store, row))
      .sort((a: any, b: any) => {
        const machineCompare = String(a.machine?.machineNumber || '').localeCompare(String(b.machine?.machineNumber || ''), undefined, { numeric: true });
        return machineCompare || String(a.product?.sku || '').localeCompare(String(b.product?.sku || ''));
      });
    res.json(rows);
  });

  router.get('/movements', (req, res) => {
    const store = ensureCollections(deps.getStore());
    const machineId = String(req.query.machine_id || '').trim();
    const visitId = String(req.query.visit_id || '').trim();
    const requested = Number(req.query.limit || 300);
    const limit = Number.isFinite(requested) ? Math.min(1000, Math.max(1, requested)) : 300;
    const rows = (store.machineStockMovements || [])
      .filter((row: any) => (!machineId || row.machineId === machineId) && (!visitId || row.visitId === visitId))
      .slice()
      .sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, limit)
      .map((row: any) => enrichMovement(store, row));
    res.json(rows);
  });

  router.get('/visits', (req, res) => {
    const store = ensureCollections(deps.getStore());
    const machineId = String(req.query.machine_id || '').trim();
    const status = String(req.query.status || '').trim().toUpperCase();
    const rows = (store.refillVisits || [])
      .filter((visit: any) => (!machineId || visit.machineId === machineId) && (!status || visit.status === status))
      .slice()
      .sort((a: any, b: any) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')))
      .map((visit: any) => enrichVisit(store, visit));
    res.json(rows);
  });

  router.post('/visits', requireWriteRole, (req, res) => {
    const store = ensureCollections(deps.getStore());
    const machineId = String(req.body?.machineId || '').trim();
    const notes = String(req.body?.notes || '').trim() || undefined;
    const machine = findMachine(store, machineId);
    if (!machine) return res.status(400).json({ error: 'MACHINE_INVALID' });

    const existing = (store.refillVisits || []).find((visit: any) => visit.machineId === machineId && visit.status === 'OPEN');
    if (existing) {
      return res.status(409).json({ error: 'MACHINE_VISIT_ALREADY_OPEN', visit: enrichVisit(store, existing) });
    }

    const actor = actorFromRequest(req);
    const now = new Date().toISOString();
    const visit = {
      id: nextId('rfv'),
      machineId,
      status: 'OPEN',
      delegateId: actor.actorId,
      delegateName: actor.actorName,
      delegateRole: actor.actorRole,
      notes,
      startedAt: now
    };
    store.refillVisits!.push(visit);
    appendAudit(store, 'MACHINE_REFILL_VISIT_STARTED', 'RefillVisit', visit.id, actor, { machineId, notes });
    deps.saveStore(store);
    res.status(201).json(enrichVisit(store, visit));
  });

  router.post('/visits/:id/count', requireWriteRole, (req, res) => {
    const store = ensureCollections(deps.getStore());
    const visit = getOpenVisit(store, req.params.id);
    if (!visit) return res.status(404).json({ error: 'OPEN_REFILL_VISIT_NOT_FOUND' });

    const productId = String(req.body?.productId || '').trim();
    const countedQuantity = Number(req.body?.countedQuantity);
    const reason = String(req.body?.reason || 'Manual delegate count').trim();
    const notes = String(req.body?.notes || '').trim() || undefined;
    const product = findProduct(store, productId);
    if (!product) return res.status(400).json({ error: 'COMMERCIAL_PRODUCT_INVALID' });
    if (!Number.isFinite(countedQuantity) || countedQuantity < 0) {
      return res.status(400).json({ error: 'COUNT_QUANTITY_INVALID' });
    }

    const operationalMovementAlreadyRecorded =
      (store.machineStockMovements || []).some((item: any) =>
        item.visitId === visit.id &&
        item.productId === productId &&
        (
          item.type === 'REFILL_IN' ||
          item.type === 'RETURN_TO_WAREHOUSE' ||
          item.type === 'WASTE'
        )
      );

    if (operationalMovementAlreadyRecorded) {
      return res.status(409).json({
        error: 'COUNT_MUST_PRECEDE_STOCK_MOVEMENTS',
        message:
          'Physical count must be recorded before refill, return or waste for this product in the current visit.'
      });
    }

    const actor = actorFromRequest(req);
    const now = new Date().toISOString();
    const record = getStockRecord(store, visit.machineId, productId, true);
    const before = Number(record.quantityOnHand || 0);
    const delta = countedQuantity - before;
    record.quantityOnHand = countedQuantity;
    record.lastCountedAt = now;
    record.lastVisitId = visit.id;
    record.updatedAt = now;

    const movement = {
      id: nextId('msm'),
      type: 'COUNT_RECONCILIATION',
      visitId: visit.id,
      machineId: visit.machineId,
      productId,
      quantityChange: delta,
      balanceAfter: countedQuantity,
      sellingPriceSnapshot: Number(product.sellingPrice || 0),
      purchaseCostSnapshot: Number(product.purchaseCost || 0),
      reason,
      notes,
      ...actor,
      createdAt: now
    };
    store.machineStockMovements!.push(movement);
    appendAudit(store, 'MACHINE_STOCK_COUNTED', 'MachineStockRecord', record.id, actor, {
      machineId: visit.machineId,
      productId,
      before,
      countedQuantity,
      variance: delta,
      visitId: visit.id
    });
    deps.saveStore(store);
    res.json({ record: enrichStock(store, record), movement: enrichMovement(store, movement) });
  });

  router.post('/visits/:id/refill', requireWriteRole, (req, res) => {
    const store = ensureCollections(deps.getStore());
    const visit = getOpenVisit(store, req.params.id);
    if (!visit) return res.status(404).json({ error: 'OPEN_REFILL_VISIT_NOT_FOUND' });

    const batchId = String(req.body?.batchId || '').trim();
    const quantity = Number(req.body?.quantity);
    const countedBeforeRaw = req.body?.countedBefore;
    const countedBefore = countedBeforeRaw === undefined || countedBeforeRaw === null || countedBeforeRaw === ''
      ? undefined
      : Number(countedBeforeRaw);
    const notes = String(req.body?.notes || '').trim() || undefined;
    const batch = (store.commercialInventoryBatches || []).find((item: any) => item.id === batchId);
    if (!batch) return res.status(404).json({ error: 'COMMERCIAL_BATCH_NOT_FOUND' });
    const product = findProduct(store, batch.productId, true);
    if (!product) return res.status(400).json({ error: 'COMMERCIAL_PRODUCT_INVALID' });
    if (isExpiredBatch(batch)) return res.status(409).json({ error: 'EXPIRED_BATCH_CANNOT_REFILL_MACHINE' });
    if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: 'REFILL_QUANTITY_INVALID' });
    if (Number(batch.quantityOnHand || 0) < quantity) {
      return res.status(409).json({ error: 'WAREHOUSE_STOCK_INSUFFICIENT', availableQuantity: Number(batch.quantityOnHand || 0) });
    }
    if (countedBefore !== undefined && (!Number.isFinite(countedBefore) || countedBefore < 0)) {
      return res.status(400).json({ error: 'COUNT_QUANTITY_INVALID' });
    }

    const hasCountInCurrentVisit =
      (store.machineStockMovements || []).some((item: any) =>
        item.visitId === visit.id &&
        item.productId === batch.productId &&
        item.type === 'COUNT_RECONCILIATION'
      );

    if (!hasCountInCurrentVisit && countedBefore === undefined) {
      return res.status(409).json({
        error: 'COUNT_REQUIRED_BEFORE_REFILL',
        productId: batch.productId,
        message:
          'Record the physical quantity before refilling this product.'
      });
    }

    if (hasCountInCurrentVisit && countedBefore !== undefined) {
      return res.status(409).json({
        error: 'COUNT_ALREADY_RECORDED_FOR_PRODUCT',
        productId: batch.productId,
        message:
          'A physical count already exists for this product in the current visit.'
      });
    }

    const actor = actorFromRequest(req);
    const now = new Date().toISOString();
    const record = getStockRecord(store, visit.machineId, batch.productId, true);

    if (countedBefore !== undefined) {
      const beforeCount = Number(record.quantityOnHand || 0);
      const countDelta = countedBefore - beforeCount;
      record.quantityOnHand = countedBefore;
      record.lastCountedAt = now;
      store.machineStockMovements!.push({
        id: nextId('msm'),
        type: 'COUNT_RECONCILIATION',
        visitId: visit.id,
        machineId: visit.machineId,
        productId: batch.productId,
        quantityChange: countDelta,
        balanceAfter: countedBefore,
        sellingPriceSnapshot: Number(product.sellingPrice || 0),
        purchaseCostSnapshot: Number(product.purchaseCost || 0),
        reason: 'Pre-refill delegate count',
        ...actor,
        createdAt: now
      });
    }

    const warehouseBefore = Number(batch.quantityOnHand || 0);
    batch.quantityOnHand = warehouseBefore - quantity;
    batch.updatedAt = now;

    const machineBefore = Number(record.quantityOnHand || 0);
    record.quantityOnHand = machineBefore + quantity;
    record.lastRefilledAt = now;
    record.lastVisitId = visit.id;
    record.updatedAt = now;

    const movement = {
      id: nextId('msm'),
      type: 'REFILL_IN',
      visitId: visit.id,
      machineId: visit.machineId,
      productId: batch.productId,
      batchId: batch.id,
      quantityChange: quantity,
      balanceAfter: record.quantityOnHand,
      warehouseBatchBalanceAfter: batch.quantityOnHand,
      notes,
      ...actor,
      createdAt: now
    };
    store.machineStockMovements!.push(movement);

    store.commercialInventoryMovements!.push({
      id: nextId('cim'),
      type: 'MACHINE_REFILL_OUT',
      productId: batch.productId,
      batchId: batch.id,
      quantityChange: -quantity,
      balanceAfter: batch.quantityOnHand,
      unitCost: Number(batch.unitCost || 0),
      reason: `Machine refill ${visit.machineId}`,
      notes,
      ...actor,
      createdAt: now
    });

    appendAudit(store, 'MACHINE_REFILLED', 'RefillVisit', visit.id, actor, {
      machineId: visit.machineId,
      productId: batch.productId,
      batchId: batch.id,
      quantity,
      machineBalanceAfter: record.quantityOnHand,
      warehouseBalanceAfter: batch.quantityOnHand
    });
    deps.saveStore(store);
    res.json({ record: enrichStock(store, record), movement: enrichMovement(store, movement), batch });
  });

  router.post('/visits/:id/return', requireWriteRole, (req, res) => {
    const store = ensureCollections(deps.getStore());
    const visit = getOpenVisit(store, req.params.id);
    if (!visit) return res.status(404).json({ error: 'OPEN_REFILL_VISIT_NOT_FOUND' });

    const productId = String(req.body?.productId || '').trim();
    const batchId = String(req.body?.batchId || '').trim();
    const quantity = Number(req.body?.quantity);
    const reason = String(req.body?.reason || 'Return from machine').trim();
    const notes = String(req.body?.notes || '').trim() || undefined;
    const product = findProduct(store, productId);
    if (!product) return res.status(400).json({ error: 'COMMERCIAL_PRODUCT_INVALID' });
    const batch = (store.commercialInventoryBatches || []).find((item: any) => item.id === batchId && item.productId === productId);
    if (!batch) return res.status(400).json({ error: 'RETURN_BATCH_PRODUCT_MISMATCH' });
    if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: 'RETURN_QUANTITY_INVALID' });

    const record = getStockRecord(store, visit.machineId, productId, false);
    const machineBefore = Number(record?.quantityOnHand || 0);
    if (!record || machineBefore < quantity) {
      return res.status(409).json({ error: 'MACHINE_STOCK_INSUFFICIENT', availableQuantity: machineBefore });
    }

    const actor = actorFromRequest(req);
    const now = new Date().toISOString();
    record.quantityOnHand = machineBefore - quantity;
    record.lastVisitId = visit.id;
    record.updatedAt = now;
    batch.quantityOnHand = Number(batch.quantityOnHand || 0) + quantity;
    batch.updatedAt = now;

    const movement = {
      id: nextId('msm'),
      type: 'RETURN_TO_WAREHOUSE',
      visitId: visit.id,
      machineId: visit.machineId,
      productId,
      batchId,
      quantityChange: -quantity,
      balanceAfter: record.quantityOnHand,
      warehouseBatchBalanceAfter: batch.quantityOnHand,
      reason,
      notes,
      ...actor,
      createdAt: now
    };
    store.machineStockMovements!.push(movement);
    store.commercialInventoryMovements!.push({
      id: nextId('cim'),
      type: 'MACHINE_RETURN_IN',
      productId,
      batchId,
      quantityChange: quantity,
      balanceAfter: batch.quantityOnHand,
      unitCost: Number(batch.unitCost || 0),
      reason: `Machine return ${visit.machineId}`,
      notes,
      ...actor,
      createdAt: now
    });
    appendAudit(store, 'MACHINE_STOCK_RETURNED', 'RefillVisit', visit.id, actor, {
      machineId: visit.machineId,
      productId,
      batchId,
      quantity,
      machineBalanceAfter: record.quantityOnHand,
      warehouseBalanceAfter: batch.quantityOnHand
    });
    deps.saveStore(store);
    res.json({ record: enrichStock(store, record), movement: enrichMovement(store, movement), batch });
  });

  router.post('/visits/:id/waste', requireWriteRole, (req, res) => {
    const store = ensureCollections(deps.getStore());
    const visit = getOpenVisit(store, req.params.id);
    if (!visit) return res.status(404).json({ error: 'OPEN_REFILL_VISIT_NOT_FOUND' });

    const productId = String(req.body?.productId || '').trim();
    const quantity = Number(req.body?.quantity);
    const reason = String(req.body?.reason || '').trim();
    const notes = String(req.body?.notes || '').trim() || undefined;
    if (!findProduct(store, productId)) return res.status(400).json({ error: 'COMMERCIAL_PRODUCT_INVALID' });
    if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: 'WASTE_QUANTITY_INVALID' });
    if (!reason) return res.status(400).json({ error: 'WASTE_REASON_REQUIRED' });

    const record = getStockRecord(store, visit.machineId, productId, false);
    const before = Number(record?.quantityOnHand || 0);
    if (!record || before < quantity) {
      return res.status(409).json({ error: 'MACHINE_STOCK_INSUFFICIENT', availableQuantity: before });
    }

    const actor = actorFromRequest(req);
    const now = new Date().toISOString();
    record.quantityOnHand = before - quantity;
    record.lastVisitId = visit.id;
    record.updatedAt = now;

    const movement = {
      id: nextId('msm'),
      type: 'WASTE',
      visitId: visit.id,
      machineId: visit.machineId,
      productId,
      quantityChange: -quantity,
      balanceAfter: record.quantityOnHand,
      reason,
      notes,
      ...actor,
      createdAt: now
    };
    store.machineStockMovements!.push(movement);
    appendAudit(store, 'MACHINE_STOCK_WASTE_RECORDED', 'RefillVisit', visit.id, actor, {
      machineId: visit.machineId,
      productId,
      quantity,
      reason,
      balanceAfter: record.quantityOnHand
    });
    deps.saveStore(store);
    res.json({ record: enrichStock(store, record), movement: enrichMovement(store, movement) });
  });

  router.post('/visits/:id/complete', requireWriteRole, (req, res) => {
    const store = ensureCollections(deps.getStore());
    const visit = getOpenVisit(store, req.params.id);
    if (!visit) return res.status(404).json({ error: 'OPEN_REFILL_VISIT_NOT_FOUND' });

    const actor = actorFromRequest(req);
    const now = new Date().toISOString();
    visit.status = 'COMPLETED';
    visit.completedAt = now;
    visit.completedNotes = String(req.body?.notes || '').trim() || undefined;
    appendAudit(store, 'MACHINE_REFILL_VISIT_COMPLETED', 'RefillVisit', visit.id, actor, {
      machineId: visit.machineId,
      completedAt: now,
      movementCount: (store.machineStockMovements || []).filter((item: any) => item.visitId === visit.id).length
    });
    deps.saveStore(store);
    res.json(enrichVisit(store, visit));
  });

  return router;
}

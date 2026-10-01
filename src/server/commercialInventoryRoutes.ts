import express from 'express';
import crypto from 'crypto';
import { createRequireEnterpriseRole } from './authSecurity';
import type { RuntimeStoreData } from './runtimeStoreTypes';

interface CommercialInventoryRouteDeps {
  getStore: () => RuntimeStoreData;
  saveStore: (store?: RuntimeStoreData) => void;
}

const WRITE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MAINTENANCE_MANAGER', 'WAREHOUSE', 'WAREHOUSE_OFFICER'];
const DAY_MS = 24 * 60 * 60 * 1000;

function ensureCollections(store: RuntimeStoreData) {
  const mutable = store as RuntimeStoreData & {
    commercialInventoryBatches?: any[];
    commercialInventoryMovements?: any[];
  };
  if (!Array.isArray(mutable.commercialInventoryBatches)) mutable.commercialInventoryBatches = [];
  if (!Array.isArray(mutable.commercialInventoryMovements)) mutable.commercialInventoryMovements = [];
  if (!Array.isArray(mutable.auditLogs)) mutable.auditLogs = [];
  return mutable;
}

function dateOnly(value?: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  const ms = parsed.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function getExpiryState(batch: any, now = new Date()) {
  const quantity = Number(batch.quantityOnHand || 0);
  if (quantity <= 0) return { status: 'DEPLETED', daysToExpiry: null };

  const expiryMs = dateOnly(batch.expiryDate);
  if (expiryMs === null) return { status: 'NO_EXPIRY', daysToExpiry: null };

  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysToExpiry = Math.floor((expiryMs - todayMs) / DAY_MS);
  if (daysToExpiry < 0) return { status: 'EXPIRED', daysToExpiry };
  if (daysToExpiry <= 30) return { status: 'NEAR_EXPIRY', daysToExpiry };
  return { status: 'ACTIVE', daysToExpiry };
}

function actorFromRequest(req: express.Request) {
  const user = (req as any).user || {};
  return {
    actorId: String(user.id || '').trim() || undefined,
    actorName: String(user.fullName || user.name || user.email || user.id || 'SYSTEM').trim(),
    actorRole: String(user.role || '').trim().toUpperCase() || undefined
  };
}

function enrichBatch(store: RuntimeStoreData, batch: any) {
  const product = (store.products || []).find((item: any) => item.id === batch.productId);
  const supplier = batch.supplierId
    ? (store.suppliers || []).find((item: any) => item.id === batch.supplierId)
    : undefined;
  return { ...batch, ...getExpiryState(batch), product, supplier };
}

function nextId(prefix: string) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

export function createCommercialInventoryRouter(deps: CommercialInventoryRouteDeps) {
  const router = express.Router();
  const requireWriteRole = createRequireEnterpriseRole(WRITE_ROLES);

  router.get('/summary', (_req, res) => {
    const store = ensureCollections(deps.getStore());
    const batches = store.commercialInventoryBatches || [];
    const enriched = batches.map(batch => enrichBatch(store, batch));
    const productTotals = new Map<string, number>();

    for (const batch of enriched) {
      const qty = Math.max(0, Number(batch.quantityOnHand || 0));
      productTotals.set(batch.productId, (productTotals.get(batch.productId) || 0) + qty);
    }

    let lowStockProductCount = 0;
    for (const product of store.products || []) {
      if (product.isDeleted === true || product.isActive === false) continue;
      const min = Number(product.minStockLevel || 0);
      if (min > 0 && (productTotals.get(product.id) || 0) < min) lowStockProductCount += 1;
    }

    const summary = {
      totalUnits: enriched.reduce((sum, batch) => sum + Math.max(0, Number(batch.quantityOnHand || 0)), 0),
      totalValuation: enriched.reduce((sum, batch) => sum + Math.max(0, Number(batch.quantityOnHand || 0)) * Math.max(0, Number(batch.unitCost || 0)), 0),
      activeBatchCount: enriched.filter(batch => ['ACTIVE', 'NEAR_EXPIRY', 'NO_EXPIRY'].includes(batch.status)).length,
      nearExpiryBatchCount: enriched.filter(batch => batch.status === 'NEAR_EXPIRY').length,
      expiredBatchCount: enriched.filter(batch => batch.status === 'EXPIRED').length,
      depletedBatchCount: enriched.filter(batch => batch.status === 'DEPLETED').length,
      lowStockProductCount,
      productCount: (store.products || []).filter((product: any) => product.isDeleted !== true && product.isActive !== false).length
    };

    res.json(summary);
  });

  router.get('/batches', (req, res) => {
    const store = ensureCollections(deps.getStore());
    const includeDepleted = String(req.query.include_depleted || '').toLowerCase() === 'true';
    const batches = (store.commercialInventoryBatches || [])
      .map(batch => enrichBatch(store, batch))
      .filter(batch => includeDepleted || batch.status !== 'DEPLETED')
      .sort((a, b) => {
        const aExpiry = dateOnly(a.expiryDate) ?? Number.MAX_SAFE_INTEGER;
        const bExpiry = dateOnly(b.expiryDate) ?? Number.MAX_SAFE_INTEGER;
        return aExpiry - bExpiry || String(a.lotNumber || '').localeCompare(String(b.lotNumber || ''));
      });
    res.json(batches);
  });

  router.get('/movements', (req, res) => {
    const store = ensureCollections(deps.getStore());
    const requested = Number(req.query.limit || 200);
    const limit = Number.isFinite(requested) ? Math.min(1000, Math.max(1, requested)) : 200;
    const rows = (store.commercialInventoryMovements || [])
      .slice()
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, limit)
      .map(row => ({
        ...row,
        product: (store.products || []).find((item: any) => item.id === row.productId),
        batch: (store.commercialInventoryBatches || []).find((item: any) => item.id === row.batchId)
      }));
    res.json(rows);
  });

  router.post('/receive', requireWriteRole, (req, res) => {
    const store = ensureCollections(deps.getStore());
    const productId = String(req.body?.productId || '').trim();
    const lotNumber = String(req.body?.lotNumber || '').trim();
    const supplierId = String(req.body?.supplierId || '').trim() || undefined;
    const productionDate = String(req.body?.productionDate || '').trim() || undefined;
    const expiryDate = String(req.body?.expiryDate || '').trim() || undefined;
    const quantity = Number(req.body?.quantity);
    const unitCost = Number(req.body?.unitCost ?? 0);
    const notes = String(req.body?.notes || '').trim() || undefined;

    const product = (store.products || []).find((item: any) => item.id === productId && item.isDeleted !== true && item.isActive !== false);
    if (!product) return res.status(400).json({ error: 'COMMERCIAL_PRODUCT_INVALID' });
    if (!lotNumber) return res.status(400).json({ error: 'BATCH_LOT_REQUIRED' });
    if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: 'RECEIPT_QUANTITY_INVALID' });
    if (!Number.isFinite(unitCost) || unitCost < 0) return res.status(400).json({ error: 'RECEIPT_UNIT_COST_INVALID' });

    if (supplierId) {
      const supplier = (store.suppliers || []).find((item: any) => item.id === supplierId && item.isDeleted !== true && item.isActive !== false);
      if (!supplier) return res.status(400).json({ error: 'RECEIPT_SUPPLIER_INVALID' });
    }

    const productionMs = dateOnly(productionDate);
    const expiryMs = dateOnly(expiryDate);
    if (productionDate && productionMs === null) return res.status(400).json({ error: 'PRODUCTION_DATE_INVALID' });
    if (expiryDate && expiryMs === null) return res.status(400).json({ error: 'EXPIRY_DATE_INVALID' });
    if (productionMs !== null && expiryMs !== null && expiryMs < productionMs) {
      return res.status(400).json({ error: 'EXPIRY_BEFORE_PRODUCTION' });
    }

    const now = new Date().toISOString();
    const actor = actorFromRequest(req);
    let batch = (store.commercialInventoryBatches || []).find((item: any) =>
      item.productId === productId &&
      String(item.lotNumber || '').toLowerCase() === lotNumber.toLowerCase() &&
      String(item.expiryDate || '') === String(expiryDate || '') &&
      String(item.supplierId || '') === String(supplierId || '')
    );

    if (!batch) {
      batch = {
        id: nextId('cbt'),
        productId,
        lotNumber,
        supplierId,
        productionDate,
        expiryDate,
        quantityReceived: 0,
        quantityOnHand: 0,
        unitCost,
        createdAt: now,
        updatedAt: now
      };
      store.commercialInventoryBatches!.push(batch);
    }

    batch.quantityReceived = Number(batch.quantityReceived || 0) + quantity;
    batch.quantityOnHand = Number(batch.quantityOnHand || 0) + quantity;
    batch.unitCost = unitCost;
    batch.updatedAt = now;

    const movement = {
      id: nextId('cim'),
      type: 'RECEIPT',
      productId,
      batchId: batch.id,
      quantityChange: quantity,
      balanceAfter: batch.quantityOnHand,
      unitCost,
      supplierId,
      notes,
      ...actor,
      createdAt: now
    };
    store.commercialInventoryMovements!.push(movement);
    store.auditLogs.unshift({
      id: nextId('aud'),
      action: 'COMMERCIAL_INVENTORY_RECEIVED',
      entityName: 'CommercialInventoryBatch',
      entityId: batch.id,
      newValues: { productId, lotNumber, quantity, balanceAfter: batch.quantityOnHand, expiryDate },
      userId: actor.actorId,
      userName: actor.actorName,
      createdAt: now
    });

    deps.saveStore(store);
    res.status(201).json({ batch: enrichBatch(store, batch), movement });
  });

  router.post('/adjust', requireWriteRole, (req, res) => {
    const store = ensureCollections(deps.getStore());
    const batchId = String(req.body?.batchId || '').trim();
    const quantityDelta = Number(req.body?.quantityDelta);
    const reason = String(req.body?.reason || '').trim();
    const notes = String(req.body?.notes || '').trim() || undefined;
    const batch = (store.commercialInventoryBatches || []).find((item: any) => item.id === batchId);

    if (!batch) return res.status(404).json({ error: 'COMMERCIAL_BATCH_NOT_FOUND' });
    if (!Number.isFinite(quantityDelta) || quantityDelta === 0) return res.status(400).json({ error: 'ADJUSTMENT_QUANTITY_INVALID' });
    if (!reason) return res.status(400).json({ error: 'ADJUSTMENT_REASON_REQUIRED' });

    const current = Number(batch.quantityOnHand || 0);
    const next = current + quantityDelta;
    if (next < 0) return res.status(409).json({ error: 'NEGATIVE_STOCK_NOT_ALLOWED', availableQuantity: current });

    const now = new Date().toISOString();
    const actor = actorFromRequest(req);
    batch.quantityOnHand = next;
    batch.updatedAt = now;

    const movement = {
      id: nextId('cim'),
      type: quantityDelta > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
      productId: batch.productId,
      batchId: batch.id,
      quantityChange: quantityDelta,
      balanceAfter: next,
      unitCost: Number(batch.unitCost || 0),
      reason,
      notes,
      ...actor,
      createdAt: now
    };
    store.commercialInventoryMovements!.push(movement);
    store.auditLogs.unshift({
      id: nextId('aud'),
      action: 'COMMERCIAL_INVENTORY_ADJUSTED',
      entityName: 'CommercialInventoryBatch',
      entityId: batch.id,
      oldValues: { quantityOnHand: current },
      newValues: { quantityOnHand: next, quantityDelta, reason },
      userId: actor.actorId,
      userName: actor.actorName,
      createdAt: now
    });

    deps.saveStore(store);
    res.json({ batch: enrichBatch(store, batch), movement });
  });

  router.post('/batches/:id/write-off-expired', requireWriteRole, (req, res) => {
    const store = ensureCollections(deps.getStore());
    const batch = (store.commercialInventoryBatches || []).find((item: any) => item.id === req.params.id);
    if (!batch) return res.status(404).json({ error: 'COMMERCIAL_BATCH_NOT_FOUND' });

    const expiryState = getExpiryState(batch);
    if (expiryState.status !== 'EXPIRED') return res.status(409).json({ error: 'BATCH_NOT_EXPIRED' });
    const current = Number(batch.quantityOnHand || 0);
    if (current <= 0) return res.status(409).json({ error: 'BATCH_ALREADY_DEPLETED' });

    const reason = String(req.body?.reason || 'Expired stock write-off').trim();
    const now = new Date().toISOString();
    const actor = actorFromRequest(req);
    batch.quantityOnHand = 0;
    batch.updatedAt = now;

    const movement = {
      id: nextId('cim'),
      type: 'WRITE_OFF_EXPIRED',
      productId: batch.productId,
      batchId: batch.id,
      quantityChange: -current,
      balanceAfter: 0,
      unitCost: Number(batch.unitCost || 0),
      reason,
      ...actor,
      createdAt: now
    };
    store.commercialInventoryMovements!.push(movement);
    store.auditLogs.unshift({
      id: nextId('aud'),
      action: 'COMMERCIAL_EXPIRED_STOCK_WRITTEN_OFF',
      entityName: 'CommercialInventoryBatch',
      entityId: batch.id,
      oldValues: { quantityOnHand: current },
      newValues: { quantityOnHand: 0, reason },
      userId: actor.actorId,
      userName: actor.actorName,
      createdAt: now
    });

    deps.saveStore(store);
    res.json({ batch: enrichBatch(store, batch), movement });
  });

  return router;
}

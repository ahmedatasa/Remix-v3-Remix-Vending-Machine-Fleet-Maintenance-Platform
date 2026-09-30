import fs from 'fs';

const replacements = [
  {
    file: 'server.ts',
    from: "import { createCommercialInventoryRouter } from './src/server/commercialInventoryRoutes';",
    to: "import { createCommercialInventoryRouter } from './src/server/commercialInventoryRoutes';\nimport { createMachineStockRouter } from './src/server/machineStockRoutes';"
  },
  {
    file: 'server.ts',
    from: "  // Commercial vending inventory, batches, expiry control and stock ledger.\n  apiRouter.use('/commercial-inventory', createCommercialInventoryRouter({ getStore, saveStore }));\n\n  // Suppliers",
    to: "  // Commercial vending inventory, batches, expiry control and stock ledger.\n  apiRouter.use('/commercial-inventory', createCommercialInventoryRouter({ getStore, saveStore }));\n\n  // Per-machine commercial stock, delegate counting and refill visit ledger.\n  apiRouter.use('/machine-stock', createMachineStockRouter({ getStore, saveStore }));\n\n  // Suppliers"
  },
  {
    file: 'server.ts',
    from: "    const movements = Array.isArray((store as any).commercialInventoryMovements)\n      ? (store as any).commercialInventoryMovements.filter((item: any) => item.productId === product.id)\n      : [];\n\n    if (batches.length > 0 || movements.length > 0) {\n      return res.status(409).json({\n        error: 'PRODUCT_HAS_INVENTORY_HISTORY',\n        message: 'Product cannot be deleted because inventory history exists. Deactivate it instead.',\n        referenceCounts: { batches: batches.length, movements: movements.length }\n      });\n    }",
    to: "    const movements = Array.isArray((store as any).commercialInventoryMovements)\n      ? (store as any).commercialInventoryMovements.filter((item: any) => item.productId === product.id)\n      : [];\n    const machineStockRecords = Array.isArray((store as any).machineStockRecords)\n      ? (store as any).machineStockRecords.filter((item: any) => item.productId === product.id)\n      : [];\n    const machineStockMovements = Array.isArray((store as any).machineStockMovements)\n      ? (store as any).machineStockMovements.filter((item: any) => item.productId === product.id)\n      : [];\n\n    if (batches.length > 0 || movements.length > 0 || machineStockRecords.length > 0 || machineStockMovements.length > 0) {\n      return res.status(409).json({\n        error: 'PRODUCT_HAS_INVENTORY_HISTORY',\n        message: 'Product cannot be deleted because warehouse or machine inventory history exists. Deactivate it instead.',\n        referenceCounts: {\n          batches: batches.length,\n          movements: movements.length,\n          machineStockRecords: machineStockRecords.length,\n          machineStockMovements: machineStockMovements.length\n        }\n      });\n    }"
  },
  {
    file: 'src/App.tsx',
    from: "import { CommercialInventoryView } from './components/views/CommercialInventoryView';\nimport { InventoryView } from './components/views/InventoryView';",
    to: "import { CommercialInventoryView } from './components/views/CommercialInventoryView';\nimport { MachineStockView } from './components/views/MachineStockView';\nimport { InventoryView } from './components/views/InventoryView';"
  },
  {
    file: 'src/App.tsx',
    from: "            {activeTab === 'commercial-inventory' && <CommercialInventoryView onNavigate={handleNavigate} />}\n            {activeTab === 'inventory' && <InventoryView onNavigate={handleNavigate} />}",
    to: "            {activeTab === 'commercial-inventory' && <CommercialInventoryView onNavigate={handleNavigate} />}\n            {activeTab === 'machine-stock' && <MachineStockView onNavigate={handleNavigate} />}\n            {activeTab === 'inventory' && <InventoryView onNavigate={handleNavigate} />}"
  },
  {
    file: 'src/components/layout/Sidebar.tsx',
    from: "    { id: 'commercial-inventory', labelKey: 'commercialInventory', icon: PackageCheck, section: 'inventory' },\n    { id: 'inventory', labelKey: 'inventory', icon: Boxes, section: 'inventory' },",
    to: "    { id: 'commercial-inventory', labelKey: 'commercialInventory', icon: PackageCheck, section: 'inventory' },\n    { id: 'machine-stock', labelKey: 'machineStock', icon: Boxes, section: 'inventory' },\n    { id: 'inventory', labelKey: 'inventory', icon: Boxes, section: 'inventory' },"
  },
  {
    file: 'src/components/layout/Header.tsx',
    from: "      case 'commercial-inventory': return t('commercialInventory');\n      case 'inventory': return t('inventory');",
    to: "      case 'commercial-inventory': return t('commercialInventory');\n      case 'machine-stock': return t('machineStock');\n      case 'inventory': return t('inventory');"
  },
  {
    file: 'src/context/AuthContext.tsx',
    from: "      case 'products':\n      case 'commercial-inventory':\n      case 'inventory':",
    to: "      case 'products':\n      case 'commercial-inventory':\n      case 'machine-stock':\n      case 'inventory':"
  },
  {
    file: 'src/i18n/translations.ts',
    from: '    commercialInventory: "Commercial Inventory & Expiry",\n    inventory: "Inventory & Stock",',
    to: '    commercialInventory: "Commercial Inventory & Expiry",\n    machineStock: "Machine Stock & Refill",\n    inventory: "Inventory & Stock",'
  },
  {
    file: 'src/i18n/translations.ts',
    from: '    commercialInventory: "مخزون البضاعة والصلاحية",\n    inventory: "المخزون والحركات",',
    to: '    commercialInventory: "مخزون البضاعة والصلاحية",\n    machineStock: "مخزون الماكينات والجرد والتعبئة",\n    inventory: "المخزون والحركات",'
  },
  {
    file: 'src/types/index.ts',
    from: "export * from './commercialInventory';\n",
    to: "export * from './commercialInventory';\nexport * from './machineStock';\n"
  },
  {
    file: 'src/types/index.ts',
    from: "  | 'commercial-inventory'\n  | 'inventory'",
    to: "  | 'commercial-inventory'\n  | 'machine-stock'\n  | 'inventory'"
  },
  {
    file: 'src/types/commercialInventory.ts',
    from: "  | 'ADJUSTMENT_OUT'\n  | 'WRITE_OFF_EXPIRED';",
    to: "  | 'ADJUSTMENT_OUT'\n  | 'WRITE_OFF_EXPIRED'\n  | 'MACHINE_REFILL_OUT'\n  | 'MACHINE_RETURN_IN';"
  },
  {
    file: 'src/server/runtimeStoreTypes.ts',
    from: "  commercialInventoryMovements?: any[];\n  suppliers: any[];",
    to: "  commercialInventoryMovements?: any[];\n  machineStockRecords?: any[];\n  machineStockMovements?: any[];\n  refillVisits?: any[];\n  suppliers: any[];"
  },
  {
    file: 'src/services/api.ts',
    from: "  CommercialInventoryReceiptInput, CommercialInventoryAdjustmentInput,\n  AuditLog, User, UserRole, MachineModel, MachineStatus, TicketStatus, TicketPriority,",
    to: "  CommercialInventoryReceiptInput, CommercialInventoryAdjustmentInput,\n  MachineStockRecord, MachineStockMovement, MachineStockSummary, RefillVisit,\n  StartRefillVisitInput, MachineCountInput, MachineRefillInput, MachineReturnInput, MachineWasteInput,\n  AuditLog, User, UserRole, MachineModel, MachineStatus, TicketStatus, TicketPriority,"
  },
  {
    file: 'src/services/api.ts',
    from: "  async writeOffExpiredCommercialBatch(batchId: string, reason?: string) {\n    return await apiFetch<{ batch: CommercialInventoryBatch; movement: CommercialInventoryMovement }>(`/commercial-inventory/batches/${batchId}/write-off-expired`, {\n      method: 'POST',\n      body: JSON.stringify(reason ? { reason } : {})\n    });\n  },\n\n  // Suppliers",
    to: "  async writeOffExpiredCommercialBatch(batchId: string, reason?: string) {\n    return await apiFetch<{ batch: CommercialInventoryBatch; movement: CommercialInventoryMovement }>(`/commercial-inventory/batches/${batchId}/write-off-expired`, {\n      method: 'POST',\n      body: JSON.stringify(reason ? { reason } : {})\n    });\n  },\n\n  // Machine Stock, Delegate Count & Refill\n  async getMachineStockSummary() {\n    return await apiFetch<MachineStockSummary>('/machine-stock/summary');\n  },\n\n  async getMachineStockRecords(machineId?: string) {\n    const suffix = machineId ? `?machine_id=${encodeURIComponent(machineId)}` : '';\n    return await apiFetch<MachineStockRecord[]>(`/machine-stock/records${suffix}`);\n  },\n\n  async getMachineStockMovements(machineId?: string, limit = 300) {\n    const params = new URLSearchParams();\n    if (machineId) params.set('machine_id', machineId);\n    params.set('limit', String(Math.max(1, Math.min(1000, limit))));\n    return await apiFetch<MachineStockMovement[]>(`/machine-stock/movements?${params.toString()}`);\n  },\n\n  async getRefillVisits(machineId?: string, status?: 'OPEN' | 'COMPLETED') {\n    const params = new URLSearchParams();\n    if (machineId) params.set('machine_id', machineId);\n    if (status) params.set('status', status);\n    const suffix = params.toString() ? `?${params.toString()}` : '';\n    return await apiFetch<RefillVisit[]>(`/machine-stock/visits${suffix}`);\n  },\n\n  async startRefillVisit(input: StartRefillVisitInput) {\n    return await apiFetch<RefillVisit>('/machine-stock/visits', {\n      method: 'POST',\n      body: JSON.stringify(input)\n    });\n  },\n\n  async countMachineStock(visitId: string, input: MachineCountInput) {\n    return await apiFetch<{ record: MachineStockRecord; movement: MachineStockMovement }>(`/machine-stock/visits/${visitId}/count`, {\n      method: 'POST',\n      body: JSON.stringify(input)\n    });\n  },\n\n  async refillMachineStock(visitId: string, input: MachineRefillInput) {\n    return await apiFetch<{ record: MachineStockRecord; movement: MachineStockMovement; batch: CommercialInventoryBatch }>(`/machine-stock/visits/${visitId}/refill`, {\n      method: 'POST',\n      body: JSON.stringify(input)\n    });\n  },\n\n  async returnMachineStock(visitId: string, input: MachineReturnInput) {\n    return await apiFetch<{ record: MachineStockRecord; movement: MachineStockMovement; batch: CommercialInventoryBatch }>(`/machine-stock/visits/${visitId}/return`, {\n      method: 'POST',\n      body: JSON.stringify(input)\n    });\n  },\n\n  async recordMachineStockWaste(visitId: string, input: MachineWasteInput) {\n    return await apiFetch<{ record: MachineStockRecord; movement: MachineStockMovement }>(`/machine-stock/visits/${visitId}/waste`, {\n      method: 'POST',\n      body: JSON.stringify(input)\n    });\n  },\n\n  async completeRefillVisit(visitId: string, notes?: string) {\n    return await apiFetch<RefillVisit>(`/machine-stock/visits/${visitId}/complete`, {\n      method: 'POST',\n      body: JSON.stringify(notes ? { notes } : {})\n    });\n  },\n\n  // Suppliers"
  }
];

function applyReplacement({ file, from, to }) {
  let text = fs.readFileSync(file, 'utf8');
  if (text.includes(to)) {
    console.log(`SKIP already applied: ${file}`);
    return;
  }
  if (!text.includes(from)) {
    throw new Error(`Expected Machine Stock integration anchor not found in ${file}`);
  }
  text = text.replace(from, to);
  fs.writeFileSync(file, text, 'utf8');
  console.log(`UPDATED ${file}`);
}

for (const replacement of replacements) applyReplacement(replacement);
console.log('Machine Stock + Refill v1 integration applied. No runtime data was modified.');

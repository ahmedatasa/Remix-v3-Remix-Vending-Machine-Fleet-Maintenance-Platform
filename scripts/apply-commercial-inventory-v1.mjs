import fs from 'fs';

const replacements = [
  {
    file: 'server.ts',
    from: "import { mainToCloudLocationSyncWorker } from './src/server/mainToCloudLocationSyncWorker';",
    to: "import { mainToCloudLocationSyncWorker } from './src/server/mainToCloudLocationSyncWorker';\nimport { createCommercialInventoryRouter } from './src/server/commercialInventoryRoutes';"
  },
  {
    file: 'server.ts',
    from: "  apiRouter.post('/products/:id/reactivate', requireEnterpriseRole(productWriteRoles), setCommercialProductActive(true));\n\n  // Suppliers",
    to: "  apiRouter.post('/products/:id/reactivate', requireEnterpriseRole(productWriteRoles), setCommercialProductActive(true));\n\n  // Commercial vending inventory, batches, expiry control and stock ledger.\n  apiRouter.use('/commercial-inventory', createCommercialInventoryRouter({ getStore, saveStore }));\n\n  // Suppliers"
  },
  {
    file: 'src/App.tsx',
    from: "import { ProductsView } from './components/views/ProductsView';\nimport { InventoryView } from './components/views/InventoryView';",
    to: "import { ProductsView } from './components/views/ProductsView';\nimport { CommercialInventoryView } from './components/views/CommercialInventoryView';\nimport { InventoryView } from './components/views/InventoryView';"
  },
  {
    file: 'src/App.tsx',
    from: "            {activeTab === 'products' && <ProductsView onNavigate={handleNavigate} />}\n            {activeTab === 'inventory' && <InventoryView onNavigate={handleNavigate} />}",
    to: "            {activeTab === 'products' && <ProductsView onNavigate={handleNavigate} />}\n            {activeTab === 'commercial-inventory' && <CommercialInventoryView onNavigate={handleNavigate} />}\n            {activeTab === 'inventory' && <InventoryView onNavigate={handleNavigate} />}"
  },
  {
    file: 'src/components/layout/Sidebar.tsx',
    from: "  Package,\n  Boxes,",
    to: "  Package,\n  PackageCheck,\n  Boxes,"
  },
  {
    file: 'src/components/layout/Sidebar.tsx',
    from: "    { id: 'products', labelKey: 'products', icon: Package, section: 'inventory' },\n    { id: 'inventory', labelKey: 'inventory', icon: Boxes, section: 'inventory' },",
    to: "    { id: 'products', labelKey: 'products', icon: Package, section: 'inventory' },\n    { id: 'commercial-inventory', labelKey: 'commercialInventory', icon: PackageCheck, section: 'inventory' },\n    { id: 'inventory', labelKey: 'inventory', icon: Boxes, section: 'inventory' },"
  },
  {
    file: 'src/components/layout/Header.tsx',
    from: "      case 'products': return t('products');\n      case 'inventory': return t('inventory');",
    to: "      case 'products': return t('products');\n      case 'commercial-inventory': return t('commercialInventory');\n      case 'inventory': return t('inventory');"
  },
  {
    file: 'src/context/AuthContext.tsx',
    from: "      case 'products':\n      case 'inventory':",
    to: "      case 'products':\n      case 'commercial-inventory':\n      case 'inventory':"
  },
  {
    file: 'src/i18n/translations.ts',
    from: '    products: "Vending Products",\n    inventory: "Inventory & Stock",',
    to: '    products: "Vending Products",\n    commercialInventory: "Commercial Inventory & Expiry",\n    inventory: "Inventory & Stock",'
  },
  {
    file: 'src/i18n/translations.ts',
    from: '    products: "منتجات البيع",\n    inventory: "المخزون والحركات",',
    to: '    products: "منتجات البيع",\n    commercialInventory: "مخزون البضاعة والصلاحية",\n    inventory: "المخزون والحركات",'
  },
  {
    file: 'src/types/index.ts',
    from: "export * from './database';\n",
    to: "export * from './database';\nexport * from './commercialInventory';\n"
  },
  {
    file: 'src/types/index.ts',
    from: "  | 'products'\n  | 'inventory'",
    to: "  | 'products'\n  | 'commercial-inventory'\n  | 'inventory'"
  },
  {
    file: 'src/server/runtimeStoreTypes.ts',
    from: "  products: any[];\n  suppliers: any[];",
    to: "  products: any[];\n  commercialInventoryBatches?: any[];\n  commercialInventoryMovements?: any[];\n  suppliers: any[];"
  },
  {
    file: 'src/services/api.ts',
    from: "  SparePartCategory, InventoryTransaction, SparePartRequest, Supplier, CommercialProduct,\n  AuditLog, User, UserRole, MachineModel, MachineStatus, TicketStatus, TicketPriority,",
    to: "  SparePartCategory, InventoryTransaction, SparePartRequest, Supplier, CommercialProduct,\n  CommercialInventoryBatch, CommercialInventoryMovement, CommercialInventorySummary,\n  CommercialInventoryReceiptInput, CommercialInventoryAdjustmentInput,\n  AuditLog, User, UserRole, MachineModel, MachineStatus, TicketStatus, TicketPriority,"
  },
  {
    file: 'src/services/api.ts',
    from: "  async reactivateProduct(id: string) {\n    return await apiFetch<CommercialProduct>(`/products/${id}/reactivate`, { method: 'POST' });\n  },\n\n  // Suppliers",
    to: "  async reactivateProduct(id: string) {\n    return await apiFetch<CommercialProduct>(`/products/${id}/reactivate`, { method: 'POST' });\n  },\n\n  // Commercial Inventory & Expiry\n  async getCommercialInventorySummary() {\n    return await apiFetch<CommercialInventorySummary>('/commercial-inventory/summary');\n  },\n\n  async getCommercialInventoryBatches(includeDepleted = false) {\n    const suffix = includeDepleted ? '?include_depleted=true' : '';\n    return await apiFetch<CommercialInventoryBatch[]>(`/commercial-inventory/batches${suffix}`);\n  },\n\n  async getCommercialInventoryMovements(limit = 200) {\n    return await apiFetch<CommercialInventoryMovement[]>(`/commercial-inventory/movements?limit=${Math.max(1, Math.min(1000, limit))}`);\n  },\n\n  async receiveCommercialInventory(input: CommercialInventoryReceiptInput) {\n    return await apiFetch<{ batch: CommercialInventoryBatch; movement: CommercialInventoryMovement }>('/commercial-inventory/receive', {\n      method: 'POST',\n      body: JSON.stringify(input)\n    });\n  },\n\n  async adjustCommercialInventory(input: CommercialInventoryAdjustmentInput) {\n    return await apiFetch<{ batch: CommercialInventoryBatch; movement: CommercialInventoryMovement }>('/commercial-inventory/adjust', {\n      method: 'POST',\n      body: JSON.stringify(input)\n    });\n  },\n\n  async writeOffExpiredCommercialBatch(batchId: string, reason?: string) {\n    return await apiFetch<{ batch: CommercialInventoryBatch; movement: CommercialInventoryMovement }>(`/commercial-inventory/batches/${batchId}/write-off-expired`, {\n      method: 'POST',\n      body: JSON.stringify(reason ? { reason } : {})\n    });\n  },\n\n  // Suppliers"
  }
];

function applyReplacement({ file, from, to }) {
  let text = fs.readFileSync(file, 'utf8');
  if (text.includes(to)) {
    console.log(`SKIP already applied: ${file}`);
    return;
  }
  if (!text.includes(from)) {
    throw new Error(`Expected integration anchor not found in ${file}`);
  }
  text = text.replace(from, to);
  fs.writeFileSync(file, text, 'utf8');
  console.log(`UPDATED ${file}`);
}

for (const replacement of replacements) applyReplacement(replacement);

console.log('Commercial Inventory v1 integration applied. No runtime data was modified.');

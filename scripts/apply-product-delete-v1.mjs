import fs from 'fs';

const replacements = [
  {
    file: 'server.ts',
    from: "  apiRouter.post('/products/:id/deactivate', requireEnterpriseRole(productWriteRoles), setCommercialProductActive(false));\n  apiRouter.post('/products/:id/reactivate', requireEnterpriseRole(productWriteRoles), setCommercialProductActive(true));",
    to: "  apiRouter.post('/products/:id/deactivate', requireEnterpriseRole(productWriteRoles), setCommercialProductActive(false));\n  apiRouter.post('/products/:id/reactivate', requireEnterpriseRole(productWriteRoles), setCommercialProductActive(true));\n\n  // Safe product deletion: only products with no commercial inventory history can be removed.\n  // The delete is soft (isDeleted=true) so audit/history integrity is preserved.\n  apiRouter.delete('/products/:id', requireEnterpriseRole(productWriteRoles), (req, res) => {\n    const store = getStore();\n    const product = (store.products || []).find((item: any) => item.id === req.params.id && item.isDeleted !== true);\n    if (!product) return res.status(404).json({ error: 'PRODUCT_NOT_FOUND' });\n\n    const batches = Array.isArray((store as any).commercialInventoryBatches)\n      ? (store as any).commercialInventoryBatches.filter((item: any) => item.productId === product.id)\n      : [];\n    const movements = Array.isArray((store as any).commercialInventoryMovements)\n      ? (store as any).commercialInventoryMovements.filter((item: any) => item.productId === product.id)\n      : [];\n\n    if (batches.length > 0 || movements.length > 0) {\n      return res.status(409).json({\n        error: 'PRODUCT_HAS_INVENTORY_HISTORY',\n        message: 'Product cannot be deleted because inventory history exists. Deactivate it instead.',\n        referenceCounts: { batches: batches.length, movements: movements.length }\n      });\n    }\n\n    const now = new Date().toISOString();\n    const actor = (req as any).user || {};\n    product.isDeleted = true;\n    product.isActive = false;\n    product.deletedAt = now;\n    product.deletedBy = actor.id || undefined;\n    product.updatedAt = now;\n\n    store.auditLogs = store.auditLogs || [];\n    store.auditLogs.unshift({\n      id: `aud-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,\n      action: 'COMMERCIAL_PRODUCT_DELETED',\n      entityName: 'CommercialProduct',\n      entityId: product.id,\n      oldValues: { sku: product.sku, name: product.name, isActive: product.isActive },\n      newValues: { isDeleted: true },\n      userId: actor.id || undefined,\n      userName: actor.fullName || actor.name || actor.email || undefined,\n      createdAt: now\n    });\n\n    saveStore(store);\n    res.json({ success: true, id: product.id });\n  });"
  },
  {
    file: 'src/services/api.ts',
    from: "  async reactivateProduct(id: string) {\n    return await apiFetch<CommercialProduct>(`/products/${id}/reactivate`, { method: 'POST' });\n  },",
    to: "  async reactivateProduct(id: string) {\n    return await apiFetch<CommercialProduct>(`/products/${id}/reactivate`, { method: 'POST' });\n  },\n\n  async deleteProduct(id: string) {\n    return await apiFetch<{ success: boolean; id: string }>(`/products/${id}`, { method: 'DELETE' });\n  },"
  },
  {
    file: 'src/components/views/ProductsView.tsx',
    from: "import { Edit2, Package, Plus, Power } from 'lucide-react';",
    to: "import { Edit2, Package, Plus, Power, Trash2 } from 'lucide-react';"
  },
  {
    file: 'src/components/views/ProductsView.tsx',
    from: "  const toggleActive = async (product: CommercialProduct) => {\n    try {\n      if (product.isActive === false) await api.reactivateProduct(product.id);\n      else await api.deactivateProduct(product.id);\n      await loadData();\n    } catch (err: any) {\n      showToast(t('error'), err?.message || 'Failed to update product status', 'error');\n    }\n  };",
    to: "  const toggleActive = async (product: CommercialProduct) => {\n    try {\n      if (product.isActive === false) await api.reactivateProduct(product.id);\n      else await api.deactivateProduct(product.id);\n      await loadData();\n    } catch (err: any) {\n      showToast(t('error'), err?.message || 'Failed to update product status', 'error');\n    }\n  };\n\n  const deleteProduct = async (product: CommercialProduct) => {\n    const label = isRTL ? (product.nameAr || product.name || product.sku) : (product.name || product.nameAr || product.sku);\n    const confirmed = window.confirm(\n      isRTL\n        ? `حذف المنتج «${label}»؟\\n\\nسيتم الحذف فقط إذا لم توجد له أي حركة أو دفعة مخزون. إذا وُجد تاريخ مخزون يجب إيقاف المنتج بدلاً من حذفه.`\n        : `Delete product “${label}”?\\n\\nDeletion is allowed only when the product has no inventory batch or movement history. Otherwise deactivate it instead.`\n    );\n    if (!confirmed) return;\n\n    try {\n      await api.deleteProduct(product.id);\n      showToast(t('success'), isRTL ? 'تم حذف المنتج بنجاح' : 'Product deleted successfully', 'success');\n      await loadData();\n    } catch (err: any) {\n      const message = String(err?.message || '');\n      const hasHistory = message.includes('PRODUCT_HAS_INVENTORY_HISTORY');\n      showToast(\n        hasHistory ? (isRTL ? 'لا يمكن حذف المنتج' : 'Product cannot be deleted') : t('error'),\n        hasHistory\n          ? (isRTL ? 'يوجد للمنتج سجل مخزون أو حركات. استخدم إيقاف المنتج للحفاظ على السجل.' : 'This product has inventory history. Deactivate it instead to preserve the ledger.')\n          : (message || 'Failed to delete product'),\n        hasHistory ? 'warning' : 'error'\n      );\n    }\n  };"
  },
  {
    file: 'src/components/views/ProductsView.tsx',
    from: "<button onClick={() => openEdit(row)} className=\"p-1.5 text-slate-400 hover:text-blue-400\"><Edit2 className=\"w-4 h-4\" /></button><button onClick={() => toggleActive(row)} className=\"p-1.5 text-slate-400 hover:text-amber-400\"><Power className=\"w-4 h-4\" /></button>",
    to: "<button onClick={() => openEdit(row)} className=\"p-1.5 text-slate-400 hover:text-blue-400\" title={isRTL ? 'تعديل' : 'Edit'}><Edit2 className=\"w-4 h-4\" /></button><button onClick={() => toggleActive(row)} className=\"p-1.5 text-slate-400 hover:text-amber-400\" title={row.isActive === false ? (isRTL ? 'تنشيط' : 'Reactivate') : (isRTL ? 'إيقاف' : 'Deactivate')}><Power className=\"w-4 h-4\" /></button><button onClick={() => deleteProduct(row)} className=\"p-1.5 text-slate-400 hover:text-red-400\" title={isRTL ? 'حذف' : 'Delete'}><Trash2 className=\"w-4 h-4\" /></button>"
  }
];

function applyReplacement({ file, from, to }) {
  let text = fs.readFileSync(file, 'utf8');
  if (text.includes(to)) {
    console.log(`SKIP already applied: ${file}`);
    return;
  }
  if (!text.includes(from)) {
    throw new Error(`Expected product-delete integration anchor not found in ${file}`);
  }
  text = text.replace(from, to);
  fs.writeFileSync(file, text, 'utf8');
  console.log(`UPDATED ${file}`);
}

for (const replacement of replacements) applyReplacement(replacement);
console.log('Safe Product Delete integration applied. No runtime data was modified.');

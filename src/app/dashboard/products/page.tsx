"use client";

import { useState, useMemo } from "react";
import { useData } from "@/lib/data-context";
import { useSettings } from "@/lib/settings-context";
import { useActivityLog } from "@/lib/activity-log";
import { useTrash } from "@/lib/trash";
import ProductModal from "@/components/ProductModal";
import { Product } from "@/lib/types";
import { hasPermission } from "@/lib/permissions";
import { getAdminPermissionsConfig } from "@/components/PermissionGate";
import ImportExportBar from "@/components/ImportExportBar";

export default function ProductsPage() {
  const { products, suppliers, deleteProduct, updateProduct } = useData();
  const { settings } = useSettings();
  const { logActivity } = useActivityLog();
  const { softDelete } = useTrash();
  const config = getAdminPermissionsConfig();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const canCreate = hasPermission(settings.currentRole, "products.create", config);
  const canEdit = hasPermission(settings.currentRole, "products.edit", config);
  const canDelete = hasPermission(settings.currentRole, "products.delete", config);

  const filtered = useMemo(() => {
    if (!searchQuery) return products;
    const q = searchQuery.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.notes.toLowerCase().includes(q) ||
        suppliers.find((s) => s.id === p.supplierId)?.name.toLowerCase().includes(q)
    );
  }, [products, searchQuery, suppliers]);

  const getSupplierName = (id: string) => suppliers.find((s) => s.id === id)?.name || "—";

  const handleDelete = async (product: Product) => {
    await softDelete("product", product.id, product.name, { ...product }, settings.currentRole);
    await deleteProduct(product.id);
    await logActivity({
      user: settings.currentRole,
      action: "delete",
      entity: "منتج",
      entityId: product.id,
      details: `حذف المنتج "${product.name}"`,
    });
    setDeleteConfirm(null);
  };

  const handleInlineEdit = async (id: string, field: keyof Product, value: number) => {
    await updateProduct(id, { [field]: value });
    const product = products.find((p) => p.id === id);
    await logActivity({
      user: settings.currentRole,
      action: "update",
      entity: "منتج",
      entityId: id,
      details: `تعديل ${field === "costPrice" ? "سعر التكلفة" : field === "wholesalePrice" ? "سعر الجملة" : field === "retailPrice" ? "سعر المفرد" : field === "stock" ? "الكمية" : field} للمنتج "${product?.name}"`,
      newValue: value.toString(),
    });
  };

  const totalValue = filtered.reduce((sum, p) => sum + p.retailPrice * p.stock, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">المنتجات</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{filtered.length} منتج | إجمالي القيمة: {totalValue.toLocaleString()} د.ع</p>
        </div>
        <div className="flex gap-2">
          {canCreate && (
            <button
              onClick={() => { setEditingProduct(null); setModalOpen(true); }}
              className="px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2"
              style={{ backgroundColor: "var(--primary)" }}
            >
              <span>+</span> إضافة منتج
            </button>
          )}
        </div>
      </div>

      <ImportExportBar />

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <input
          type="text" placeholder="بحث في المنتجات..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none"
        />
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            <span className="text-4xl block mb-3">📦</span>
            <p>{searchQuery ? "لا توجد نتائج" : "لا توجد منتجات بعد"}</p>
            {canCreate && !searchQuery && (
              <button onClick={() => setModalOpen(true)} className="mt-4 px-4 py-2 text-sm font-medium text-white rounded-lg" style={{ backgroundColor: "var(--primary)" }}>
                أضف أول منتج
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">المنتج</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">التكاليف</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">الجملة</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">المفرد</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">الكمية</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">المورد</th>
                  {canEdit && <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">إجراءات</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {product.image ? (
                          <img src={product.image} alt="" className="w-10 h-10 rounded-lg object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400">📦</div>
                        )}
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{product.name}</p>
                          {product.notes && <p className="text-xs text-gray-400 truncate max-w-[200px]">{product.notes}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {canEdit ? (
                        <InlineNumber value={product.costPrice} onSave={(v) => handleInlineEdit(product.id, "costPrice", v)} />
                      ) : (
                        <span className="text-gray-900 dark:text-white">{product.costPrice.toLocaleString()}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {canEdit ? (
                        <InlineNumber value={product.wholesalePrice} onSave={(v) => handleInlineEdit(product.id, "wholesalePrice", v)} />
                      ) : (
                        <span className="text-gray-900 dark:text-white">{product.wholesalePrice.toLocaleString()}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-900 dark:text-white">{product.retailPrice.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      {canEdit ? (
                        <InlineNumber value={product.stock} onSave={(v) => handleInlineEdit(product.id, "stock", v)} isInteger />
                      ) : (
                        <span className="text-gray-900 dark:text-white">{product.stock}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">{getSupplierName(product.supplierId)}</td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => { setEditingProduct(product); setModalOpen(true); }} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg text-xs">تعديل</button>
                          {canDelete && (
                            <button onClick={() => setDeleteConfirm(product.id)} className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-xs">حذف</button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ProductModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditingProduct(null); }} product={editingProduct} />

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 max-w-md w-full border border-gray-200 dark:border-gray-700 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">حذف المنتج</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              سيتم نقل "{products.find((p) => p.id === deleteConfirm)?.name}" إلى سلة المهملات.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg">إلغاء</button>
              <button onClick={() => { const p = products.find((pr) => pr.id === deleteConfirm); if (p) handleDelete(p); }} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">حذف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InlineNumber({ value, onSave, isInteger = false }: { value: number; onSave: (v: number) => void; isInteger?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState(value.toString());

  const handleSave = () => {
    const parsed = isInteger ? parseInt(temp) : parseFloat(temp);
    if (!isNaN(parsed) && parsed !== value) onSave(parsed);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        type="number" autoFocus value={temp}
        onChange={(e) => setTemp(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
        className="w-24 px-2 py-1 border border-[var(--primary)] rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-1 focus:ring-[var(--primary)] outline-none"
      />
    );
  }

  return (
    <span onClick={() => { setTemp(value.toString()); setEditing(true); }} className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 px-2 py-1 rounded text-gray-900 dark:text-white" title="اضغط للتعديل">
      {isInteger ? value : value.toLocaleString()}
    </span>
  );
}

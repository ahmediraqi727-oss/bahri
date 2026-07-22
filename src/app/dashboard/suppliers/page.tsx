"use client";

import { useState, useMemo } from "react";
import { useData } from "@/lib/data-context";
import { useSettings } from "@/lib/settings-context";
import { useActivityLog } from "@/lib/activity-log";
import { useTrash } from "@/lib/trash";
import { Supplier } from "@/lib/types";
import { hasPermission } from "@/lib/permissions";
import { getAdminPermissionsConfig } from "@/components/PermissionGate";

export default function SuppliersPage() {
  const { suppliers, products, addSupplier, updateSupplier, deleteSupplier } = useData();
  const { settings } = useSettings();
  const { logActivity } = useActivityLog();
  const { softDelete } = useTrash();
  const config = getAdminPermissionsConfig();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const canCreate = hasPermission(settings.currentRole, "suppliers.create", config);
  const canEdit = hasPermission(settings.currentRole, "suppliers.edit", config);
  const canDelete = hasPermission(settings.currentRole, "suppliers.delete", config);

  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const filtered = useMemo(() => {
    if (!searchQuery) return suppliers;
    const q = searchQuery.toLowerCase();
    return suppliers.filter(
      (s) => s.name.toLowerCase().includes(q) || s.phone.includes(q) || s.email.toLowerCase().includes(q)
    );
  }, [suppliers, searchQuery]);

  const getProductCount = (supplierId: string) => products.filter((p) => p.supplierId === supplierId).length;

  const openModal = (supplier?: Supplier) => {
    if (supplier) {
      setEditingSupplier(supplier);
      setFormName(supplier.name);
      setFormPhone(supplier.phone);
      setFormEmail(supplier.email);
      setFormAddress(supplier.address);
      setFormNotes(supplier.notes);
    } else {
      setEditingSupplier(null);
      setFormName(""); setFormPhone(""); setFormEmail(""); setFormAddress(""); setFormNotes("");
    }
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = { name: formName.trim(), phone: formPhone.trim(), email: formEmail.trim(), address: formAddress.trim(), notes: formNotes.trim() };
    if (editingSupplier) {
      await updateSupplier(editingSupplier.id, data);
      await logActivity({ user: settings.currentRole, action: "update", entity: "مورد", entityId: editingSupplier.id, details: `تعديل المورد "${data.name}"` });
    } else {
      const newSup = await addSupplier(data);
      await logActivity({ user: settings.currentRole, action: "create", entity: "مورد", entityId: newSup.id, details: `إضافة مورد جديد "${data.name}"` });
    }
    setModalOpen(false);
  };

  const handleDelete = async (supplier: Supplier) => {
    await softDelete("supplier", supplier.id, supplier.name, { ...supplier }, settings.currentRole);
    await deleteSupplier(supplier.id);
    await logActivity({ user: settings.currentRole, action: "delete", entity: "مورد", entityId: supplier.id, details: `حذف المورد "${supplier.name}"` });
    setDeleteConfirm(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">الموردين</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{filtered.length} مورد مسجل</p>
        </div>
        {canCreate && (
          <button onClick={() => openModal()} className="px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2" style={{ backgroundColor: "var(--primary)" }}>
            <span>+</span> إضافة مورد
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <input
          type="text" placeholder="بحث في الموردين..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-full p-12 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
            <span className="text-4xl block mb-3">🚚</span>
            <p>{searchQuery ? "لا توجد نتائج" : "لا يوجد موردين بعد"}</p>
          </div>
        ) : (
          filtered.map((supplier) => (
            <div key={supplier.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white">{supplier.name}</h3>
                  <p className="text-xs text-gray-400 mt-1">{getProductCount(supplier.id)} منتج</p>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <button onClick={() => openModal(supplier)} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg text-xs">تعديل</button>
                    {canDelete && (
                      <button onClick={() => setDeleteConfirm(supplier.id)} className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-xs">حذف</button>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-1.5 text-sm">
                {supplier.phone && <p className="text-gray-600 dark:text-gray-400">📞 {supplier.phone}</p>}
                {supplier.email && <p className="text-gray-600 dark:text-gray-400">✉️ {supplier.email}</p>}
                {supplier.address && <p className="text-gray-600 dark:text-gray-400">📍 {supplier.address}</p>}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-lg w-full border border-gray-200 dark:border-gray-700 shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editingSupplier ? "تعديل المورد" : "إضافة مورد جديد"}</h2>
              <button onClick={() => setModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">اسم المورد *</label>
                <input type="text" required value={formName} onChange={(e) => setFormName(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">الهاتف</label>
                  <input type="tel" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">البريد</label>
                  <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">العنوان</label>
                <input type="text" value={formAddress} onChange={(e) => setFormAddress(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">ملاحظات</label>
                <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={2} className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 py-2.5 text-sm font-medium text-white rounded-lg hover:opacity-90" style={{ backgroundColor: "var(--primary)" }}>
                  {editingSupplier ? "حفظ التعديلات" : "إضافة المورد"}
                </button>
                <button type="button" onClick={() => setModalOpen(false)} className="px-6 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 max-w-md w-full border border-gray-200 dark:border-gray-700 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">حذف المورد</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">سيتم نقل "{suppliers.find((s) => s.id === deleteConfirm)?.name}" إلى سلة المهملات.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg">إلغاء</button>
              <button onClick={() => { const s = suppliers.find((su) => su.id === deleteConfirm); if (s) handleDelete(s); }} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">حذف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

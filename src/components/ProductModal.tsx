"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Product, Supplier, calculateRetailPrice, CategoryItem } from "@/lib/types";
import { useData } from "@/lib/data-context";

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: Product | null;
}

function extractCategoryFromNotes(notes: string | undefined): string {
  if (!notes) return "";
  const match = notes.match(/الفئة:\s*([^|,\n]+)/);
  return match && match[1] ? match[1].trim() : "";
}

function updateNotesWithCategory(notes: string | undefined, categoryName: string): string {
  const current = (notes || "").trim();
  if (!categoryName) {
    let updated = current.replace(/\|?\s*الفئة:\s*[^|,\n]+/g, "").trim();
    if (updated.startsWith("|")) updated = updated.slice(1).trim();
    return updated;
  }
  const tag = `الفئة: ${categoryName}`;
  if (current.includes("الفئة:")) {
    return current.replace(/الفئة:\s*[^|,\n]+/g, tag);
  }
  if (!current) return tag;
  return `${current} | ${tag}`;
}

export default function ProductModal({ isOpen, onClose, product }: ProductModalProps) {
  const { suppliers, categories, products, addProduct, updateProduct, addSupplier, addCategory } = useData();
  const imageRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [wholesalePrice, setWholesalePrice] = useState("");
  const [profitMargin, setProfitMargin] = useState("");
  const [retailPrice, setRetailPrice] = useState("");
  const [stock, setStock] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");

  const [selectedCategoryName, setSelectedCategoryName] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const [newSupplierName, setNewSupplierName] = useState("");
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setError("");
    setSubmitting(false);
    if (product) {
      setName(product.name);
      setImage(product.image);
      setCostPrice(product.costPrice.toString());
      setWholesalePrice(product.wholesalePrice.toString());
      setProfitMargin(product.profitMargin.toString());
      setRetailPrice(product.retailPrice.toString());
      setStock(product.stock.toString());
      setSupplierId(product.supplierId);
      setNotes(product.notes);
      setSelectedCategoryName(extractCategoryFromNotes(product.notes));
      setShowNewSupplier(false);
      setNewSupplierName("");
      setShowNewCategory(false);
      setNewCategoryName("");
    } else {
      setName(""); setImage(""); setCostPrice(""); setWholesalePrice("");
      setProfitMargin(""); setRetailPrice(""); setStock(""); setSupplierId("");
      setNotes(""); setSelectedCategoryName(""); setShowNewSupplier(false); setNewSupplierName("");
      setShowNewCategory(false); setNewCategoryName("");
    }
  }, [product, isOpen]);

  useEffect(() => {
    const cost = parseFloat(costPrice) || 0;
    const margin = parseFloat(profitMargin) || 0;
    if (cost > 0 && margin > 0) {
      setRetailPrice(calculateRetailPrice(cost, margin).toString());
    }
  }, [costPrice, profitMargin]);

  // Smart Auto-Suggest Category based on Product Name
  const suggestedCategory = useMemo(() => {
    if (!name || name.trim().length < 2) return null;
    const q = name.trim().toLowerCase();

    // 1. Direct match with Category name or keywords
    for (const cat of categories) {
      if (q.includes(cat.name.toLowerCase()) || cat.name.toLowerCase().includes(q)) {
        return cat.name;
      }
      if (cat.keywords) {
        const words = cat.keywords.split(/[,،\s]+/).map((w) => w.trim().toLowerCase()).filter(Boolean);
        for (const w of words) {
          if (w.length >= 2 && (q.includes(w) || w.includes(q))) {
            return cat.name;
          }
        }
      }
    }

    // 2. Similar product name match
    for (const p of products) {
      if (p.notes && p.notes.includes("الفئة:")) {
        const pName = p.name.toLowerCase();
        if (q.includes(pName) || pName.includes(q)) {
          const match = p.notes.match(/الفئة:\s*([^|,\n]+)/);
          if (match && match[1]) {
            const foundCat = categories.find((c) => c.name.toLowerCase() === match[1].trim().toLowerCase());
            if (foundCat) return foundCat.name;
          }
        }
      }
    }

    return null;
  }, [name, categories, products]);

  const handleApplySuggestedCategory = (catName: string) => {
    setSelectedCategoryName(catName);
    setNotes((prev) => updateNotesWithCategory(prev, catName));
  };

  const handleCategorySelectChange = (catName: string) => {
    setSelectedCategoryName(catName);
    setNotes((prev) => updateNotesWithCategory(prev, catName));
  };

  const handleCreateInlineCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const created = await addCategory({
        name: newCategoryName.trim(),
        image: "",
        priority: categories.length + 1,
        isActive: true,
      });
      setSelectedCategoryName(created.name);
      setNotes((prev) => updateNotesWithCategory(prev, created.name));
      setShowNewCategory(false);
      setNewCategoryName("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "تعذر إضافة القسم التلقائي";
      alert(msg);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      let finalSupplierId = supplierId;

      if (showNewSupplier && newSupplierName.trim()) {
        const newSup = await addSupplier({
          name: newSupplierName.trim(),
          phone: "",
          email: "",
          address: "",
          notes: "أُضيف تلقائياً من صفحة المنتجات",
        });
        finalSupplierId = newSup.id;
      }

      const finalNotes = updateNotesWithCategory(notes, selectedCategoryName);

      const data = {
        name: name.trim(),
        image,
        costPrice: parseFloat(costPrice) || 0,
        wholesalePrice: parseFloat(wholesalePrice) || 0,
        profitMargin: parseFloat(profitMargin) || 0,
        retailPrice: parseFloat(retailPrice) || 0,
        stock: parseInt(stock) || 0,
        supplierId: finalSupplierId,
        notes: finalNotes,
      };

      if (product) {
        await updateProduct(product.id, data);
      } else {
        await addProduct(data);
      }
      onClose();
    } catch (err: unknown) {
      console.error("Error saving product:", err);
      const msg = err instanceof Error ? err.message : "حدث خطأ أثناء حفظ المنتج، يرجى المحاولة مرة أخرى.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700 shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            {product ? "تعديل المنتج" : "إضافة منتج جديد"}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-gray-500">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-medium">
              ⚠️ {error}
            </div>
          )}

          {/* Image */}
          <div className="flex justify-center">
            <div
              className="w-32 h-32 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 overflow-hidden cursor-pointer hover:border-[var(--primary)] transition-colors relative group"
              onClick={() => imageRef.current?.click()}
            >
              {image ? (
                <>
                  <img src={image} alt="Product" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs">
                    تغيير
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <span className="text-3xl">📷</span>
                  <span className="text-xs mt-1">صورة المنتج</span>
                </div>
              )}
            </div>
            <input ref={imageRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </div>

          {/* Name & Auto-Suggest */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">اسم المنتج *</label>
            <input
              type="text" required value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none"
              placeholder="مثال: دلاية، محمل كرات، بطارية، فلتر زيت..."
            />

            {/* Smart Category Auto-Suggestion Badge */}
            {suggestedCategory && suggestedCategory !== selectedCategoryName && (
              <div className="mt-2 p-2.5 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-xl flex items-center justify-between animate-fadeIn">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-800 dark:text-blue-300">
                  <span>💡</span>
                  <span>يقترح النظام تصنيف هذا المنتج ضمن قسم: <strong>"{suggestedCategory}"</strong></span>
                </div>
                <button
                  type="button"
                  onClick={() => handleApplySuggestedCategory(suggestedCategory)}
                  className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm"
                >
                  تطبيق القسم المقترح ⚡
                </button>
              </div>
            )}
          </div>

          {/* Category Dropdown & Inline Add Category */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">القسم / التصنيف</label>
            {!showNewCategory ? (
              <div className="flex gap-2">
                <select
                  value={selectedCategoryName}
                  onChange={(e) => handleCategorySelectChange(e.target.value)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none font-bold"
                >
                  <option value="">-- بدون قسم / اختر قسم مسبق --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>📁 {c.name}</option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setShowNewCategory(true)}
                  className="px-4 py-2.5 text-sm font-bold text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors whitespace-nowrap"
                >
                  + قسم جديد
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm"
                  placeholder="اسم القسم الجديد..."
                />
                <button
                  type="button"
                  onClick={handleCreateInlineCategory}
                  disabled={!newCategoryName.trim()}
                  className="px-4 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition-colors"
                >
                  إضافة
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNewCategory(false); setNewCategoryName(""); }}
                  className="px-4 py-2.5 text-xs font-bold text-gray-500 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  إلغاء
                </button>
              </div>
            )}
          </div>

          {/* Prices */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">سعر التكلفة *</label>
              <input
                type="number" step="0.01" min="0" required value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">هامش الربح %</label>
              <input
                type="number" step="0.1" min="0" value={profitMargin}
                onChange={(e) => setProfitMargin(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none"
                placeholder="25"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">سعر الجملة</label>
              <input
                type="number" step="0.01" min="0" value={wholesalePrice}
                onChange={(e) => setWholesalePrice(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">سعر المفرد</label>
              <input
                type="number" step="0.01" min="0" value={retailPrice}
                onChange={(e) => setRetailPrice(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-bold focus:ring-2 focus:ring-[var(--primary)] outline-none"
                placeholder="تلقائي"
              />
              <p className="text-xs text-gray-400 mt-1">يُحسب تلقائياً</p>
            </div>
          </div>

          {/* Stock */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">الكمية المتوفرة</label>
            <input
              type="number" min="0" value={stock}
              onChange={(e) => setStock(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none"
              placeholder="0"
            />
          </div>

          {/* Supplier */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">المورد</label>
            {!showNewSupplier ? (
              <div className="flex gap-2">
                <select
                  value={supplierId} onChange={(e) => setSupplierId(e.target.value)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none"
                >
                  <option value="">-- اختر مورد --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewSupplier(true)}
                  className="px-4 py-2.5 text-sm font-medium text-[var(--primary)] border border-[var(--primary)] rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors whitespace-nowrap"
                >
                  + مورد جديد
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text" value={newSupplierName}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none"
                  placeholder="اسم المورد الجديد"
                />
                <button
                  type="button"
                  onClick={() => { setShowNewSupplier(false); setNewSupplierName(""); }}
                  className="px-4 py-2.5 text-sm font-medium text-gray-500 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  إلغاء
                </button>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">ملاحظات وإشارة القسم</label>
            <textarea
              value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none resize-none"
              placeholder="ملاحظات إضافية..."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 text-sm font-bold text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              style={{ backgroundColor: "var(--primary)" }}
            >
              {submitting ? "جاري الحفظ..." : product ? "حفظ التعديلات" : "حفظ المنتج"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-sm font-bold text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

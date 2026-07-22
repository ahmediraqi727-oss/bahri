"use client";

import { useState, useEffect, useRef } from "react";
import { Product, Supplier, calculateRetailPrice } from "@/lib/types";
import { useData } from "@/lib/data-context";

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: Product | null;
}

export default function ProductModal({ isOpen, onClose, product }: ProductModalProps) {
  const { suppliers, addProduct, updateProduct, addSupplier } = useData();
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
  const [newSupplierName, setNewSupplierName] = useState("");
  const [showNewSupplier, setShowNewSupplier] = useState(false);

  useEffect(() => {
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
      setShowNewSupplier(false);
      setNewSupplierName("");
    } else {
      setName(""); setImage(""); setCostPrice(""); setWholesalePrice("");
      setProfitMargin(""); setRetailPrice(""); setStock(""); setSupplierId("");
      setNotes(""); setShowNewSupplier(false); setNewSupplierName("");
    }
  }, [product, isOpen]);

  useEffect(() => {
    const cost = parseFloat(costPrice) || 0;
    const margin = parseFloat(profitMargin) || 0;
    if (cost > 0 && margin > 0) {
      setRetailPrice(calculateRetailPrice(cost, margin).toString());
    }
  }, [costPrice, profitMargin]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

    const data = {
      name: name.trim(),
      image,
      costPrice: parseFloat(costPrice) || 0,
      wholesalePrice: parseFloat(wholesalePrice) || 0,
      profitMargin: parseFloat(profitMargin) || 0,
      retailPrice: parseFloat(retailPrice) || 0,
      stock: parseInt(stock) || 0,
      supplierId: finalSupplierId,
      notes,
    };

    if (product) {
      await updateProduct(product.id, data);
    } else {
      await addProduct(data);
    }
    onClose();
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

          {/* Name */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">اسم المنتج *</label>
            <input
              type="text" required value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none"
              placeholder="مثال: هاتف آيفون 15"
            />
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
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">ملاحظات</label>
            <textarea
              value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none resize-none"
              placeholder="ملاحظات إضافية..."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="submit" className="flex-1 py-2.5 text-sm font-medium text-white rounded-lg hover:opacity-90 transition-opacity" style={{ backgroundColor: "var(--primary)" }}>
              {product ? "حفظ التعديلات" : "حفظ المنتج"}
            </button>
            <button type="button" onClick={onClose} className="px-6 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

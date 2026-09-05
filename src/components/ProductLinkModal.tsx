"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import type { Product } from "@/lib/types";
import { useData } from "@/lib/data-context";
import { assignBarcodeToProduct } from "@/lib/barcode-service";

interface ProductLinkModalProps {
  isOpen: boolean;
  scannedCode: string | null;
  onClose: () => void;
  onLinked?: (product: Product) => void;
  onCreateNew?: (scannedCode: string) => void;
}

export default function ProductLinkModal({
  isOpen,
  scannedCode,
  onClose,
  onLinked,
  onCreateNew,
}: ProductLinkModalProps) {
  const { products, categories, updateProduct } = useData();

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collisionWarning, setCollisionWarning] = useState<{
    targetProduct: Product;
    existingProduct: Product;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Filter products by search and category
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Exclude deleted products if flag is present
      if ((p as { isDeleted?: boolean }).isDeleted) return false;

      const matchesCategory = selectedCategory
        ? (p.notes && p.notes.includes(`الفئة: ${selectedCategory}`)) ||
          (p.notes && p.notes.includes(selectedCategory))
        : true;

      if (!matchesCategory) return false;

      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      const matchName = p.name.toLowerCase().includes(q);
      const matchBarcode = p.barcode?.toLowerCase().includes(q) ?? false;
      const matchQR = p.qrCode?.toLowerCase().includes(q) ?? false;
      return matchName || matchBarcode || matchQR;
    });
  }, [products, search, selectedCategory]);

  if (!isOpen || !scannedCode) return null;

  const copyCode = () => {
    navigator.clipboard.writeText(scannedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLinkProduct = async (targetProduct: Product, forceTransfer = false) => {
    setError(null);
    setLinkingId(targetProduct.id);

    try {
      // 1. Collision check: check if code is currently assigned to another product
      if (!forceTransfer) {
        const existingOwner = products.find(
          (p) =>
            p.id !== targetProduct.id &&
            (p.barcode === scannedCode || p.qrCode === scannedCode)
        );

        if (existingOwner) {
          setCollisionWarning({ targetProduct, existingProduct: existingOwner });
          setLinkingId(null);
          return;
        }
      }

      // 2. Perform DB update via BarcodeService
      await assignBarcodeToProduct(targetProduct.id, scannedCode, "barcode");

      // 3. Perform in-memory and Supabase updates via DataContext
      await updateProduct(targetProduct.id, { barcode: scannedCode });

      // If transferring from existing owner, clear barcode on old product
      if (forceTransfer && collisionWarning?.existingProduct) {
        await updateProduct(collisionWarning.existingProduct.id, { barcode: null });
      }

      setCollisionWarning(null);
      onLinked?.({ ...targetProduct, barcode: scannedCode });
      onClose();
    } catch (err) {
      console.error("Failed to link barcode:", err);
      const msg = err instanceof Error ? err.message : "حدث خطأ أثناء ربط الكود بالمنتج";
      setError(msg);
    } finally {
      setLinkingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" dir="rtl">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />

      {/* Modal Card */}
      <div className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-800 animate-fadeIn">
        {/* Header */}
        <div className="bg-gradient-to-l from-blue-600 via-indigo-600 to-purple-600 p-5 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-xl font-bold">
              🔗
            </div>
            <div>
              <h2 className="font-extrabold text-lg leading-tight">ربط الكود الممسوح بمنتج</h2>
              <p className="text-blue-100 text-xs mt-0.5">
                اختر المنتَج المطلوب من القائمة أدناه لإسناد الكود الجديد إليه
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Scanned Code Display Banner */}
        <div className="bg-blue-50 dark:bg-blue-950/50 border-b border-blue-100 dark:border-blue-900/50 px-5 py-3 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs text-blue-900 dark:text-blue-200">
            <span className="font-bold">الكود الممسوح:</span>
            <span className="font-mono font-extrabold text-sm px-2.5 py-1 rounded-lg bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400 select-all">
              {scannedCode}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copyCode}
              className="px-3 py-1 bg-white dark:bg-gray-800 hover:bg-blue-100 dark:hover:bg-gray-700 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-bold border border-blue-200 dark:border-blue-700 transition-colors flex items-center gap-1"
            >
              <span>{copied ? "✓ تم النسخ" : "📋 نسخ الكود"}</span>
            </button>
            {onCreateNew && (
              <button
                onClick={() => {
                  onClose();
                  onCreateNew(scannedCode);
                }}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-extrabold shadow-sm transition-colors flex items-center gap-1"
              >
                <span>➕ إنشاء منتج جديد بهذا الكود</span>
              </button>
            )}
          </div>
        </div>

        {/* Collision Alert Banner if triggered */}
        {collisionWarning && (
          <div className="m-4 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-xs space-y-3">
            <div className="flex items-start gap-2">
              <span className="text-xl">⚠️</span>
              <div>
                <p className="font-extrabold text-sm mb-1">تنبيه تعارض الباركود!</p>
                <p>
                  الكود <strong className="font-mono text-amber-700 dark:text-amber-300">{scannedCode}</strong> مرتبط حالياً بالمنتج:
                  <strong className="text-amber-900 dark:text-amber-100 mx-1">"{collisionWarning.existingProduct.name}"</strong>
                </p>
                <p className="mt-1 font-medium">
                  هل ترغب في سحب الكود من المنتج القديم وتعيينه للمنتج المختار:
                  <strong className="text-blue-700 dark:text-blue-300 mx-1">"{collisionWarning.targetProduct.name}"</strong>؟
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1 border-t border-amber-200 dark:border-amber-800">
              <button
                onClick={() => setCollisionWarning(null)}
                className="px-3 py-1.5 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 text-gray-800 dark:text-gray-200 rounded-xl font-bold text-xs"
              >
                إلغاء
              </button>
              <button
                onClick={() => handleLinkProduct(collisionWarning.targetProduct, true)}
                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-extrabold text-xs shadow-md transition-colors"
              >
                نقل الكود والربط الآن ⚡
              </button>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mx-4 mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-bold">
            ⚠️ {error}
          </div>
        )}

        {/* Filters & Search Header */}
        <div className="p-4 space-y-3 bg-gray-50/50 dark:bg-gray-850/50 border-b border-gray-100 dark:border-gray-800">
          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث باسم المنتج، أو الباركود الحالي..."
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white text-sm font-bold placeholder-gray-400 focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
              autoFocus
            />
            <span className="absolute left-3 top-3 text-gray-400 text-base">🔍</span>
          </div>

          {/* Category Filter Pills */}
          {categories.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  selectedCategory === null
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700"
                }`}
              >
                الكل ({products.length})
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.name)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    selectedCategory === cat.name
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700"
                  }`}
                >
                  📁 {cat.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 max-h-[50vh]">
          {filteredProducts.length === 0 ? (
            <div className="py-12 text-center text-gray-400 dark:text-gray-500 space-y-2">
              <span className="text-4xl block">📦</span>
              <p className="text-sm font-bold">لم يتم العثور على منتجات مطابقة للبحث</p>
              {onCreateNew && (
                <button
                  onClick={() => {
                    onClose();
                    onCreateNew(scannedCode);
                  }}
                  className="mt-2 px-4 py-2 bg-gradient-to-l from-blue-600 to-indigo-600 text-white font-extrabold text-xs rounded-xl shadow-md hover:from-blue-700 hover:to-indigo-700 transition-all"
                >
                  ➕ إنشاء منتج جديد باسم "{search}" بالكود الممسوح
                </button>
              )}
            </div>
          ) : (
            filteredProducts.map((product) => {
              const isLinkingThis = linkingId === product.id;
              const hasBarcode = Boolean(product.barcode);

              return (
                <div
                  key={product.id}
                  className="flex items-center justify-between p-3.5 bg-white dark:bg-gray-800 hover:bg-blue-50/50 dark:hover:bg-gray-750 border border-gray-200 dark:border-gray-700/80 rounded-2xl transition-all shadow-sm group"
                >
                  {/* Thumbnail & Product Details */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-700 overflow-hidden flex-shrink-0 border border-gray-200 dark:border-gray-600 flex items-center justify-center">
                      {product.image ? (
                        <Image
                          src={product.image}
                          alt={product.name}
                          fill
                          sizes="48px"
                          className="object-contain p-1"
                        />
                      ) : (
                        <span className="text-xl">📦</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-extrabold text-sm text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {product.name}
                      </h4>
                      <div className="flex items-center gap-2 text-xs mt-0.5 flex-wrap">
                        <span className="font-bold text-blue-600 dark:text-blue-400">
                          {product.retailPrice.toLocaleString()} د.ع
                        </span>
                        <span className="text-gray-400">•</span>
                        <span className="text-gray-500 dark:text-gray-400 font-medium">
                          المخزون: {product.stock}
                        </span>
                        <span className="text-gray-400">•</span>
                        {hasBarcode ? (
                          <span className="font-mono text-[11px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                            {product.barcode}
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-1.5 py-0.5 rounded font-bold">
                            بدون كود
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <button
                    onClick={() => handleLinkProduct(product)}
                    disabled={isLinkingThis}
                    className="px-4 py-2 bg-gradient-to-l from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-extrabold shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50 flex-shrink-0"
                  >
                    {isLinkingThis ? (
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>🔗</span>
                        <span>ربط بهذا المنتج</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            إجمالي المنتجات المعروضة: <strong>{filteredProducts.length}</strong>
          </p>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl font-bold text-xs transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}

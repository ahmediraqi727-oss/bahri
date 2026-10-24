"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Product, Supplier, calculateRetailPrice, CategoryItem } from "@/lib/types";
import { useData } from "@/lib/data-context";
import BarcodeDisplay from "@/components/BarcodeDisplay";
import BarcodeScanner from "@/components/BarcodeScanner";
import { generateEAN13 } from "@/lib/barcode-service";
import {
  ALL_CATEGORIES_LABEL,
  isUniversalCategory,
  isProductInAllCategories,
  extractCategoriesFromProduct,
  splitCategoryNames,
} from "@/lib/seo";

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: Product | null;
  initialBarcode?: string | null;
  initialQrCode?: string | null;
  returnUrl?: string | null;
  onSaved?: (product: Product) => void;
}

function updateNotesWithCategory(notes: string | undefined, categoryName: string): string {
  const current = (notes || "").trim();
  if (!categoryName || !categoryName.trim()) {
    let updated = current.replace(/\|?\s*الفئة:\s*[^|\n]+/g, "").trim();
    if (updated.startsWith("|")) updated = updated.slice(1).trim();
    if (updated.endsWith("|")) updated = updated.slice(0, -1).trim();
    return updated;
  }
  const normalizedCat = isUniversalCategory(categoryName)
    ? ALL_CATEGORIES_LABEL
    : splitCategoryNames(categoryName).join(" ، ");
  const tag = `الفئة: ${normalizedCat}`;
  if (current.includes("الفئة:")) {
    return current.replace(/الفئة:\s*[^|\n]+/g, tag);
  }
  if (!current) return tag;
  return `${current} | ${tag}`;
}

export default function ProductModal({
  isOpen,
  onClose,
  product,
  initialBarcode,
  initialQrCode,
  returnUrl,
  onSaved,
}: ProductModalProps) {
  const router = useRouter();
  const { suppliers, categories, products, addProduct, updateProduct, addSupplier, addCategory } = useData();
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const comboRef = useRef<HTMLDivElement>(null);
  const categoryInputRef = useRef<HTMLInputElement>(null);
  const initializedProductKeyRef = useRef<string | null>(null);

  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [wholesalePrice, setWholesalePrice] = useState("");
  const [profitMargin, setProfitMargin] = useState("");
  const [retailPrice, setRetailPrice] = useState("");
  const [stock, setStock] = useState("");
  const [batchStock, setBatchStock] = useState("");
  const [batchManuallyEdited, setBatchManuallyEdited] = useState(false);
  const [incomingBatchQty, setIncomingBatchQty] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  // Barcode & QR Code fields
  const [barcode, setBarcode] = useState<string>("");
  const [qrCode, setQrCode] = useState<string>("");

  // Camera & Scanner State for Barcode & QR input fields
  const [activeScannerField, setActiveScannerField] = useState<"barcode" | "qrCode" | null>(null);

  // Multi-Category & Universal Category State (decoupled from search query)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isAllCategoriesSelected, setIsAllCategoriesSelected] = useState<boolean>(false);
  const [categoryQuery, setCategoryQuery] = useState("");
  const [isComboOpen, setIsComboOpen] = useState(false);

  const [newSupplierName, setNewSupplierName] = useState("");
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // تهيئة بيانات النافذة مرة واحدة فقط عند فتحها أو تغير معرّف المنتج لمنع تحديثات الخلفية من مسح تعديلات المستخدم
  useEffect(() => {
    if (!isOpen) {
      initializedProductKeyRef.current = null;
      setIsComboOpen(false);
      return;
    }

    const currentKey = product ? `edit-${product.id}` : `new-${initialBarcode || ""}-${initialQrCode || ""}`;
    if (initializedProductKeyRef.current === currentKey) {
      return;
    }
    initializedProductKeyRef.current = currentKey;

    setError("");
    setSubmitting(false);
    setIncomingBatchQty("");
    setIsComboOpen(false);
    setCategoryQuery("");

    if (product) {
      setName(product.name);
      setImage(product.image);
      setCostPrice(product.costPrice.toString());
      setWholesalePrice(product.wholesalePrice.toString());
      setProfitMargin(product.profitMargin.toString());
      setRetailPrice(product.retailPrice.toString());
      setStock(product.stock.toString());
      const initialBatch = Math.max(product.batchStock ?? product.stock ?? 0, product.stock ?? 0);
      setBatchStock(initialBatch.toString());
      setBatchManuallyEdited(true);
      setSupplierId(product.supplierId);
      setNotes(product.notes);
      setBarcode(product.barcode || initialBarcode || "");
      setQrCode(product.qrCode || initialQrCode || "");

      const isUniversal = isProductInAllCategories(product);
      if (isUniversal) {
        setIsAllCategoriesSelected(true);
        setSelectedCategories([]);
      } else {
        setIsAllCategoriesSelected(false);
        const extractedCats = extractCategoriesFromProduct(product).filter(
          (c) => !isUniversalCategory(c)
        );
        setSelectedCategories(extractedCats);
      }

      setShowNewSupplier(false);
      setNewSupplierName("");
    } else {
      setName("");
      setImage("");
      setCostPrice("");
      setWholesalePrice("");
      setProfitMargin("");
      setRetailPrice("");
      setStock("");
      setBatchStock("");
      setBatchManuallyEdited(false);
      setSupplierId("");
      setNotes("");
      setSelectedCategories([]);
      setIsAllCategoriesSelected(false);
      setCategoryQuery("");
      setShowNewSupplier(false);
      setNewSupplierName("");
      setBarcode(initialBarcode || "");
      setQrCode(initialQrCode || "");
    }
  }, [isOpen, product, initialBarcode, initialQrCode]);

  // إذا تم تحميل صورة المنتج الكسولة في الخلفية أثناء فتح النافذة ولم يقم المستخدم بتغيير الصورة بعد
  useEffect(() => {
    if (isOpen && product?.image && !image) {
      setImage(product.image);
    }
  }, [isOpen, product?.image, image]);

  // Handle outside click for Category Combobox dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (comboRef.current && !comboRef.current.contains(event.target as Node)) {
        setIsComboOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

    for (const cat of categories) {
      if (isUniversalCategory(cat.name)) continue;
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

    for (const p of products) {
      if (p.notes && p.notes.includes("الفئة:")) {
        const pName = p.name.toLowerCase();
        if (q.includes(pName) || pName.includes(q)) {
          const match = p.notes.match(/الفئة:\s*([^|\n]+)/);
          if (match && match[1]) {
            const firstCandidate = splitCategoryNames(match[1])[0];
            if (!firstCandidate || isUniversalCategory(firstCandidate)) continue;
            const foundCat = categories.find((c) => c.name.toLowerCase() === firstCandidate.toLowerCase());
            if (foundCat) return foundCat.name;
          }
        }
      }
    }

    return null;
  }, [name, categories, products]);

  // Filtered categories for combobox — shows ALL categories immediately when categoryQuery is empty
  const filteredCategories = useMemo(() => {
    const baseList = categories.filter((c) => !isUniversalCategory(c.name));
    const q = categoryQuery.trim().toLowerCase();
    if (!q || isUniversalCategory(q)) return baseList;
    return baseList.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.keywords && c.keywords.toLowerCase().includes(q))
    );
  }, [categories, categoryQuery]);

  // Check if typed query matches an existing category name or Universal Category
  const exactCategoryMatch = useMemo(() => {
    if (!categoryQuery.trim()) return null;
    if (isUniversalCategory(categoryQuery.trim())) {
      return { id: "universal-all", name: ALL_CATEGORIES_LABEL, priority: 0, isActive: true, image: "" };
    }
    return categories.find((c) => c.name.trim().toLowerCase() === categoryQuery.trim().toLowerCase());
  }, [categories, categoryQuery]);

  // التبديل الفوري لزر "جميع الاقسام": إذا كان مفعلاً مسبقاً يتم إلغاء التعميم وفتح قائمة الأقسام فوراً لاختيار قسم بديل
  const handleToggleUniversalCategory = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isAllCategoriesSelected) {
      setIsAllCategoriesSelected(false);
      setCategoryQuery("");
      const fallbackTag = selectedCategories.join(" ، ");
      setNotes((prev) => updateNotesWithCategory(prev, fallbackTag));
      setIsComboOpen(true);
      setTimeout(() => {
        categoryInputRef.current?.focus();
      }, 20);
    } else {
      setIsAllCategoriesSelected(true);
      setSelectedCategories([]);
      setCategoryQuery("");
      setNotes((prev) => updateNotesWithCategory(prev, ALL_CATEGORIES_LABEL));
      setIsComboOpen(false);
    }
  };

  // إضافة أو إزالة قسم عادي (يدعم اختيار قسم واحد أو عدة أقسام للمنتج بمرونة كاملة)
  const handleToggleRegularCategory = (catName: string, closeDropdown = false) => {
    const trimmed = catName.trim();
    if (!trimmed) return;

    if (isUniversalCategory(trimmed)) {
      setIsAllCategoriesSelected(true);
      setSelectedCategories([]);
      setCategoryQuery("");
      setNotes((prev) => updateNotesWithCategory(prev, ALL_CATEGORIES_LABEL));
      setIsComboOpen(false);
      return;
    }

    setIsAllCategoriesSelected(false);
    setCategoryQuery("");

    setSelectedCategories((prev) => {
      const exists = prev.some((c) => c.toLowerCase() === trimmed.toLowerCase());
      const next = exists
        ? prev.filter((c) => c.toLowerCase() !== trimmed.toLowerCase())
        : [...prev, trimmed];
      setNotes((prevNotes) => updateNotesWithCategory(prevNotes, next.join(" ، ")));
      return next;
    });

    if (closeDropdown) {
      setIsComboOpen(false);
    }
  };

  const handleRemoveCategoryChip = (catName: string) => {
    setSelectedCategories((prev) => {
      const next = prev.filter((c) => c.toLowerCase() !== catName.toLowerCase());
      setNotes((prevNotes) => updateNotesWithCategory(prevNotes, next.join(" ، ")));
      return next;
    });
  };

  const handleClearAllCategories = () => {
    setIsAllCategoriesSelected(false);
    setSelectedCategories([]);
    setCategoryQuery("");
    setNotes((prev) => updateNotesWithCategory(prev, ""));
    setIsComboOpen(true);
    setTimeout(() => {
      categoryInputRef.current?.focus();
    }, 20);
  };

  const handleCreateNewCategory = async (catNameToCreate: string) => {
    const trimmed = catNameToCreate.trim();
    if (!trimmed) return;
    if (isUniversalCategory(trimmed)) {
      handleToggleRegularCategory(ALL_CATEGORIES_LABEL, true);
      return;
    }
    try {
      const created = await addCategory({
        name: trimmed,
        image: "",
        priority: categories.length + 1,
        isActive: true,
      });
      setIsAllCategoriesSelected(false);
      setCategoryQuery("");
      setSelectedCategories((prev) => {
        const exists = prev.some((c) => c.toLowerCase() === created.name.toLowerCase());
        const next = exists ? prev : [...prev, created.name];
        setNotes((prevNotes) => updateNotesWithCategory(prevNotes, next.join(" ، ")));
        return next;
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "تعذر إضافة القسم الجديد";
      alert(msg);
    }
  };

  const handleApplySuggestedCategory = (catName: string) => {
    handleToggleRegularCategory(catName, false);
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

      // معالجة الأقسام المحددة أو المكتوبة في حقل البحث
      let finalIsAll = isAllCategoriesSelected;
      let finalCategoriesList = [...selectedCategories];
      const typedQuery = categoryQuery.trim();

      if (typedQuery) {
        if (isUniversalCategory(typedQuery)) {
          finalIsAll = true;
          finalCategoriesList = [];
        } else {
          finalIsAll = false;
          const typedParts = splitCategoryNames(typedQuery);
          for (const part of typedParts) {
            const match = categories.find((c) => c.name.trim().toLowerCase() === part.toLowerCase());
            if (match) {
              if (!finalCategoriesList.some((c) => c.toLowerCase() === match.name.toLowerCase())) {
                finalCategoriesList.push(match.name);
              }
            } else {
              const created = await addCategory({
                name: part,
                image: "",
                priority: categories.length + 1,
                isActive: true,
              });
              if (!finalCategoriesList.some((c) => c.toLowerCase() === created.name.toLowerCase())) {
                finalCategoriesList.push(created.name);
              }
            }
          }
        }
      }

      let finalCategoryName = "";
      let resolvedCategoryId: string | null = null;

      if (finalIsAll) {
        finalCategoryName = ALL_CATEGORIES_LABEL;
        resolvedCategoryId = null;
      } else if (finalCategoriesList.length > 0) {
        finalCategoryName = finalCategoriesList.join(" ، ");
        const primaryCat = categories.find(
          (c) => c.name.trim().toLowerCase() === finalCategoriesList[0].toLowerCase()
        );
        resolvedCategoryId = primaryCat ? primaryCat.id : null;
      }

      const finalNotes = updateNotesWithCategory(notes, finalCategoryName);

      const parsedStock = Math.max(0, parseInt(stock) || 0);
      const parsedBatch = Math.max(parsedStock, parseInt(batchStock) || parsedStock);

      const data = {
        name: name.trim(),
        image,
        costPrice: parseFloat(costPrice) || 0,
        wholesalePrice: parseFloat(wholesalePrice) || 0,
        profitMargin: parseFloat(profitMargin) || 0,
        retailPrice: parseFloat(retailPrice) || 0,
        stock: parsedStock,
        batchStock: parsedBatch,
        supplierId: finalSupplierId,
        notes: finalNotes,
        categoryName: finalCategoryName || null,
        categoryId: resolvedCategoryId,
        isAllCategories: finalIsAll,
        barcode: barcode.trim() || null,
        qrCode: qrCode.trim() || null,
      };

      if (product) {
        await updateProduct(product.id, data);
        if (onSaved) onSaved({ ...product, ...data });
      } else {
        const created = await addProduct(data);
        if (onSaved && created) onSaved(created);
      }

      if (returnUrl) {
        router.replace(returnUrl);
      } else {
        onClose();
      }
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
          {/* Smart Return Navigation Banner */}
          {returnUrl && (
            <div className="bg-gradient-to-r from-purple-900/30 to-indigo-900/30 border border-purple-500/40 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-lg">🏷️</span>
                <div>
                  <span className="font-extrabold text-purple-800 dark:text-purple-200">سياق نشط: استوديو الملصقات الحرارية</span>
                  <p className="text-[11px] text-purple-700 dark:text-purple-300">
                    عند الضغط على "حفظ"، سيتم إرجاعك تلقائياً وبشكل فوري إلى استوديو الملصقات مع تحديث سعر المفرد والبيانات.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.replace(returnUrl)}
                className="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-xs font-bold transition-all whitespace-nowrap"
              >
                العودة للاستوديو ↩
              </button>
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-medium">
              ⚠️ {error}
            </div>
          )}

          {/* Image Upload with Dual Options */}
          <div className="flex flex-col items-center gap-3 bg-gray-50 dark:bg-gray-800/40 p-4 rounded-2xl border border-gray-200 dark:border-gray-700/60">
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300">صورة المنتج</label>
            <div className="w-32 h-32 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 overflow-hidden relative group bg-white dark:bg-gray-900 flex items-center justify-center">
              {image ? (
                <>
                  <img src={image} alt="Product" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 p-1">
                    <button
                      type="button"
                      onClick={() => cameraRef.current?.click()}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-[11px] font-bold"
                    >
                      📷 كاميرا
                    </button>
                    <button
                      type="button"
                      onClick={() => galleryRef.current?.click()}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded text-[11px] font-bold"
                    >
                      📁 معرض
                    </button>
                    <button
                      type="button"
                      onClick={() => setImage("")}
                      className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-[11px] font-bold"
                    >
                      🗑️
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 gap-1 text-center p-2">
                  <span className="text-3xl">🖼️</span>
                  <span className="text-[11px] font-bold">لم تدرج صورة</span>
                </div>
              )}
            </div>

            {/* Dual Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm"
              >
                <span>📷</span>
                <span>التقاط بالكاميرا</span>
              </button>
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm"
              >
                <span>📁</span>
                <span>اختر من المعرض</span>
              </button>
            </div>

            <input ref={galleryRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleImageUpload} className="hidden" />
          </div>

          {/* Name & Auto-Suggest */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">اسم المنتج *</label>
            <input
              type="text" required value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none font-medium"
              placeholder="مثال: دلاية، محمل كرات، بطارية، فلتر زيت..."
            />

            {/* Smart Category Auto-Suggestion Badge */}
            {suggestedCategory &&
              !isAllCategoriesSelected &&
              !selectedCategories.some((c) => c.toLowerCase() === suggestedCategory.toLowerCase()) && (
              <div className="mt-2 p-2.5 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-xl flex items-center justify-between animate-fadeIn">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-800 dark:text-blue-300">
                  <span>💡</span>
                  <span>يقترح النظام إضافة هذا المنتج إلى قسم: <strong>"{suggestedCategory}"</strong></span>
                </div>
                <button
                  type="button"
                  onClick={() => handleApplySuggestedCategory(suggestedCategory)}
                  className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm"
                >
                  + إضافة القسم المقترح ⚡
                </button>
              </div>
            )}
          </div>

          {/* Multi-Category & Universal Category Combobox */}
          <div ref={comboRef} className="relative space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-bold text-gray-700 dark:text-gray-300">
                📁 القسم / التصنيف (يمكنك اختيار قسم واحد أو عدة أقسام للمنتج)
              </label>
              {(isAllCategoriesSelected || selectedCategories.length > 0) && (
                <button
                  type="button"
                  onClick={handleClearAllCategories}
                  className="text-[11px] font-extrabold text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>✕</span>
                  <span>إلغاء تحديد الأقسام وفتح القائمة</span>
                </button>
              )}
            </div>

            {/* Standalone One-Click "جميع الاقسام" Toggle Button */}
            <button
              type="button"
              onClick={handleToggleUniversalCategory}
              className={`w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-extrabold transition-all duration-200 flex items-center justify-between gap-2 active:scale-[0.99] cursor-pointer ${
                isAllCategoriesSelected
                  ? "bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white border-purple-400 shadow-lg shadow-purple-600/25 ring-2 ring-purple-400/40"
                  : "bg-purple-50/90 dark:bg-[#1e113b] hover:bg-purple-100 dark:hover:bg-purple-900/60 text-purple-900 dark:text-purple-100 border-purple-300 dark:border-purple-500/40 shadow-sm"
              }`}
            >
              <div className="flex items-center gap-2 text-right">
                <span className="text-base sm:text-lg leading-none">🌐</span>
                <div className="flex flex-col sm:flex-row sm:items-center sm:gap-1.5">
                  <span className="font-black tracking-wide">{ALL_CATEGORIES_LABEL}</span>
                  <span
                    className={`text-[10px] sm:text-xs font-semibold ${
                      isAllCategoriesSelected
                        ? "text-purple-100"
                        : "text-purple-600 dark:text-purple-300/80"
                    }`}
                  >
                    {isAllCategoriesSelected
                      ? "(انقر هنا لإلغاء التعميم وفتح قائمة الأقسام لاختيار قسم مخصص)"
                      : "(إظهار هذا المنتج تلقائياً في كافة أقسام المتجر)"}
                  </span>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-lg text-[11px] font-black whitespace-nowrap transition-colors ${
                  isAllCategoriesSelected
                    ? "bg-white/20 hover:bg-white/30 text-white border border-white/30"
                    : "bg-purple-600 text-white hover:bg-purple-500 shadow-xs"
                }`}
              >
                {isAllCategoriesSelected ? "✓ مفعل للكل (انقر للتغيير)" : "تحديد بنقرة ⚡"}
              </span>
            </button>

            {/* Selected Categories Interactive Chips */}
            {selectedCategories.length > 0 && !isAllCategoriesSelected && (
              <div className="flex flex-wrap items-center gap-1.5 p-2.5 rounded-xl bg-purple-50/60 dark:bg-[#1a0f36] border border-purple-200/80 dark:border-purple-500/30">
                <span className="text-[11px] font-extrabold text-purple-800 dark:text-purple-300 ml-1">
                  الأقسام المحددة ({selectedCategories.length}):
                </span>
                {selectedCategories.map((cat) => (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-extrabold bg-purple-600 text-white shadow-xs"
                  >
                    <span>📁 {cat}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveCategoryChip(cat);
                      }}
                      className="hover:bg-white/20 rounded-full w-4 h-4 inline-flex items-center justify-center text-[10px] font-black transition-colors cursor-pointer"
                      title={`إزالة قسم ${cat}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Search / Filter / Add Input */}
            <div className="relative">
              <input
                ref={categoryInputRef}
                type="text"
                value={categoryQuery}
                onChange={(e) => {
                  setCategoryQuery(e.target.value);
                  setIsComboOpen(true);
                }}
                onFocus={() => setIsComboOpen(true)}
                onClick={() => setIsComboOpen(true)}
                className={`w-full px-4 py-2.5 pl-24 border rounded-xl bg-white dark:bg-[#1e113b] text-gray-900 dark:text-gray-100 font-bold text-sm focus:ring-2 outline-none transition-all ${
                  isAllCategoriesSelected || selectedCategories.length > 0
                    ? "border-purple-500 dark:border-purple-500/70 focus:ring-purple-500"
                    : "border-gray-300 dark:border-gray-600 focus:ring-purple-500"
                }`}
                placeholder={
                  isAllCategoriesSelected
                    ? "انقر لاختيار قسم مخصص بدلاً من جميع الأقسام..."
                    : selectedCategories.length > 0
                    ? "أضف قسماً آخر للمنتج أو ابحث في الأقسام..."
                    : "اختر قسماً أو أكثر من القائمة، أو اكتب اسم قسم جديد..."
                }
              />

              <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {categoryQuery && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCategoryQuery("");
                      categoryInputRef.current?.focus();
                    }}
                    className="px-2 py-1 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xs font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsComboOpen((prev) => !prev);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-200 hover:bg-purple-200 dark:hover:bg-purple-800 text-[11px] font-extrabold transition-colors cursor-pointer"
                >
                  {isComboOpen ? "إغلاق ▲" : "الأقسام ▼"}
                </button>
              </div>
            </div>

            {/* Interactive Dropdown Menu — Shows ALL categories immediately without needing to clear text */}
            {isComboOpen && (
              <div className="absolute top-full right-0 left-0 mt-1 bg-white dark:bg-[#180e35] border border-purple-300 dark:border-purple-500/50 rounded-xl shadow-2xl z-50 max-h-68 overflow-y-auto divide-y divide-gray-100 dark:divide-purple-800/40 animate-fadeIn">
                {/* Sticky Header inside Dropdown for Multi-Select convenience */}
                <div className="sticky top-0 z-10 bg-purple-50/95 dark:bg-[#1e113b]/95 backdrop-blur-xs px-3 py-2 flex items-center justify-between text-[11px] font-extrabold text-purple-900 dark:text-purple-200 border-b border-purple-200 dark:border-purple-700/60">
                  <span>
                    💡 انقر على أي قسم لإضافته أو إزالته (يدعم اختيار عدة أقسام معاً)
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsComboOpen(false);
                    }}
                    className="px-2.5 py-0.5 rounded-md bg-purple-600 hover:bg-purple-500 text-white font-black cursor-pointer"
                  >
                    تم ✓
                  </button>
                </div>

                {/* Pinned Universal Option inside Dropdown */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleUniversalCategory();
                  }}
                  className={`w-full p-3 text-xs font-extrabold cursor-pointer transition-all flex items-center justify-between text-right ${
                    isAllCategoriesSelected
                      ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white"
                      : "bg-purple-50/70 dark:bg-purple-950/60 hover:bg-purple-100 dark:hover:bg-purple-900/70 text-purple-900 dark:text-purple-200"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🌐</span>
                    <span>{ALL_CATEGORIES_LABEL}</span>
                    <span
                      className={`text-[10px] font-semibold ${
                        isAllCategoriesSelected
                          ? "text-purple-100"
                          : "text-purple-600 dark:text-purple-300/80"
                      }`}
                    >
                      — شامل لجميع أقسام المتجر
                    </span>
                  </div>
                  {isAllCategoriesSelected ? (
                    <span className="font-black text-white bg-white/20 px-2 py-0.5 rounded-md">
                      ✓ مفعل (انقر لإلغائه)
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-200/70 dark:bg-purple-800/60 text-purple-800 dark:text-purple-200">
                      شامل
                    </span>
                  )}
                </button>

                {filteredCategories.length > 0 ? (
                  filteredCategories.map((c) => {
                    const isSelected =
                      !isAllCategoriesSelected &&
                      selectedCategories.some((sc) => sc.toLowerCase() === c.name.trim().toLowerCase());
                    return (
                      <button
                        type="button"
                        key={c.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleRegularCategory(c.name, false);
                        }}
                        className={`w-full p-3 text-xs font-bold cursor-pointer transition-colors flex items-center justify-between text-right hover:bg-purple-50 dark:hover:bg-purple-900/40 ${
                          isSelected
                            ? "bg-purple-100/80 dark:bg-purple-900/50 text-purple-900 dark:text-white"
                            : "text-gray-800 dark:text-gray-200"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`w-4 h-4 rounded flex items-center justify-center border text-[10px] font-black transition-colors ${
                              isSelected
                                ? "bg-purple-600 border-purple-500 text-white"
                                : "border-gray-300 dark:border-purple-500/50 bg-white dark:bg-[#1e113b]"
                            }`}
                          >
                            {isSelected ? "✓" : ""}
                          </span>
                          <span>📁</span>
                          <span>{c.name}</span>
                        </div>
                        {isSelected ? (
                          <span className="text-purple-700 dark:text-purple-300 font-extrabold text-[11px] bg-purple-200/70 dark:bg-purple-800/70 px-2 py-0.5 rounded-md">
                            ✓ مضاف للمنتج
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-purple-400/70 text-[11px] font-semibold">
                            + اختيار القسم
                          </span>
                        )}
                      </button>
                    );
                  })
                ) : (
                  !isUniversalCategory(categoryQuery.trim()) && (
                    <div className="p-3 text-xs text-gray-400 text-center">
                      لا يوجد قسم فرعي مطابق لـ "{categoryQuery}"
                    </div>
                  )
                )}

                {/* Creatable Option if query does not match an existing category */}
                {categoryQuery.trim() && !exactCategoryMatch && !isUniversalCategory(categoryQuery.trim()) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCreateNewCategory(categoryQuery);
                    }}
                    className="w-full p-3 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/40 dark:to-indigo-900/40 hover:from-purple-100 hover:to-indigo-100 text-purple-700 dark:text-purple-200 font-bold text-xs cursor-pointer flex items-center gap-2 transition-colors border-t border-purple-200 dark:border-purple-800 text-right"
                  >
                    <span className="text-base">✨</span>
                    <span>+ إنشاء وإضافة قسم جديد باسم <strong>"{categoryQuery.trim()}"</strong></span>
                  </button>
                )}
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

          {/* Advanced Quantity & Import / Batch Tracking */}
          <div className="p-4 rounded-2xl bg-purple-50/50 dark:bg-[#160b2e] border border-purple-200/80 dark:border-purple-500/30 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-gray-900 dark:text-white">
                  إدارة الكمية المتوفرة وإجمالي وجبة الاستيراد
                </h3>
                <p className="text-[11px] text-gray-500 dark:text-purple-300/75 mt-0.5">
                  تُحسب نسبة توفر المخزون بناءً على الكمية المتوفرة حالياً مقسومة على إجمالي كمية الوجبة المستوردة
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const currentS = Math.max(0, parseInt(stock) || 0);
                    setBatchStock(currentS.toString());
                    setBatchManuallyEdited(true);
                  }}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-200 hover:bg-purple-200 dark:hover:bg-purple-800/70 transition-colors cursor-pointer whitespace-nowrap"
                  title="جعل إجمالي الوجبة مساوياً للكمية المتوفرة حالياً (100%)"
                >
                  مساواة الوجبة بالمتوفر
                </button>
                <button
                  type="button"
                  onClick={() => setStock("0")}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/70 transition-colors cursor-pointer whitespace-nowrap"
                  title="تصفير الكمية المتوفرة لإظهار المنتج كنافد من المخزون"
                >
                  تصفير الكمية
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-gray-200 block mb-1.5">
                  الكمية المتوفرة حالياً بالمخزن *
                </label>
                <input
                  type="number"
                  min="0"
                  value={stock}
                  onChange={(e) => {
                    const val = e.target.value;
                    setStock(val);
                    const num = parseInt(val) || 0;
                    const curBatch = parseInt(batchStock) || 0;
                    if (!batchManuallyEdited || num > curBatch) {
                      setBatchStock(val);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 border border-purple-300 dark:border-purple-600/50 rounded-xl bg-white dark:bg-[#1f113d] text-gray-900 dark:text-white font-extrabold tabular-nums focus:ring-2 focus:ring-purple-500 outline-none"
                  placeholder="0"
                />
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                  عند الوصول إلى 0 يُحاط المنتج بإطار أحمر تلقائياً
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-gray-200 block mb-1.5">
                  إجمالي كمية الاستيراد / الوجبة الكلية
                </label>
                <input
                  type="number"
                  min="0"
                  value={batchStock}
                  onChange={(e) => {
                    setBatchStock(e.target.value);
                    setBatchManuallyEdited(true);
                  }}
                  className="w-full px-3.5 py-2.5 border border-purple-300 dark:border-purple-600/50 rounded-xl bg-white dark:bg-[#1f113d] text-gray-900 dark:text-white font-extrabold tabular-nums focus:ring-2 focus:ring-purple-500 outline-none"
                  placeholder="مثال: 100"
                />
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                  العدد الكلي للوجبة لحساب النسبة المئوية المتبقية بدقة
                </p>
              </div>
            </div>

            {/* Quick Add Incoming Import Batch Tool */}
            <div className="p-3 rounded-xl bg-white/80 dark:bg-[#1f123b]/90 border border-purple-200/60 dark:border-purple-700/40 space-y-2">
              <label className="text-xs font-bold text-purple-900 dark:text-purple-200 block">
                إضافة وجبة استيراد واردة جديدة (تحديث سريع للكمية):
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="number"
                  min="1"
                  value={incomingBatchQty}
                  onChange={(e) => setIncomingBatchQty(e.target.value)}
                  placeholder="أدخل عدد القطع الواردة بالوجبة الجديدة..."
                  className="flex-1 px-3 py-2 border border-purple-200 dark:border-purple-600/50 rounded-xl bg-gray-50 dark:bg-[#140a28] text-gray-900 dark:text-white text-xs font-bold tabular-nums focus:ring-2 focus:ring-purple-500 outline-none"
                />
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={!incomingBatchQty || (parseInt(incomingBatchQty) || 0) <= 0}
                    onClick={() => {
                      const addQty = Math.max(0, parseInt(incomingBatchQty) || 0);
                      if (addQty <= 0) return;
                      const curStock = Math.max(0, parseInt(stock) || 0);
                      const curBatch = Math.max(curStock, parseInt(batchStock) || 0);
                      const newStock = curStock + addQty;
                      const newBatch = curBatch + addQty;
                      setStock(newStock.toString());
                      setBatchStock(newBatch.toString());
                      setBatchManuallyEdited(true);
                      setIncomingBatchQty("");
                    }}
                    className="flex-1 sm:flex-initial px-3 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap"
                  >
                    + جمع مع المخزون والوجبة
                  </button>
                  <button
                    type="button"
                    disabled={!incomingBatchQty || (parseInt(incomingBatchQty) || 0) <= 0}
                    onClick={() => {
                      const addQty = Math.max(0, parseInt(incomingBatchQty) || 0);
                      if (addQty <= 0) return;
                      const curStock = Math.max(0, parseInt(stock) || 0);
                      const newTotal = curStock + addQty;
                      setStock(newTotal.toString());
                      setBatchStock(newTotal.toString());
                      setBatchManuallyEdited(true);
                      setIncomingBatchQty("");
                    }}
                    className="flex-1 sm:flex-initial px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap"
                    title="إضافة الكمية للمتوفر واعتماد المجموع الجديد كوجبة قياسية بنسبة 100%"
                  >
                    اعتماد كوجبة كاملة (100%)
                  </button>
                </div>
              </div>
            </div>

            {/* Live Stock Ratio & Status Indicator */}
            {(() => {
              const curStock = Math.max(0, parseInt(stock) || 0);
              const curBatch = Math.max(curStock, parseInt(batchStock) || 0);
              const ratioPct = curBatch > 0 ? Math.round((curStock / curBatch) * 100) : 0;
              const isZero = curStock <= 0;
              const barColor = isZero
                ? "#ef4444"
                : ratioPct >= 75
                ? "#10b981"
                : ratioPct >= 40
                ? "#f59e0b"
                : "#ef4444";
              const statusText = isZero
                ? "نفدت الكمية (إطار أحمر)"
                : ratioPct >= 75
                ? "مخزون ممتاز"
                : ratioPct >= 40
                ? "مخزون متوسط"
                : "مخزون منخفض";

              return (
                <div className="pt-1 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold tabular-nums">
                    <span className="text-gray-700 dark:text-purple-200">
                      المتوفر: <strong>{curStock}</strong> من أصل <strong>{curBatch}</strong> قطعة
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold ${
                        isZero
                          ? "bg-red-100 text-red-700 dark:bg-red-950/80 dark:text-red-300 border border-red-400/40"
                          : ratioPct >= 75
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300"
                          : ratioPct >= 40
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300"
                          : "bg-red-100 text-red-700 dark:bg-red-950/80 dark:text-red-300"
                      }`}
                    >
                      {statusText} • {ratioPct}%
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-purple-950 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-200"
                      style={{
                        width: `${isZero ? 100 : Math.min(100, ratioPct)}%`,
                        backgroundColor: barColor,
                        opacity: isZero ? 0.35 : 1,
                      }}
                    />
                  </div>
                </div>
              );
            })()}
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

          {/* Barcode & QR Code Fields with Interactive Camera Triggers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
            {/* Barcode Input */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-extrabold text-gray-700 dark:text-gray-300 flex items-center gap-1">
                  <span>الباركود (EAN-13)</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const randomSeq = Math.floor(100000 + Math.random() * 900000);
                    setBarcode(generateEAN13(randomSeq));
                  }}
                  className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  <span>⚡ توليد تلقائي</span>
                </button>
              </div>

              <div className="relative flex items-center">
                <input
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="أدخل الباركود أو امسحه..."
                  className="w-full pl-20 pr-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm font-bold"
                />

                <div className="absolute left-1.5 flex items-center gap-1">
                  {barcode && (
                    <button
                      type="button"
                      onClick={() => setBarcode("")}
                      className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs"
                      title="مسح"
                    >
                      ✕
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveScannerField("barcode")}
                    className="p-1.5 bg-blue-50 dark:bg-blue-900/50 hover:bg-blue-100 dark:hover:bg-blue-800 text-blue-600 dark:text-blue-300 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 border border-blue-200 dark:border-blue-700"
                    title="فتح كاميرا المسح الضوئي"
                  >
                    <span>📷</span>
                  </button>
                </div>
              </div>
            </div>

            {/* QR Code Input */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-extrabold text-gray-700 dark:text-gray-300 flex items-center gap-1">
                  <span>رمز الـ QR</span>
                </label>
              </div>

              <div className="relative flex items-center">
                <input
                  type="text"
                  value={qrCode}
                  onChange={(e) => setQrCode(e.target.value)}
                  placeholder="أدخل رمز הـ QR..."
                  className="w-full pl-20 pr-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm font-bold"
                />

                <div className="absolute left-1.5 flex items-center gap-1">
                  {qrCode && (
                    <button
                      type="button"
                      onClick={() => setQrCode("")}
                      className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs"
                      title="مسح"
                    >
                      ✕
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveScannerField("qrCode")}
                    className="p-1.5 bg-indigo-50 dark:bg-indigo-900/50 hover:bg-indigo-100 dark:hover:bg-indigo-800 text-indigo-600 dark:text-indigo-300 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 border border-indigo-200 dark:border-indigo-700"
                    title="فتح كاميرا مسح QR"
                  >
                    <span>📱</span>
                  </button>
                </div>
              </div>
            </div>

            {(barcode || qrCode) && (
              <div className="sm:col-span-2 flex justify-center pt-2">
                <BarcodeDisplay barcode={barcode} qrCode={qrCode} productName={name} compact />
              </div>
            )}
          </div>

          {/* Dedicated Barcode Scanner Modal for Field Scanning */}
          <BarcodeScanner
            isOpen={activeScannerField !== null}
            onClose={() => setActiveScannerField(null)}
            onScan={(scanned) => {
              if (activeScannerField === "barcode") {
                setBarcode(scanned);
              } else if (activeScannerField === "qrCode") {
                setQrCode(scanned);
              }
              setActiveScannerField(null);
            }}
            canUseCamera={true}
            canUseImageUpload={true}
            canUseManualEntry={true}
          />

          {/* Notes */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">ملاحظات إضافية</label>
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
              className="flex-1 py-2.5 text-sm font-bold text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-md"
              style={{ backgroundColor: "var(--primary)" }}
            >
              {submitting ? (
                "جاري الحفظ..."
              ) : returnUrl ? (
                <>
                  <span>💾</span>
                  <span>حفظ والعودة إلى استوديو الملصقات</span>
                </>
              ) : product ? (
                "حفظ التعديلات"
              ) : (
                "حفظ المنتج"
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                if (returnUrl) {
                  router.replace(returnUrl);
                } else {
                  onClose();
                }
              }}
              className="px-6 py-2.5 text-sm font-bold text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {returnUrl ? "إلغاء والعودة" : "إلغاء"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

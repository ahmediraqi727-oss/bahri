"use client";

import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { useData } from "@/lib/data-context";
import { useSettings } from "@/lib/settings-context";
import { useActivityLog } from "@/lib/activity-log";
import { calculateRetailPrice, Product, CategoryItem, Supplier } from "@/lib/types";
import { supabase } from "@/lib/supabase-client";
import DuplicateResolutionModal, { DuplicateActionChoice } from "./DuplicateResolutionModal";

interface DuplicatePair {
  existing: Product;
  incoming: Partial<Product>;
}

export default function ImportExportBar() {
  const { products, suppliers, categories, addSupplier, importProducts, exportAllData, reloadAllData } = useData();
  const { settings } = useSettings();
  const { logActivity } = useActivityLog();
  const importRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);

  // Restore Duplicate Resolution State
  const [duplicateQueue, setDuplicateQueue] = useState<DuplicatePair[]>([]);
  const [currentDuplicateIndex, setCurrentDuplicateIndex] = useState<number>(0);
  const [newProductsToInsert, setNewProductsToInsert] = useState<Partial<Product>[]>([]);
  const [restorationStats, setRestorationStats] = useState({ updated: 0, inserted: 0, skipped: 0 });
  const [isRestoring, setIsRestoring] = useState(false);

  const getSupplierName = (id: string) => suppliers.find((s) => s.id === id)?.name || "—";

  // Excel/CSV Products Import
  const handleImportProducts = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const findVal = (row: Record<string, any>, keys: string[]): any => {
      for (const k of Object.keys(row)) {
        const cleanK = k.trim().toLowerCase();
        for (const key of keys) {
          if (cleanK === key.toLowerCase()) return row[k];
        }
      }
      for (const k of Object.keys(row)) {
        const cleanK = k.trim().toLowerCase();
        for (const key of keys) {
          if (cleanK.includes(key.toLowerCase())) return row[k];
        }
      }
      return undefined;
    };

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error("الملف فارغ أو غير صالح");
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

        if (!rows || rows.length === 0) {
          alert("لم يتم العثور على أي صفوف في الملف");
          return;
        }

        const supplierMap = new Map<string, string>();
        suppliers.forEach((s) => {
          supplierMap.set(s.id.toLowerCase(), s.id);
          supplierMap.set(s.name.trim().toLowerCase(), s.id);
        });

        const mapped = [];
        for (const row of rows) {
          const nameVal = findVal(row, ["name", "اسم المنتج", "الاسم", "اسم", "product"]);
          if (!nameVal) continue;

          const nameStr = String(nameVal).trim();
          if (!nameStr) continue;

          let costPrice = parseFloat(String(findVal(row, ["costprice", "cost_price", "cost", "سعر التكلفة", "التكلفة", "تكلفة"]) || 0)) || 0;
          const profitMargin = parseFloat(String(findVal(row, ["profitmargin", "profit_margin", "profit", "margin", "هامش الربح", "الربح", "نسبة الربح"]) || 0)) || 0;
          let wholesalePrice = parseFloat(String(findVal(row, ["wholesaleprice", "wholesale_price", "wholesale", "سعر الجملة", "الجملة", "جملة"]) || 0)) || 0;
          let retailPrice = parseFloat(String(findVal(row, ["retailprice", "retail_price", "retail", "price", "سعر المفرد", "المفرد", "السعر", "سعر البيع"]) || 0)) || 0;

          if (retailPrice === 0 && costPrice > 0 && profitMargin > 0) {
            retailPrice = calculateRetailPrice(costPrice, profitMargin);
          }
          if (costPrice === 0 && retailPrice > 0) costPrice = retailPrice;
          if (wholesalePrice === 0) wholesalePrice = retailPrice > 0 ? retailPrice : costPrice;

          const stock = parseInt(String(findVal(row, ["stock", "quantity", "qty", "count", "الكمية", "المخزون", "العدد"]) || 0)) || 0;
          const supplierVal = findVal(row, ["supplier", "supplierid", "supplier_id", "المورد", "اسم المورد", "مورد"]);
          const supplierPhone = String(findVal(row, ["معلومات اتصال المورد", "هاتف المورد", "رقم المورد", "تلفون المورد"]) || "");
          let supplierId = "";

          if (supplierVal) {
            const rawSup = String(supplierVal).trim();
            const lowerSup = rawSup.toLowerCase();
            if (supplierMap.has(lowerSup)) {
              supplierId = supplierMap.get(lowerSup)!;
            } else if (rawSup.length > 0) {
              try {
                const newSup = await addSupplier({
                  name: rawSup,
                  phone: supplierPhone,
                  email: "",
                  address: "",
                  notes: "أُضيف تلقائياً أثناء استيراد الملفات",
                });
                supplierId = newSup.id;
                supplierMap.set(lowerSup, newSup.id);
              } catch {
                supplierId = "";
              }
            }
          }

          const desc = String(findVal(row, ["notes", "note", "description", "ملاحظات", "تفاصيل", "الوصف", "الوصف التفصيلي"]) || "");
          const category = String(findVal(row, ["category", "الفئة", "فئة"]) || "");
          const notes = category && desc ? `الفئة: ${category} | ${desc}` : category || desc;
          const image = String(findVal(row, ["image", "img", "photo", "pic", "الصورة", "صورة", "رابط الصورة", "رابط صورة المنتج", "صورة المنتج", "product_image", "productimage"]) || "");

          mapped.push({
            name: nameStr,
            image,
            costPrice,
            wholesalePrice,
            profitMargin,
            retailPrice,
            stock,
            supplierId,
            notes,
          });
        }

        if (mapped.length === 0) {
          alert("لم نتمكن من التعرف على اسم المنتجات في الملف. يرجى التأكد من أن رأس العمود يحتوي على كلمة 'الاسم' أو 'name'.");
          return;
        }

        const count = await importProducts(mapped);
        await logActivity({
          user: settings.currentRole,
          action: "import",
          entity: "منتجات",
          details: `استيراد ${count} منتج مع الصور والمعلومات من ملف ${file.name}`,
        });
        alert(`🎉 تم استيراد ${count} منتج بنجاح مدمجة مع صورها وجميع معلوماتها!`);
      } catch (err: any) {
        console.error("Error importing products:", err);
        alert(`❌ حدث خطأ أثناء استيراد الملف: ${err?.message || err}`);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  // Excel Products Export
  const handleExportProducts = async () => {
    if (products.length === 0) {
      alert("لا توجد منتجات للتصدير");
      return;
    }
    const data = products.map((p) => ({
      "اسم المنتج": p.name,
      "رابط صورة المنتج": p.image || "",
      "سعر التكلفة": p.costPrice,
      "سعر الجملة": p.wholesalePrice,
      "نسبة الربح (%)": p.profitMargin,
      "سعر المفرد": p.retailPrice,
      "الكمية / المخزون": p.stock,
      "اسم المورد": getSupplierName(p.supplierId),
      "الوصف التفصيلي": p.notes,
      name: p.name,
      image: p.image || "",
      costPrice: p.costPrice,
      wholesalePrice: p.wholesalePrice,
      profitMargin: p.profitMargin,
      retailPrice: p.retailPrice,
      stock: p.stock,
      supplier: getSupplierName(p.supplierId),
      notes: p.notes,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, `products-catalog-${new Date().toISOString().slice(0, 10)}.xlsx`);
    await logActivity({
      user: settings.currentRole,
      action: "export",
      entity: "منتجات",
      details: `تصدير ${products.length} منتج شامل الصور والمعلومات الكاملة`,
    });
  };

  // Requirement 1: Full Backup Export (JSON Package)
  const handleFullBackup = async () => {
    const rawData = exportAllData();
    const backupPackage = {
      version: "2.0",
      exportDate: new Date().toISOString(),
      storeName: settings.siteName || "موقع أحمد بحري",
      totalProducts: rawData.products.length,
      totalCategories: rawData.categories.length,
      products: rawData.products,
      categories: rawData.categories,
      suppliers: rawData.suppliers,
    };

    const blob = new Blob([JSON.stringify(backupPackage, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `store_full_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    await logActivity({
      user: settings.currentRole,
      action: "export",
      entity: "نسخة احتياطية",
      details: `تصدير نسخة احتياطية كاملة (${rawData.products.length} منتج شامل التكاليف والصور والمخزون، ${rawData.categories.length} قسم)`,
    });
  };

  // Requirement 2: Restore Backup & Duplicate Resolution
  const handleRestoreBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        const backupProducts: Partial<Product>[] = parsed.products || parsed || [];
        const backupCategories: Partial<CategoryItem>[] = parsed.categories || [];
        const backupSuppliers: Partial<Supplier>[] = parsed.suppliers || [];

        if (!Array.isArray(backupProducts) || backupProducts.length === 0) {
          alert("❌ الملف المرفوع لا يحتوي على منتجات صالحة للاستعادة");
          return;
        }

        setIsRestoring(true);

        // 1. Auto-create/upsert missing categories & suppliers in Supabase
        if (backupCategories.length > 0) {
          const catRows = backupCategories.map((c) => ({
            name: c.name,
            image: c.image || "",
            priority: c.priority || 1,
            keywords: c.keywords || "",
          }));
          await supabase.from("categories").upsert(catRows, { onConflict: "name" });
        }

        if (backupSuppliers.length > 0) {
          const supRows = backupSuppliers.map((s) => ({
            name: s.name,
            phone: s.phone || "",
            email: s.email || "",
            address: s.address || "",
            notes: s.notes || "",
          }));
          await supabase.from("suppliers").upsert(supRows, { onConflict: "name" });
        }

        // 2. Separate backup products into non-duplicates vs duplicates
        const existingProductsMap = new Map<string, Product>();
        products.forEach((p) => {
          existingProductsMap.set(p.name.trim().toLowerCase(), p);
        });

        const duplicates: DuplicatePair[] = [];
        const nonDuplicates: Partial<Product>[] = [];

        for (const item of backupProducts) {
          if (!item.name || !item.name.trim()) continue;
          const key = item.name.trim().toLowerCase();
          const existing = existingProductsMap.get(key);

          if (existing) {
            duplicates.push({ existing, incoming: item });
          } else {
            nonDuplicates.push(item);
          }
        }

        // 3. Insert Non-duplicate products directly
        let insertedCount = 0;
        if (nonDuplicates.length > 0) {
          const rowsToInsert = nonDuplicates.map((p) => ({
            name: p.name!.trim(),
            image: p.image || "",
            cost_price: p.costPrice || p.retailPrice || 0,
            wholesale_price: p.wholesalePrice || p.retailPrice || 0,
            profit_margin: p.profitMargin || 0,
            retail_price: p.retailPrice || p.costPrice || 0,
            stock: p.stock || 0,
            notes: p.notes || "",
            supplier_id: p.supplierId || null,
          }));

          const { error } = await supabase.from("products").insert(rowsToInsert);
          if (!error) {
            insertedCount = nonDuplicates.length;
          }
        }

        setRestorationStats({ updated: 0, inserted: insertedCount, skipped: 0 });

        // 4. Handle duplicates queue if any
        if (duplicates.length > 0) {
          setDuplicateQueue(duplicates);
          setCurrentDuplicateIndex(0);
          setNewProductsToInsert(nonDuplicates);
        } else {
          // Finish restoration immediately
          await reloadAllData();
          await logActivity({
            user: settings.currentRole,
            action: "import",
            entity: "نسخة احتياطية",
            details: `استعادة كاملة بنجاح (${insertedCount} منتج جديد)`,
          });
          alert(`🎉 تم استعادة النسخة الاحتياطية بنجاح!\n• منتجات جديدة أضيفت: ${insertedCount}`);
          setIsRestoring(false);
        }
      } catch (err: any) {
        console.error("Restore error:", err);
        alert(`❌ خطأ أثناء استعادة النسخة الاحتياطية: ${err?.message || err}`);
        setIsRestoring(false);
      }
    };

    reader.readAsText(file);
    e.target.value = "";
  };

  // Step-by-Step Duplicate Resolution Handler
  const handleResolveDuplicate = async (choice: DuplicateActionChoice, applyToAll: boolean) => {
    if (choice === "cancel") {
      alert("🚫 تم إلغاء عملية الاستعادة بناءً على طلبك.");
      setDuplicateQueue([]);
      setIsRestoring(false);
      await reloadAllData();
      return;
    }

    let { updated, inserted, skipped } = restorationStats;
    const itemsToProcess = applyToAll ? duplicateQueue.slice(currentDuplicateIndex) : [duplicateQueue[currentDuplicateIndex]];

    if (choice === "update") {
      const updateRows = itemsToProcess.map((pair) => {
        const p = pair.incoming;
        return {
          id: pair.existing.id,
          name: pair.existing.name,
          image: p.image || pair.existing.image || "",
          cost_price: p.costPrice !== undefined ? p.costPrice : pair.existing.costPrice,
          profit_margin: p.profitMargin !== undefined ? p.profitMargin : pair.existing.profitMargin,
          wholesale_price: p.wholesalePrice !== undefined ? p.wholesalePrice : pair.existing.wholesalePrice,
          retail_price: p.retailPrice !== undefined ? p.retailPrice : pair.existing.retailPrice,
          stock: p.stock !== undefined ? p.stock : pair.existing.stock,
          notes: p.notes || pair.existing.notes || "",
          updated_at: new Date().toISOString(),
        };
      });

      const { error } = await supabase.from("products").upsert(updateRows);
      if (!error) {
        updated += itemsToProcess.length;
      }
    } else if (choice === "skip") {
      skipped += itemsToProcess.length;
    }

    setRestorationStats({ updated, inserted, skipped });

    if (applyToAll || currentDuplicateIndex + 1 >= duplicateQueue.length) {
      // All duplicates resolved!
      await reloadAllData();
      await logActivity({
        user: settings.currentRole,
        action: "import",
        entity: "نسخة احتياطية",
        details: `استعادة كاملة للنسخة الاحتياطية (تحديث ${updated}، إضافة ${inserted}، تخطي ${skipped})`,
      });

      alert(
        `🎉 تم الانتهاء من استعادة النسخة الاحتياطية بنجاح!\n\n` +
        `✅ منتجات تم تحديث بياناتها: ${updated}\n` +
        `➕ منتجات جديدة تم إضافتها: ${inserted}\n` +
        `⏭ منتجات مكررة تم تخطيها: ${skipped}`
      );

      setDuplicateQueue([]);
      setIsRestoring(false);
    } else {
      setCurrentDuplicateIndex((prev) => prev + 1);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          onClick={() => importRef.current?.click()}
          className="px-4 py-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all shadow-sm flex items-center gap-2"
        >
          <span>📥</span>
          <span>استيراد المنتجات مع الصور (Excel/CSV)</span>
        </button>

        <button
          onClick={handleExportProducts}
          className="px-4 py-2.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-sm flex items-center gap-2"
        >
          <span>📤</span>
          <span>تصدير المنتجات مع الصور</span>
        </button>

        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1 hidden sm:block" />

        <button
          onClick={handleFullBackup}
          className="px-4 py-2.5 text-xs font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl transition-all shadow-md flex items-center gap-2"
          title="تصدير جميع المنتجات بالتكاليف والصور والأقسام في ملف JSON كامل"
        >
          <span>💾</span>
          <span>نسخة احتياطية (صور + بيانات)</span>
        </button>

        <button
          onClick={() => backupRef.current?.click()}
          disabled={isRestoring}
          className="px-4 py-2.5 text-xs font-bold bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-xl transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
          title="استعادة ملف النسخة الاحتياطية ومعالجة التكرارات"
        >
          <span>📂</span>
          <span>{isRestoring ? "جاري الاستعادة..." : "استعادة النسخة الاحتياطية"}</span>
        </button>

        <input ref={importRef} type="file" accept=".xlsx,.csv,.xls" onChange={handleImportProducts} className="hidden" />
        <input ref={backupRef} type="file" accept=".json" onChange={handleRestoreBackupFile} className="hidden" />
      </div>

      {/* Duplicate Resolution Modal */}
      {duplicateQueue.length > 0 && currentDuplicateIndex < duplicateQueue.length && (
        <DuplicateResolutionModal
          existingProduct={duplicateQueue[currentDuplicateIndex].existing}
          incomingProduct={duplicateQueue[currentDuplicateIndex].incoming}
          currentIndex={currentDuplicateIndex + 1}
          totalDuplicates={duplicateQueue.length}
          onResolve={handleResolveDuplicate}
        />
      )}
    </div>
  );
}

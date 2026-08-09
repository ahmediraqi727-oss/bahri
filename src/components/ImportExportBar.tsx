"use client";

import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { useData } from "@/lib/data-context";
import { useSettings } from "@/lib/settings-context";
import { useActivityLog } from "@/lib/activity-log";
import { calculateRetailPrice, Product, CategoryItem, Supplier } from "@/lib/types";
import { supabase } from "@/lib/supabase-client";
import DuplicateResolutionModal, { DuplicateActionChoice } from "./DuplicateResolutionModal";
import MissingDataModal, { IncompleteImportItem } from "./MissingDataModal";
import { validateImportColumns } from "@/lib/import-validator";
import { useToast } from "@/components/ToastProvider";
import { isUUID } from "@/lib/data-context";

interface DuplicatePair {
  existing: Product;
  incoming: Partial<Product>;
}

export default function ImportExportBar() {
  const { products, suppliers, categories, addSupplier, importProducts, exportAllData, reloadAllData } = useData();
  const { settings } = useSettings();
  const { logActivity } = useActivityLog();
  const { success, error: toastError, warning, loading: toastLoading, resolve: resolveToast } = useToast();
  const importRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);

  // ── Missing Data Audit Modal State ──
  const [missingDataModalOpen, setMissingDataModalOpen] = useState(false);
  const [pendingValidProducts, setPendingValidProducts] = useState<Partial<Product>[]>([]);
  const [pendingIncompleteItems, setPendingIncompleteItems] = useState<IncompleteImportItem[]>([]);
  const [pendingValidation, setPendingValidation] = useState<any>(null);

  // ── Category Assignment Modal (shown when file has no category column) ──
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [pendingMappedRows, setPendingMappedRows] = useState<Partial<Product>[]>([]);
  const [pendingFileName, setPendingFileName] = useState("");
  const [assignedCategory, setAssignedCategory] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryTab, setCategoryTab] = useState<"existing" | "new">("existing");
  const [isImporting, setIsImporting] = useState(false);

  // Restore Duplicate Resolution State
  const [duplicateQueue, setDuplicateQueue] = useState<DuplicatePair[]>([]);
  const [currentDuplicateIndex, setCurrentDuplicateIndex] = useState<number>(0);
  const [newProductsToInsert, setNewProductsToInsert] = useState<Partial<Product>[]>([]);
  const [restorationStats, setRestorationStats] = useState({ updated: 0, inserted: 0, skipped: 0 });
  const [isRestoring, setIsRestoring] = useState(false);

  const getSupplierName = (id: string) => suppliers.find((s) => s.id === id)?.name || "—";

  // ─── Shared row-value finder (exact → fuzzy) ───────────────────────────────
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

  // ─── Clean price strings with commas or currency symbols (e.g. "15,000 د.ع" -> 15000) ───
  const parsePrice = (val: any): number => {
    if (typeof val === "number") return isNaN(val) ? 0 : val;
    if (!val) return 0;
    const cleanStr = String(val).replace(/,/g, "").replace(/[^0-9.]/g, "");
    const num = parseFloat(cleanStr);
    return isNaN(num) ? 0 : num;
  };

  // ─── Parse rows from workbook into mapped product objects (Valid vs Incomplete) ───
  const parseRowsToProducts = async (
    rows: Record<string, any>[],
    supplierMap: Map<string, string>
  ): Promise<{ validProducts: Partial<Product>[]; incompleteItems: IncompleteImportItem[] }> => {
    const validProducts: Partial<Product>[] = [];
    const incompleteItems: IncompleteImportItem[] = [];

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const rowIndex = idx + 2; // Excel/CSV row number (header is row 1)

      const nameVal = findVal(row, ["name", "product_name", "productname", "اسم المنتج", "اسم", "الاسم", "منتج", "عنوان", "product"]);
      const nameStr = nameVal ? String(nameVal).trim() : "";

      // Extract raw price candidate values using clean parsePrice
      const rawCostVal = findVal(row, ["costprice", "cost_price", "cost", "buyingprice", "buying_price", "التكلفة / الكلفة", "سعر التكلفة", "التكلفة", "تكلفة", "الكلفة", "كلفة", "سعر الكلفة", "سعر الشراء"]);
      const rawWholesaleVal = findVal(row, ["wholesaleprice", "wholesale_price", "wholesale", "سعر الجملة", "الجملة", "جملة"]);
      const rawRetailVal = findVal(row, ["retailprice", "retail_price", "retail", "price", "sellingprice", "selling_price", "unit_price", "سعر المفرد", "المفرد", "مفرد", "السعر", "سعر البيع", "سعر"]);
      const profitMargin = parsePrice(findVal(row, ["profitmargin", "profit_margin", "profit", "margin", "هامش الربح", "الربح", "نسبة الربح"]));

      const rawCostNum = parsePrice(rawCostVal);
      const rawWholesaleNum = parsePrice(rawWholesaleVal);
      const rawRetailNum = parsePrice(rawRetailVal);

      // ─── Price Triplet Ascending Sorting Algorithm ───────────────────────
      const validPrices = [rawCostNum, rawWholesaleNum, rawRetailNum].filter((p) => p > 0);

      let costPrice = 0;
      let wholesalePrice = 0;
      let retailPrice = 0;

      if (validPrices.length >= 3) {
        validPrices.sort((a, b) => a - b);
        costPrice = validPrices[0];                             // Lowest price = Cost
        wholesalePrice = validPrices[1];                        // Middle price = Wholesale
        retailPrice = validPrices[validPrices.length - 1];      // Highest price = Retail
      } else if (validPrices.length === 2) {
        validPrices.sort((a, b) => a - b);
        costPrice = validPrices[0];
        wholesalePrice = validPrices[0];
        retailPrice = validPrices[1];
      } else if (validPrices.length === 1) {
        costPrice = validPrices[0];
        if (profitMargin > 0) {
          retailPrice = calculateRetailPrice(costPrice, profitMargin);
          wholesalePrice = Math.max(
            costPrice,
            Math.round(costPrice + (retailPrice - costPrice) * 0.5)
          );
        } else {
          wholesalePrice = Math.round(costPrice * 1.15); // +15%
          retailPrice = Math.round(costPrice * 1.30);    // +30%
        }
      }

      const rawStockVal = findVal(row, ["stock", "quantity", "qty", "count", "inventory", "available", "الكمية", "المخزون", "العدد", "الرصيد", "متاح"]);
      const hasStockValue = rawStockVal !== undefined && rawStockVal !== "";
      const stock = hasStockValue ? parseInt(String(rawStockVal)) || 0 : 0;

      const supplierVal = findVal(row, ["supplier", "supplierid", "supplier_id", "supplier_name", "vendor", "المورد", "اسم المورد", "مورد", "المزود"]);
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

      const desc = String(findVal(row, ["notes", "note", "description", "desc", "details", "ملاحظات", "وصف", "الوصف", "تفاصيل", "الوصف التفصيلي"]) || "");
      const category = String(findVal(row, ["category", "category_name", "categoryname", "section", "group", "القسم", "قسم", "الفئة", "فئة", "التصنيف", "تصنيف", "النوع", "نوع", "المجموعة"]) || "").trim();
      const notes = category && desc ? `الفئة: ${category} | ${desc}` : category ? `الفئة: ${category}` : desc;
      const image = String(findVal(row, ["image", "img", "photo", "pic", "picture", "thumbnail", "product_image", "productimage", "image_url", "الصورة", "صورة", "رابط الصورة", "رابط صورة المنتج", "صورة المنتج"]) || "");

      // ─── Evaluate missing fields for pre-import validation check ───
      const nameMissing = !nameStr || nameStr.length === 0;
      const retailMissing = retailPrice <= 0 || isNaN(retailPrice);
      const costMissing = costPrice <= 0 || isNaN(costPrice);
      const stockMissing = !hasStockValue || isNaN(stock);

      // If entirely empty row, skip completely
      if (nameMissing && retailMissing && costMissing && stockMissing && !desc && !image) {
        continue;
      }

      if (nameMissing || retailMissing || costMissing || stockMissing) {
        incompleteItems.push({
          rowIndex,
          rawRow: row,
          name: nameStr,
          costPrice,
          wholesalePrice,
          retailPrice,
          stock,
          supplierId,
          notes,
          image,
          missingFields: {
            name: nameMissing,
            retailPrice: retailMissing,
            costPrice: costMissing,
            stock: stockMissing,
          },
        });
      } else {
        validProducts.push({ name: nameStr, image, costPrice, wholesalePrice, profitMargin, retailPrice, stock, supplierId, notes });
      }
    }
    return { validProducts, incompleteItems };
  };

  // ─── Finalize import: push rows to Supabase ───────────────────────────────
  const finalizeImport = async (mappedRows: Partial<Product>[], fileName: string, overrideCategory?: string) => {
    setIsImporting(true);
    const toastId = toastLoading("جاري الاستيراد...", `معالجة ${mappedRows.length} منتج من ${fileName}`);
    try {
      // If an override category was assigned, inject it into notes
      const finalRows = overrideCategory
        ? mappedRows.map((p) => ({
            ...p,
            notes: p.notes
              ? `الفئة: ${overrideCategory} | ${p.notes}`
              : `الفئة: ${overrideCategory}`,
          }))
        : mappedRows;

      const count = await importProducts(finalRows as any, (processed, total) => {
        toastLoading(`جاري استيراد ${processed} من ${total} منتج... (دفعات 50 عنصر/طلب)`, `حفظ البيانات في Supabase`, toastId);
      });
      await logActivity({
        user: settings.currentRole,
        action: "import",
        entity: "منتجات",
        details: `استيراد ${count} منتج${overrideCategory ? ` في قسم "${overrideCategory}"` : ""} من ملف ${fileName}`,
      });
      resolveToast(toastId, "success", `✅ تم استيراد ${count} منتج بنجاح!`, overrideCategory ? `القسم المعيّن: ${overrideCategory}` : undefined);
      setCategoryModalOpen(false);
      setMissingDataModalOpen(false);
      setPendingMappedRows([]);
      setPendingValidProducts([]);
      setPendingIncompleteItems([]);
      setPendingFileName("");
    } catch (err: any) {
      console.error("Import error:", err);
      resolveToast(toastId, "error", "فشل الاستيراد", err?.message || "حدث خطأ غير متوقع");
    } finally {
      setIsImporting(false);
    }
  };

  // ─── Confirm resolution from MissingDataModal ─────────────────────────────
  const handleConfirmMissingData = async (correctedProducts: Partial<Product>[], importOnlyValid: boolean) => {
    setMissingDataModalOpen(false);
    const combinedRows = importOnlyValid
      ? pendingValidProducts
      : [...pendingValidProducts, ...correctedProducts];

    if (combinedRows.length === 0) {
      warning("لم يتم تحديد أي منتجات", "لم يتم اختيار أي منتجات مكتملة للاستيراد.");
      return;
    }

    if (pendingValidation?.requiresCategoryAction) {
      setPendingMappedRows(combinedRows);
      setAssignedCategory("");
      setNewCategoryName("");
      setCategoryTab("existing");
      setCategoryModalOpen(true);
    } else {
      await finalizeImport(combinedRows, pendingFileName);
    }
  };

  // ─── Excel/CSV Products Import — main handler ─────────────────────────────
  const handleImportProducts = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error("الملف فارغ أو غير صالح");
        const sheet = workbook.Sheets[sheetName];

        // ── 1. Extract headers and validate ───────────────────────────────
        const headerRow = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })[0] || [];
        const validation = validateImportColumns(headerRow.map(String));

        if (!validation.isValid) {
          // Critical error: no product name column
          const errIssue = validation.issues.find((i) => i.severity === "error");
          toastError(
            "خطأ في هيكل الملف",
            errIssue?.message || "الملف لا يحتوي على الأعمدة الإلزامية."
          );
          return;
        }

        // Show informational warnings
        validation.issues
          .filter((i) => i.severity === "info")
          .forEach((i) => warning(i.message));

        // ── 2. Parse all data rows ─────────────────────────────────────────
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
        if (!rows || rows.length === 0) {
          warning("لا توجد بيانات", "لم يتم العثور على أي صفوف في الملف");
          return;
        }

        const supplierMap = new Map<string, string>();
        suppliers.forEach((s) => {
          supplierMap.set(s.id.toLowerCase(), s.id);
          supplierMap.set(s.name.trim().toLowerCase(), s.id);
        });

        const { validProducts, incompleteItems } = await parseRowsToProducts(rows, supplierMap);

        if (validProducts.length === 0 && incompleteItems.length === 0) {
          toastError(
            "تعذّر قراءة المنتجات",
            "الملف فارغ أو لا يحتوي على صفوف بيانات صالحة."
          );
          return;
        }

        // ── 3. Check for missing data rows (Pre-Import Audit Check) ───────
        if (incompleteItems.length > 0) {
          setPendingValidProducts(validProducts);
          setPendingIncompleteItems(incompleteItems);
          setPendingFileName(file.name);
          setPendingValidation(validation);
          setMissingDataModalOpen(true);
          return; // Wait for user modal action
        }

        // ── 4. If no category column → show assignment modal ──────────────
        if (validation.requiresCategoryAction) {
          setPendingMappedRows(validProducts);
          setPendingFileName(file.name);
          setAssignedCategory("");
          setNewCategoryName("");
          setCategoryTab("existing");
          setCategoryModalOpen(true);
          return; // wait for user modal action
        }

        // ── 5. All good — import directly ─────────────────────────────────
        await finalizeImport(validProducts, file.name);
      } catch (err: any) {
        console.error("Error importing products:", err);
        toastError("خطأ أثناء استيراد الملف", err?.message || "حدث خطأ غير متوقع");
      }
    };
    reader.readAsArrayBuffer(file);
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
            supplier_id: p.supplierId && isUUID(p.supplierId) ? p.supplierId : null,
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
          disabled={isImporting}
          className="px-4 py-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all shadow-sm flex items-center gap-2 disabled:opacity-60"
        >
          <span>{isImporting ? "⏳" : "📥"}</span>
          <span>{isImporting ? "جاري الاستيراد..." : "استيراد المنتجات مع الصور (Excel/CSV)"}</span>
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

      {/* ── Category Assignment Modal ─────────────────────────────────────── */}
      {categoryModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          dir="rtl"
        >
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-indigo-200 dark:border-indigo-700 w-full max-w-lg overflow-hidden">
            {/* Modal header */}
            <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📁</span>
                <div>
                  <h3 className="text-white font-extrabold text-base leading-none">
                    تعيين قسم للمنتجات المستوردة
                  </h3>
                  <p className="text-indigo-200 text-xs mt-1">
                    الملف <strong>{pendingFileName}</strong> لا يحتوي على عمود &quot;القسم&quot;
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Info banner */}
              <div className="flex items-start gap-2.5 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-700">
                <span className="text-xl mt-0.5 shrink-0">⚠️</span>
                <div>
                  <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
                    سيتم استيراد {pendingMappedRows.length} منتج بدون قسم محدد
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                    يرجى تحديد قسم موحد لجميع هذه المنتجات، أو اختر &quot;استيراد بدون قسم&quot; لتصنيفها لاحقاً.
                  </p>
                </div>
              </div>

              {/* Tab switch */}
              <div className="flex rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <button
                  onClick={() => setCategoryTab("existing")}
                  className={`flex-1 py-2 text-xs font-bold transition-colors ${
                    categoryTab === "existing"
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100"
                  }`}
                >
                  📂 اختر قسم موجود
                </button>
                <button
                  onClick={() => setCategoryTab("new")}
                  className={`flex-1 py-2 text-xs font-bold transition-colors ${
                    categoryTab === "new"
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100"
                  }`}
                >
                  ➕ إنشاء قسم جديد
                </button>
              </div>

              {/* Existing category dropdown */}
              {categoryTab === "existing" && (
                <select
                  value={assignedCategory}
                  onChange={(e) => setAssignedCategory(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="">— اختر القسم —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              )}

              {/* New category input */}
              {categoryTab === "new" && (
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="أدخل اسم القسم الجديد..."
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              )}

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button
                  onClick={async () => {
                    const cat = categoryTab === "existing" ? assignedCategory : newCategoryName.trim();
                    await finalizeImport(pendingMappedRows, pendingFileName, cat || undefined);
                  }}
                  disabled={
                    isImporting ||
                    (categoryTab === "existing" && !assignedCategory) ||
                    (categoryTab === "new" && !newCategoryName.trim())
                  }
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-50 transition-all"
                >
                  {isImporting ? "⏳ جاري الاستيراد..." : "✅ استيراد مع القسم المحدد"}
                </button>

                <button
                  onClick={() => finalizeImport(pendingMappedRows, pendingFileName)}
                  disabled={isImporting}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-all disabled:opacity-50"
                >
                  استيراد بدون قسم
                </button>

                <button
                  onClick={() => { setCategoryModalOpen(false); setPendingMappedRows([]); }}
                  disabled={isImporting}
                  className="px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-bold text-sm hover:bg-red-100 transition-all"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Missing Data Pre-Import Validation Audit Modal ── */}
      <MissingDataModal
        isOpen={missingDataModalOpen}
        onClose={() => setMissingDataModalOpen(false)}
        fileName={pendingFileName}
        validCount={pendingValidProducts.length}
        incompleteItems={pendingIncompleteItems}
        onConfirmImport={handleConfirmMissingData}
      />
    </div>
  );
}

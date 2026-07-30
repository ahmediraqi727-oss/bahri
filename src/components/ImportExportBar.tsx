"use client";

import { useRef } from "react";
import * as XLSX from "xlsx";
import { useData } from "@/lib/data-context";
import { useSettings } from "@/lib/settings-context";
import { useActivityLog } from "@/lib/activity-log";
import { calculateRetailPrice } from "@/lib/types";

export default function ImportExportBar() {
  const { products, suppliers, addSupplier, importProducts, exportAllData, importAllData } = useData();
  const { settings } = useSettings();
  const { logActivity } = useActivityLog();
  const importRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);

  const getSupplierName = (id: string) => suppliers.find((s) => s.id === id)?.name || "—";

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

        // Cache suppliers map
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

  const handleExportProducts = async () => {
    if (products.length === 0) { alert("لا توجد منتجات للتصدير"); return; }
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
    await logActivity({ user: settings.currentRole, action: "export", entity: "منتجات", details: `تصدير ${products.length} منتج شامل الصور والمعلومات الكاملة` });
  };

  const handleFullBackup = async () => {
    const data = exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup-${settings.siteName}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    await logActivity({ user: settings.currentRole, action: "export", entity: "نسخة احتياطية", details: `تصدير نسخة احتياطية كاملة (${data.products.length} منتج شامل الصور والمعلومات، ${data.suppliers.length} مورد)` });
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        await importAllData(data);
        await logActivity({ user: settings.currentRole, action: "import", entity: "نسخة احتياطية", details: `استعادة نسخة احتياطية من ${file.name}` });
        alert("🎉 تم استعادة النسخة الاحتياطية بنجاح وشملت جميع المنتجات وصورها المرفقة!");
      } catch (err: any) {
        alert(`❌ خطأ في استعادة النسخة الاحتياطية: ${err?.message || err}`);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex flex-wrap gap-2">
        <button onClick={() => importRef.current?.click()} className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2">
          📥 استيراد المنتجات مع الصور (Excel/CSV)
        </button>
        <button onClick={handleExportProducts} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">
          📤 تصدير المنتجات مع الصور
        </button>
        <div className="w-px bg-gray-300 dark:bg-gray-600 mx-1" />
        <button onClick={handleFullBackup} className="px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2">
          💾 نسخة احتياطية (صور + بيانات)
        </button>
        <button onClick={() => backupRef.current?.click()} className="px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-2">
          📂 استعادة النسخة الاحتياطية
        </button>
        <input ref={importRef} type="file" accept=".xlsx,.csv,.xls" onChange={handleImportProducts} className="hidden" />
        <input ref={backupRef} type="file" accept=".json" onChange={handleRestoreBackup} className="hidden" />
      </div>
    </div>
  );
}

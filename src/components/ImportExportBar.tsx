"use client";

import { useRef } from "react";
import * as XLSX from "xlsx";
import { useData } from "@/lib/data-context";
import { useSettings } from "@/lib/settings-context";
import { useActivityLog } from "@/lib/activity-log";
import { calculateRetailPrice } from "@/lib/types";

export default function ImportExportBar() {
  const { products, suppliers, importProducts, exportAllData, importAllData } = useData();
  const { settings } = useSettings();
  const { logActivity } = useActivityLog();
  const importRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);

  const handleImportProducts = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet);

        const mapped = rows.map((row) => {
          const costPrice = parseFloat(String(row["costPrice"] || row["سعر التكلفة"] || 0));
          const profitMargin = parseFloat(String(row["profitMargin"] || row["هامش الربح"] || 0));
          return {
            name: String(row["name"] || row["الاسم"] || ""),
            image: String(row["image"] || row["الصورة"] || ""),
            costPrice,
            wholesalePrice: parseFloat(String(row["wholesalePrice"] || row["سعر الجملة"] || 0)),
            profitMargin,
            retailPrice: parseFloat(String(row["retailPrice"] || row["سعر المفرد"] || calculateRetailPrice(costPrice, profitMargin))),
            stock: parseInt(String(row["stock"] || row["الكمية"] || 0)),
            supplierId: String(row["supplierId"] || row["المورد"] || ""),
            notes: String(row["notes"] || row["ملاحظات"] || ""),
          };
        }).filter((p) => p.name);

        const count = await importProducts(mapped);
        await logActivity({
          user: settings.currentRole,
          action: "import",
          entity: "منتجات",
          details: `استيراد ${count} منتج من ملف ${file.name}`,
        });
        alert(`تم استيراد ${count} منتج بنجاح`);
      } catch {
        alert("خطأ في قراءة الملف. تأكد من الصيغة الصحيحة.");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const handleExportProducts = async () => {
    if (products.length === 0) { alert("لا توجد منتجات للتصدير"); return; }
    const data = products.map((p) => ({
      name: p.name,
      costPrice: p.costPrice,
      wholesalePrice: p.wholesalePrice,
      profitMargin: p.profitMargin,
      retailPrice: p.retailPrice,
      stock: p.stock,
      supplierId: p.supplierId,
      notes: p.notes,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, `products-${new Date().toISOString().slice(0, 10)}.xlsx`);
    await logActivity({ user: settings.currentRole, action: "export", entity: "منتجات", details: `تصدير ${products.length} منتج` });
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
    await logActivity({ user: settings.currentRole, action: "export", entity: "نسخة احتياطية", details: `تصدير نسخة احتياطية كاملة (${data.products.length} منتج، ${data.suppliers.length} مورد)` });
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        await importAllData(data);
        await logActivity({ user: settings.currentRole, action: "import", entity: "نسخة احتياطية", details: `استيراد نسخة احتياطية من ${file.name}` });
        alert("تم استيراد البيانات بنجاح");
      } catch {
        alert("خطأ في ملف النسخة الاحتياطية");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex flex-wrap gap-2">
        <button onClick={() => importRef.current?.click()} className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2">
          📥 استيراد المنتجات (Excel/CSV)
        </button>
        <button onClick={handleExportProducts} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">
          📤 تصدير المنتجات
        </button>
        <div className="w-px bg-gray-300 dark:bg-gray-600 mx-1" />
        <button onClick={handleFullBackup} className="px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2">
          💾 نسخة احتياطية كاملة
        </button>
        <button onClick={() => backupRef.current?.click()} className="px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-2">
          📂 استعادة نسخة احتياطية
        </button>
        <input ref={importRef} type="file" accept=".xlsx,.csv,.xls" onChange={handleImportProducts} className="hidden" />
        <input ref={backupRef} type="file" accept=".json" onChange={handleRestoreBackup} className="hidden" />
      </div>
    </div>
  );
}

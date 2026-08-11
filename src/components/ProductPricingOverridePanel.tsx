"use client";

import { useState, useEffect, useCallback } from "react";
import { ProductPricingOverride, PricingTier, syncRetailFromWholesaleChange, syncWholesaleFromRetailChange, calculateTierPrice } from "@/lib/pricing-engine";
import { useData } from "@/lib/data-context";
import { Product } from "@/lib/types";

interface ProductPricingOverridePanelProps {
  product: Product;
  onClose?: () => void;
}

const DEFAULT_OVERRIDE: Omit<ProductPricingOverride, "productId"> = {
  tierMode: "global",
  tier1MinQty: 2,
  tier1MaxQty: 5,
  tier1DiscountPct: 2,
  tier2MinQty: 6,
  tier2MaxQty: 10,
  tier2DiscountPct: 5,
  tier3MinQty: 11,
  tier3MaxQty: 99999,
  tier3DiscountPct: 10,
  singlePriceOverride: null,
  wholesalePriceOverride: null,
  notes: "",
};

export default function ProductPricingOverridePanel({ product, onClose }: ProductPricingOverridePanelProps) {
  const { productPricingOverrides, upsertPricingOverride } = useData();

  const existing = productPricingOverrides[product.id];

  const [form, setForm] = useState<Omit<ProductPricingOverride, "productId">>({
    ...DEFAULT_OVERRIDE,
    ...(existing ? {
      tierMode: existing.tierMode,
      tier1MinQty: existing.tier1MinQty,
      tier1MaxQty: existing.tier1MaxQty,
      tier1DiscountPct: existing.tier1DiscountPct,
      tier2MinQty: existing.tier2MinQty,
      tier2MaxQty: existing.tier2MaxQty,
      tier2DiscountPct: existing.tier2DiscountPct,
      tier3MinQty: existing.tier3MinQty,
      tier3MaxQty: existing.tier3MaxQty,
      tier3DiscountPct: existing.tier3DiscountPct,
      singlePriceOverride: existing.singlePriceOverride,
      wholesalePriceOverride: existing.wholesalePriceOverride,
      notes: existing.notes,
    } : {}),
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Bidirectional price sync — live as you type
  const [lastEditedPrice, setLastEditedPrice] = useState<"single" | "wholesale" | null>(null);

  const handleSinglePriceChange = useCallback((value: number) => {
    setLastEditedPrice("single");
    const newWholesale = form.wholesalePriceOverride != null
      ? syncWholesaleFromRetailChange(value, form.singlePriceOverride ?? product.retailPrice, form.wholesalePriceOverride)
      : null;
    setForm((prev) => ({
      ...prev,
      singlePriceOverride: value,
      wholesalePriceOverride: newWholesale,
    }));
  }, [form.singlePriceOverride, form.wholesalePriceOverride, product.retailPrice]);

  const handleWholesalePriceChange = useCallback((value: number) => {
    setLastEditedPrice("wholesale");
    const newSingle = form.singlePriceOverride != null
      ? syncRetailFromWholesaleChange(value, form.wholesalePriceOverride ?? product.wholesalePrice, form.singlePriceOverride)
      : null;
    setForm((prev) => ({
      ...prev,
      wholesalePriceOverride: value,
      singlePriceOverride: newSingle,
    }));
  }, [form.singlePriceOverride, form.wholesalePriceOverride, product.wholesalePrice]);

  const handleSave = async () => {
    setSaving(true);
    await upsertPricingOverride({ productId: product.id, ...form });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Preview: what prices look like at each tier
  const previewRetail = form.singlePriceOverride ?? product.retailPrice;
  const tiers: PricingTier[] = form.tierMode === "global"
    ? [] // will show global indicator
    : [
        { label: "مفرد",   minQty: 1,               maxQty: form.tier1MinQty - 1, discountPct: 0 },
        { label: "جملة 1", minQty: form.tier1MinQty, maxQty: form.tier1MaxQty,    discountPct: form.tier1DiscountPct },
        { label: "جملة 2", minQty: form.tier2MinQty, maxQty: form.tier2MaxQty,    discountPct: form.tier2DiscountPct },
        { label: "جملة 3", minQty: form.tier3MinQty, maxQty: 99999,               discountPct: form.tier3DiscountPct },
      ];

  return (
    <div className="border border-indigo-200 dark:border-indigo-800/40 rounded-2xl overflow-hidden bg-white dark:bg-gray-900" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border-b border-indigo-100 dark:border-indigo-800/40">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏷️</span>
          <div>
            <h3 className="font-extrabold text-sm text-gray-900 dark:text-white">إعدادات التسعير المتدرج</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">{product.name}</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg">✕</button>
        )}
      </div>

      <div className="p-5 space-y-5">
        {/* Mode Toggle */}
        <div>
          <p className="text-xs font-extrabold text-gray-700 dark:text-gray-200 mb-2 uppercase tracking-wide">وضع التسعير</p>
          <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setForm((f) => ({ ...f, tierMode: "global" }))}
              className={`flex-1 py-2.5 px-4 text-sm font-bold transition-colors ${
                form.tierMode === "global"
                  ? "bg-indigo-600 text-white"
                  : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              🌐 إعداد عالمي
            </button>
            <button
              onClick={() => setForm((f) => ({ ...f, tierMode: "custom" }))}
              className={`flex-1 py-2.5 px-4 text-sm font-bold transition-colors ${
                form.tierMode === "custom"
                  ? "bg-indigo-600 text-white"
                  : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              ✏️ تخصيص استثنائي
            </button>
          </div>
          {form.tierMode === "global" && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 px-1">
              يستخدم هذا المنتج الإعدادات العالمية للتسعير المتدرج المحددة في إعدادات النظام.
            </p>
          )}
        </div>

        {/* Custom Tier Editor */}
        {form.tierMode === "custom" && (
          <div className="space-y-4">
            <p className="text-xs font-extrabold text-gray-700 dark:text-gray-200 uppercase tracking-wide">حدود الفئات المخصصة</p>

            {/* Tier 1 */}
            <div className="bg-blue-50 dark:bg-blue-950/20 rounded-xl p-4 border border-blue-100 dark:border-blue-900/40 space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <p className="text-xs font-extrabold text-blue-700 dark:text-blue-300">جملة 1 (المرحلة الأولى)</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 block mb-1">من (قطعة)</label>
                  <input type="number" min={2} value={form.tier1MinQty}
                    onChange={(e) => setForm((f) => ({ ...f, tier1MinQty: parseInt(e.target.value) || 2 }))}
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 block mb-1">إلى (قطعة)</label>
                  <input type="number" min={form.tier1MinQty} value={form.tier1MaxQty}
                    onChange={(e) => setForm((f) => ({ ...f, tier1MaxQty: parseInt(e.target.value) || 5 }))}
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 block mb-1">خصم %</label>
                  <input type="number" min={0} max={99} step={0.5} value={form.tier1DiscountPct}
                    onChange={(e) => setForm((f) => ({ ...f, tier1DiscountPct: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-bold text-red-600 dark:text-red-400 outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <p className="text-xs text-blue-600 dark:text-blue-400 font-bold">
                سعر الوحدة: {calculateTierPrice(previewRetail, { label: "j1", minQty: form.tier1MinQty, maxQty: form.tier1MaxQty, discountPct: form.tier1DiscountPct }).toLocaleString()} د.ع
              </p>
            </div>

            {/* Tier 2 */}
            <div className="bg-purple-50 dark:bg-purple-950/20 rounded-xl p-4 border border-purple-100 dark:border-purple-900/40 space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                <p className="text-xs font-extrabold text-purple-700 dark:text-purple-300">جملة 2 (المرحلة الثانية)</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 block mb-1">من (قطعة)</label>
                  <input type="number" min={form.tier1MaxQty + 1} value={form.tier2MinQty}
                    onChange={(e) => setForm((f) => ({ ...f, tier2MinQty: parseInt(e.target.value) || 6 }))}
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 block mb-1">إلى (قطعة)</label>
                  <input type="number" min={form.tier2MinQty} value={form.tier2MaxQty}
                    onChange={(e) => setForm((f) => ({ ...f, tier2MaxQty: parseInt(e.target.value) || 10 }))}
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 block mb-1">خصم %</label>
                  <input type="number" min={0} max={99} step={0.5} value={form.tier2DiscountPct}
                    onChange={(e) => setForm((f) => ({ ...f, tier2DiscountPct: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-bold text-red-600 dark:text-red-400 outline-none focus:border-purple-500"
                  />
                </div>
              </div>
              <p className="text-xs text-purple-600 dark:text-purple-400 font-bold">
                سعر الوحدة: {calculateTierPrice(previewRetail, { label: "j2", minQty: form.tier2MinQty, maxQty: form.tier2MaxQty, discountPct: form.tier2DiscountPct }).toLocaleString()} د.ع
              </p>
            </div>

            {/* Tier 3 / Max Bulk */}
            <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-xl p-4 border border-emerald-100 dark:border-emerald-900/40 space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <p className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300">جملة 3 — الجملة الكبرى (بدون سقف)</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 block mb-1">من (قطعة)</label>
                  <input type="number" min={form.tier2MaxQty + 1} value={form.tier3MinQty}
                    onChange={(e) => setForm((f) => ({ ...f, tier3MinQty: parseInt(e.target.value) || 11 }))}
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 block mb-1">خصم %</label>
                  <input type="number" min={0} max={99} step={0.5} value={form.tier3DiscountPct}
                    onChange={(e) => setForm((f) => ({ ...f, tier3DiscountPct: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-bold text-red-600 dark:text-red-400 outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                سعر الوحدة: {calculateTierPrice(previewRetail, { label: "j3", minQty: form.tier3MinQty, maxQty: 99999, discountPct: form.tier3DiscountPct }).toLocaleString()} د.ع
              </p>
            </div>
          </div>
        )}

        {/* Bidirectional Price Override (Available in both modes) */}
        <div className="space-y-3">
          <p className="text-xs font-extrabold text-gray-700 dark:text-gray-200 uppercase tracking-wide">
            🔄 تحكم في السعر الأساسي (اختياري — مزامنة تلقائية)
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-600 dark:text-gray-300 block mb-1.5">
                سعر المفرد (الأساسي)
                <span className="text-gray-400 font-normal mr-1">
                  [{product.retailPrice.toLocaleString()} الحالي]
                </span>
              </label>
              <input
                type="number"
                min={0}
                step={100}
                value={form.singlePriceOverride ?? ""}
                placeholder={String(product.retailPrice)}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) handleSinglePriceChange(v);
                  else setForm((f) => ({ ...f, singlePriceOverride: null }));
                }}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-bold text-blue-600 dark:text-blue-400 outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 dark:text-gray-300 block mb-1.5">
                سعر الجملة المرجعي
                <span className="text-gray-400 font-normal mr-1">
                  [{product.wholesalePrice.toLocaleString()} الحالي]
                </span>
              </label>
              <input
                type="number"
                min={0}
                step={100}
                value={form.wholesalePriceOverride ?? ""}
                placeholder={String(product.wholesalePrice)}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) handleWholesalePriceChange(v);
                  else setForm((f) => ({ ...f, wholesalePriceOverride: null }));
                }}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-bold text-emerald-600 dark:text-emerald-400 outline-none focus:border-emerald-500"
              />
            </div>
          </div>
          {(form.singlePriceOverride != null || form.wholesalePriceOverride != null) && (
            <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 px-3 py-2 rounded-xl border border-indigo-100 dark:border-indigo-800/40">
              <span>🔄</span>
              <span>المزامنة التلقائية تعمل — تغيير أحد السعرين يعدّل الآخر تناسبياً</span>
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs font-bold text-gray-600 dark:text-gray-300 block mb-1.5">ملاحظات (اختياري)</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="سبب التخصيص أو أي ملاحظة..."
            rows={2}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 outline-none focus:border-blue-500 resize-none"
          />
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving || saved}
          className={`w-full py-3 rounded-2xl font-extrabold text-sm text-white transition-all shadow-md ${
            saved
              ? "bg-emerald-600"
              : saving
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 hover:scale-[1.01]"
          }`}
        >
          {saved ? "✅ تم الحفظ" : saving ? "جارٍ الحفظ..." : "💾 حفظ إعدادات التسعير"}
        </button>
      </div>
    </div>
  );
}

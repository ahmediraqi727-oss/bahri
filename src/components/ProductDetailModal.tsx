"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { Product } from "@/lib/types";
import { PricingTier, buildTierBadgeText, resolveTierForQty, calculateTierPrice, getTierLabel } from "@/lib/pricing-engine";
import { useCart } from "@/lib/cart-context";
import { useLang } from "@/lib/lang-context";

interface ProductDetailModalProps {
  product: Product | null;
  tiers: PricingTier[];
  onClose: () => void;
}

export default function ProductDetailModal({ product, tiers, onClose }: ProductDetailModalProps) {
  const { addItem } = useCart();
  const { t } = useLang();
  const [qty, setQty] = useState(1);
  const [addedSuccess, setAddedSuccess] = useState(false);

  // Reset qty when product changes
  useEffect(() => {
    setQty(1);
    setAddedSuccess(false);
  }, [product?.id]);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const activeTier = useMemo(() => resolveTierForQty(qty, tiers), [qty, tiers]);
  const unitPrice = useMemo(() => calculateTierPrice(product?.retailPrice ?? 0, activeTier), [product?.retailPrice, activeTier]);
  const totalPrice = useMemo(() => unitPrice * qty, [unitPrice, qty]);
  const hasDiscount = activeTier.discountPct > 0;

  const handleAddToCart = useCallback(() => {
    if (!product) return;
    addItem({
      productId: product.id,
      name: product.name,
      image: product.image,
      retailPrice: product.retailPrice,
      wholesalePrice: product.wholesalePrice,
      quantity: qty,
      tiers,
    });
    setAddedSuccess(true);
    setTimeout(() => {
      setAddedSuccess(false);
      onClose();
    }, 1000);
  }, [product, qty, tiers, addItem, onClose]);

  const adjustQty = (delta: number) => {
    setQty((prev) => Math.max(1, prev + delta));
  };

  if (!product) return null;

  const sortedTiers = [...tiers].sort((a, b) => a.minQty - b.minQty);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative">
          {product.image ? (
            <div className="aspect-video bg-gray-100 dark:bg-gray-800 overflow-hidden">
              <img
                src={product.image}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="aspect-video bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center text-6xl">
              📦
            </div>
          )}
          <button
            onClick={onClose}
            className="absolute top-3 left-3 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center text-lg transition-all backdrop-blur-sm"
          >
            ✕
          </button>
          {/* Tier badge overlay */}
          <div className="absolute bottom-3 right-3">
            <span className="px-3 py-1 rounded-xl text-[11px] font-bold bg-black/50 text-white backdrop-blur-sm">
              {buildTierBadgeText(tiers)}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* Product Name */}
          <div>
            <h2 className="text-xl font-extrabold text-gray-900 dark:text-white leading-tight">
              {product.name}
            </h2>
            {product.notes && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                {product.notes}
              </p>
            )}
          </div>

          {/* Price Display Panel */}
          <div className="bg-gradient-to-br from-blue-50/80 to-indigo-50/80 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-2xl p-4 border border-blue-100 dark:border-blue-900/40">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400">سعر الوحدة</p>
                {hasDiscount ? (
                  <div className="space-y-0.5">
                    {/* Original retail — strikethrough dim */}
                    <p className="text-base text-gray-400 dark:text-gray-600 line-through font-medium">
                      {product.retailPrice.toLocaleString()} {t.dinar}
                    </p>
                    {/* Tier price — bold red */}
                    <p className="text-2xl font-extrabold text-red-600 dark:text-red-400">
                      {unitPrice.toLocaleString()} {t.dinar}
                    </p>
                  </div>
                ) : (
                  <p className="text-2xl font-extrabold text-blue-600 dark:text-blue-400">
                    {unitPrice.toLocaleString()} {t.dinar}
                  </p>
                )}
                {/* Active tier badge */}
                {hasDiscount && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-extrabold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
                    🏷️ {getTierLabel(qty, tiers)}
                  </span>
                )}
              </div>

              {/* Total */}
              <div className="text-left space-y-1">
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400">الإجمالي</p>
                <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                  {totalPrice.toLocaleString()}
                </p>
                <p className="text-xs text-gray-400">{t.dinar}</p>
              </div>
            </div>

            {/* Discount indicator bar */}
            {hasDiscount && (
              <div className="mt-3 flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800/40">
                <span>✅</span>
                <span>تم تطبيق خصم {activeTier.discountPct}% على هذه الكمية</span>
              </div>
            )}
          </div>

          {/* Quantity Stepper */}
          <div className="flex items-center gap-4">
            <p className="text-sm font-bold text-gray-700 dark:text-gray-200 flex-shrink-0">الكمية:</p>
            <div className="flex items-center gap-3 bg-gray-100 dark:bg-gray-800 rounded-2xl px-3 py-2">
              <button
                onClick={() => adjustQty(-1)}
                disabled={qty <= 1}
                className="w-8 h-8 rounded-xl bg-white dark:bg-gray-700 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-700 dark:text-gray-200 font-extrabold text-lg flex items-center justify-center shadow-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                −
              </button>
              <input
                type="number"
                min={1}
                max={9999}
                value={qty}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v >= 1) setQty(v);
                }}
                className="w-16 text-center font-extrabold text-lg bg-transparent text-gray-900 dark:text-white outline-none"
              />
              <button
                onClick={() => adjustQty(1)}
                className="w-8 h-8 rounded-xl bg-white dark:bg-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-700 dark:text-gray-200 font-extrabold text-lg flex items-center justify-center shadow-sm transition-all"
              >
                +
              </button>
            </div>

            {/* Stock indicator */}
            {product.stock > 0 && (
              <span className="text-xs text-gray-400">
                متوفر: {product.stock} قطعة
              </span>
            )}
          </div>

          {/* Tier Breakdown Table */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <p className="text-xs font-extrabold text-gray-700 dark:text-gray-200 uppercase tracking-wide">جدول الأسعار حسب الكمية</p>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {sortedTiers.map((tier, idx) => {
                const tierPrice = calculateTierPrice(product.retailPrice, tier);
                const isActive = tier.minQty === activeTier.minQty && tier.maxQty === activeTier.maxQty;
                const rangeLabel = tier.maxQty >= 99999
                  ? `${tier.minQty}+ قطعة`
                  : tier.minQty === tier.maxQty
                  ? `${tier.minQty} قطعة`
                  : `${tier.minQty}-${tier.maxQty} قطعة`;

                return (
                  <div
                    key={idx}
                    className={`flex items-center justify-between px-4 py-3 transition-colors ${
                      isActive
                        ? "bg-blue-50 dark:bg-blue-950/30"
                        : "bg-white dark:bg-gray-900"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isActive && (
                        <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse flex-shrink-0" />
                      )}
                      <span className={`text-sm font-bold ${isActive ? "text-blue-700 dark:text-blue-300" : "text-gray-700 dark:text-gray-300"}`}>
                        {tier.label}
                      </span>
                      <span className="text-xs text-gray-400">({rangeLabel})</span>
                    </div>
                    <div className="flex items-center gap-2 text-right">
                      {tier.discountPct > 0 && (
                        <span className="text-xs font-bold text-red-500 bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded-lg">
                          -{tier.discountPct}%
                        </span>
                      )}
                      <span className={`text-sm font-extrabold ${isActive ? "text-blue-700 dark:text-blue-300" : "text-gray-800 dark:text-gray-200"}`}>
                        {tierPrice.toLocaleString()} {t.dinar}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Wholesale reference */}
          {product.wholesalePrice > 0 && product.wholesalePrice < product.retailPrice && (
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700">
              <span>📊</span>
              <span>سعر الجملة المرجعي: <strong className="text-emerald-600 dark:text-emerald-400">{product.wholesalePrice.toLocaleString()} {t.dinar}</strong></span>
            </div>
          )}

          {/* Add to Cart Button */}
          <button
            onClick={handleAddToCart}
            disabled={addedSuccess}
            className={`w-full py-4 rounded-2xl font-extrabold text-base text-white transition-all hover:scale-[1.01] active:scale-[0.99] shadow-lg ${
              addedSuccess
                ? "bg-emerald-600"
                : "bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            }`}
          >
            {addedSuccess ? (
              <span className="flex items-center justify-center gap-2">
                <span>✅</span> تمت الإضافة إلى السلة
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <span>🛒</span>
                أضف {qty} {qty === 1 ? "قطعة" : "قطع"} بـ {totalPrice.toLocaleString()} {t.dinar}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

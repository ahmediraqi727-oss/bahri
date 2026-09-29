"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { Product } from "@/lib/types";
import {
  PricingTier,
  buildTierBadgeText,
  resolveTierForQty,
  calculateTierPrice,
  getTierLabel,
} from "@/lib/pricing-engine";
import { useCart } from "@/lib/cart-context";
import { useLang } from "@/lib/lang-context";
import StructuredData from "@/components/StructuredData";
import { extractCategoryFromNotes } from "@/lib/seo";

interface ProductDetailModalProps {
  product: Product | null;
  tiers: PricingTier[];
  onClose: () => void;
}

export default function ProductDetailModal({
  product,
  tiers,
  onClose,
}: ProductDetailModalProps) {
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
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent background body scrolling when modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const activeTier = useMemo(() => resolveTierForQty(qty, tiers), [qty, tiers]);
  const unitPrice = useMemo(
    () => calculateTierPrice(product?.retailPrice ?? 0, activeTier),
    [product?.retailPrice, activeTier]
  );
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
    }, 850);
  }, [product, qty, tiers, addItem, onClose]);

  const adjustQty = (delta: number) => {
    setQty((prev) => Math.max(1, prev + delta));
  };

  if (!product) return null;

  const sortedTiers = [...tiers].sort((a, b) => a.minQty - b.minQty);
  const categoryName = product.notes
    ? extractCategoryFromNotes(product.notes)
    : null;

  return (
    <>
      <StructuredData
        product={product}
        breadcrumbs={[
          { name: "الرئيسية", item: "/" },
          { name: "المنتجات", item: "/#products" },
          { name: product.name, item: `/?product=${product.id}` },
        ]}
      />

      {/* Backdrop overlay with smooth fade-in and high-end blur */}
      <div
        className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md p-0 sm:p-4 animate-modalBackdrop transition-all duration-300"
        onClick={onClose}
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-modal-title"
      >
        {/* Main Modal Card: Deep Violet / Dark Purple Theme with Smooth Scale-Up Motion */}
        <div
          className="bg-[#120a22] text-white border border-purple-500/30 rounded-t-3xl sm:rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.9)] w-full max-w-xl max-h-[92vh] sm:max-h-[88vh] flex flex-col overflow-hidden animate-scaleUp transform-gpu"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Scrollable Content Container */}
          <div className="flex-1 overflow-y-auto overscroll-contain scrollbar-thin">
            {/* Header Image Box with Dark Violet Vignette */}
            <div className="relative w-full h-56 sm:h-64 md:h-72 bg-[#1a0f30] overflow-hidden group select-none animate-slideUpFade [animation-delay:40ms] opacity-0 [animation-fill-mode:forwards]">
              {product.image ? (
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out will-change-transform"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-purple-950 via-[#1e1138] to-[#120a22] flex items-center justify-center text-7xl">
                  📦
                </div>
              )}

              {/* Gradient overlay for text contrast and depth */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#120a22] via-[#120a22]/50 to-transparent pointer-events-none" />

              {/* Close Button with High Contrast & Micro-interaction */}
              <button
                onClick={onClose}
                className="absolute top-3 left-3 w-10 h-10 rounded-full bg-black/60 hover:bg-black/85 text-white flex items-center justify-center text-lg transition-all duration-200 hover:rotate-90 hover:scale-110 active:scale-95 backdrop-blur-md border border-white/20 shadow-lg cursor-pointer z-10"
                title="إغلاق النافذة"
                aria-label="إغلاق نافذة التفاصيل"
              >
                ✕
              </button>

              {/* Discount/Tier Badge Overlay */}
              <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2">
                <span className="px-3 py-1 rounded-xl text-xs font-black bg-purple-950/90 text-purple-200 backdrop-blur-md border border-purple-500/40 shadow-lg">
                  {buildTierBadgeText(tiers)}
                </span>
                {product.stock > 0 && (
                  <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-950/90 text-emerald-300 backdrop-blur-md border border-emerald-600/40 shadow-lg">
                    متوفر: {product.stock} قطعة
                  </span>
                )}
              </div>
            </div>

            {/* Modal Body with Staggered Animations for Each Section */}
            <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
              {/* 1. Product Title & Category */}
              <div className="space-y-1.5 animate-slideUpFade [animation-delay:80ms] opacity-0 [animation-fill-mode:forwards]">
                <div className="flex items-center gap-2 flex-wrap">
                  {categoryName && (
                    <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-extrabold bg-purple-900/60 text-purple-300 border border-purple-600/40">
                      {categoryName}
                    </span>
                  )}
                  {hasDiscount && (
                    <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-extrabold bg-rose-600 text-white shadow-xs">
                      خصم حتى {activeTier.discountPct}%
                    </span>
                  )}
                </div>

                <h2
                  id="product-modal-title"
                  className="text-xl sm:text-2xl font-black text-white leading-tight tracking-wide"
                >
                  {product.name}
                </h2>

                {product.notes && (
                  <p className="text-xs sm:text-sm text-purple-200/80 leading-relaxed">
                    {product.notes}
                  </p>
                )}
              </div>

              {/* 2. Price Display Card with Vibrant High Contrast */}
              <div className="bg-gradient-to-br from-purple-950/70 via-[#1f123a] to-indigo-950/60 rounded-2xl p-4 border border-purple-500/30 shadow-md transition-all duration-300 animate-slideUpFade [animation-delay:120ms] opacity-0 [animation-fill-mode:forwards]">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  {/* Unit price block */}
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-purple-300">سعر المفرد للقطعة</p>
                    {hasDiscount ? (
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-2xl sm:text-3xl font-black text-emerald-400">
                          {unitPrice.toLocaleString()}
                        </span>
                        <span className="text-sm font-bold text-purple-300">{t.dinar}</span>
                        <span className="text-xs text-purple-400 line-through font-medium mr-1">
                          {product.retailPrice.toLocaleString()} {t.dinar}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl sm:text-3xl font-black text-white">
                          {unitPrice.toLocaleString()}
                        </span>
                        <span className="text-xs font-bold text-purple-300">{t.dinar}</span>
                      </div>
                    )}

                    {hasDiscount && (
                      <div className="pt-0.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          🏷️ {getTierLabel(qty, tiers)} (-{activeTier.discountPct}%)
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Total price block */}
                  <div className="text-left space-y-0.5">
                    <p className="text-xs font-bold text-purple-300">الإجمالي ({qty} قطع)</p>
                    <div className="flex items-baseline gap-1 justify-end">
                      <span
                        key={totalPrice}
                        className="text-2xl sm:text-3xl font-black text-emerald-400 animate-popIn"
                      >
                        {totalPrice.toLocaleString()}
                      </span>
                      <span className="text-xs font-bold text-purple-300">{t.dinar}</span>
                    </div>
                  </div>
                </div>

                {/* Discount banner if applicable */}
                {hasDiscount && (
                  <div className="mt-3 flex items-center gap-2 text-xs font-bold text-emerald-300 bg-emerald-950/50 px-3 py-1.5 rounded-xl border border-emerald-600/30">
                    <span>✨</span>
                    <span>تم تطبيق خصم فئة الجملة بنسبة {activeTier.discountPct}% على إجمالي طلبك</span>
                  </div>
                )}
              </div>

              {/* 3. Interactive Pricing Tier Table with Mobile Stacked Layout */}
              <div className="border border-purple-500/30 rounded-2xl overflow-hidden shadow-xs bg-[#150d28] animate-slideUpFade [animation-delay:180ms] opacity-0 [animation-fill-mode:forwards]">
                <div className="px-4 py-2.5 bg-purple-950/80 border-b border-purple-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">📊</span>
                    <p className="text-xs font-black text-white uppercase tracking-wider">
                      جدول الأسعار حسب الكمية
                    </p>
                  </div>
                  <span className="text-[11px] text-purple-300 font-bold">
                    انقر لتحديد الكمية
                  </span>
                </div>

                <div className="divide-y divide-purple-900/40">
                  {sortedTiers.map((tier, idx) => {
                    const tierPrice = calculateTierPrice(product.retailPrice, tier);
                    const isActive =
                      tier.minQty === activeTier.minQty && tier.maxQty === activeTier.maxQty;
                    const rangeLabel =
                      tier.maxQty >= 99999
                        ? `${tier.minQty}+ قطعة`
                        : tier.minQty === tier.maxQty
                        ? `${tier.minQty} قطعة`
                        : `${tier.minQty} - ${tier.maxQty} قطعة`;

                    return (
                      <div
                        key={idx}
                        onClick={() => setQty(tier.minQty)}
                        className={`p-3 sm:px-4 sm:py-3 transition-all duration-200 cursor-pointer ${
                          isActive
                            ? "bg-gradient-to-r from-purple-800/80 via-indigo-900/70 to-purple-800/80 border-r-4 border-purple-400 shadow-inner"
                            : "bg-[#140c26]/60 hover:bg-purple-900/30"
                        }`}
                      >
                        {/* Stacked on Mobile, Horizontal Row on Tablet/Desktop */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-2">
                          {/* Left details: indicator + label + range + badge */}
                          <div className="flex items-center justify-between sm:justify-start gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              {isActive ? (
                                <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-pulseGlow flex-shrink-0" />
                              ) : (
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-600/50 flex-shrink-0" />
                              )}
                              <span
                                className={`text-sm ${
                                  isActive
                                    ? "font-black text-white"
                                    : "font-bold text-purple-200"
                                }`}
                              >
                                {tier.label}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-purple-200/90 bg-purple-900/60 px-2 py-0.5 rounded-md font-mono border border-purple-700/40">
                                {rangeLabel}
                              </span>
                              {tier.discountPct > 0 && (
                                <span
                                  className={`text-[11px] font-extrabold px-2 py-0.5 rounded-md shadow-xs ${
                                    isActive
                                      ? "bg-rose-600 text-white animate-popIn"
                                      : "bg-rose-950/70 text-rose-300 border border-rose-800/50"
                                  }`}
                                >
                                  خصم {tier.discountPct}%
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Right price block */}
                          <div className="flex items-center justify-between sm:justify-end gap-3 pt-1.5 sm:pt-0 border-t border-purple-900/40 sm:border-0">
                            <span className="text-[11px] text-purple-300 font-medium sm:hidden">
                              سعر القطعة بهذه الفئة:
                            </span>
                            <div className="flex items-baseline gap-1">
                              <span
                                className={`text-base font-black ${
                                  isActive ? "text-emerald-300" : "text-white"
                                }`}
                              >
                                {tierPrice.toLocaleString()}
                              </span>
                              <span className="text-xs text-purple-300 font-medium">
                                {t.dinar}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 4. Wholesale Reference (If configured) */}
              {product.wholesalePrice > 0 &&
                product.wholesalePrice < product.retailPrice && (
                  <div className="flex items-center gap-2 text-xs text-purple-200 bg-purple-950/40 rounded-xl p-3 border border-purple-500/20 animate-slideUpFade [animation-delay:220ms] opacity-0 [animation-fill-mode:forwards]">
                    <span className="text-base">💼</span>
                    <span>
                      سعر الجملة المرجعي للوكلاء:{" "}
                      <strong className="text-emerald-400 font-black">
                        {product.wholesalePrice.toLocaleString()} {t.dinar}
                      </strong>
                    </span>
                  </div>
                )}
            </div>
          </div>

          {/* Sticky Thumb-Friendly Bottom Action Bar: Always reachable on mobile */}
          <div className="p-3 sm:p-4 bg-[#160d2e]/98 backdrop-blur-md border-t border-purple-700/40 sticky bottom-0 z-20 shadow-2xl animate-slideUpFade [animation-delay:260ms] opacity-0 [animation-fill-mode:forwards]">
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Quantity Stepper with Touch-Friendly Hit Targets */}
              <div className="flex items-center bg-[#21133f] rounded-2xl p-1 border border-purple-500/30 shadow-inner flex-shrink-0">
                <button
                  type="button"
                  onClick={() => adjustQty(-1)}
                  disabled={qty <= 1}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-purple-900/70 hover:bg-purple-800 text-white font-black text-lg flex items-center justify-center transition-all duration-150 hover:scale-105 active:scale-90 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="تقليل الكمية"
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
                  className="w-11 sm:w-13 text-center font-black text-base sm:text-lg bg-transparent text-white outline-none"
                  aria-label="الكمية المطلوبة"
                />
                <button
                  type="button"
                  onClick={() => adjustQty(1)}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-purple-900/70 hover:bg-purple-800 text-white font-black text-lg flex items-center justify-center transition-all duration-150 hover:scale-105 active:scale-90 cursor-pointer"
                  aria-label="زيادة الكمية"
                >
                  +
                </button>
              </div>

              {/* Add to Cart CTA Button */}
              <button
                type="button"
                onClick={handleAddToCart}
                disabled={addedSuccess}
                className={`flex-1 py-3 sm:py-3.5 px-4 rounded-2xl font-black text-sm sm:text-base text-white transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-xl hover:shadow-purple-500/30 cursor-pointer transform-gpu flex items-center justify-center gap-2 ${
                  addedSuccess
                    ? "bg-emerald-600 shadow-emerald-500/30 animate-popIn"
                    : "bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500"
                }`}
                aria-label={`إضافة ${qty} إلى السلة`}
              >
                {addedSuccess ? (
                  <span className="flex items-center gap-2 animate-popIn">
                    <span>✅</span>
                    <span>تمت الإضافة إلى السلة!</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-2 truncate">
                    <span>🛒</span>
                    <span className="truncate">
                      أضف {qty > 1 ? `${qty} قطع` : "للسلة"} • {totalPrice.toLocaleString()} {t.dinar}
                    </span>
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

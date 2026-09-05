"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { useSettings } from "@/lib/settings-context";
import { useData } from "@/lib/data-context";
import { useLang } from "@/lib/lang-context";
import { generateProductAltText, extractCategoryFromNotes } from "@/lib/seo";
import {
  buildTierBadgeText,
  resolveTierForQty,
  calculateTierPrice,
  DEFAULT_PRICING_CONFIG,
} from "@/lib/pricing-engine";
import type { Product } from "@/lib/types";

export interface ProductCardProps {
  product: Product;
  onEditProduct?: (product: Product) => void;
  onSelectProduct?: (product: Product) => void;
  onAddToCart?: (product: Product, quantity: number) => void;
  onToggleFavorite?: (product: Product) => void;
  isFavorite?: boolean;
  priorityImage?: boolean;
  selectedCategory?: string | null;
  cardQty?: number;
  onQtyChange?: (newQty: number) => void;
  isAdded?: boolean;
}

export default function ProductCard({
  product,
  onEditProduct,
  onSelectProduct,
  onAddToCart,
  onToggleFavorite,
  isFavorite = false,
  priorityImage = false,
  selectedCategory = null,
  cardQty: propCardQty,
  onQtyChange,
  isAdded = false,
}: ProductCardProps) {
  const { user, loading: authLoading } = useAuth();
  const { settings } = useSettings();
  const { getEffectiveTiers } = useData();
  const { t } = useLang();
  const theme = settings.roleThemes.customer;

  // Hydration safety check to prevent SSR / Client mismatch
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Local state for quantity if not controlled by parent
  const [internalQty, setInternalQty] = useState(1);
  const qty = propCardQty !== undefined ? propCardQty : internalQty;

  const handleQtyUpdate = (newQty: number) => {
    const validQty = Math.max(1, newQty);
    if (onQtyChange) {
      onQtyChange(validQty);
    } else {
      setInternalQty(validQty);
    }
  };

  // Strict Staff Role Validation Formula (Zero DOM leakage for non-staff)
  const isStaff = Boolean(
    mounted &&
      !authLoading &&
      user &&
      !user.isGuest &&
      !user.id?.startsWith("guest-") &&
      (user.role === "manager" || user.role === "admin")
  );

  // Dynamic pricing calculations
  const globalPricingConfig = settings.pricingTiers ?? DEFAULT_PRICING_CONFIG;
  const effectiveTiers = getEffectiveTiers(product.id, globalPricingConfig);
  const activeTier = resolveTierForQty(qty, effectiveTiers);
  const unitPrice = calculateTierPrice(product.retailPrice, activeTier);
  const hasDiscount = activeTier.discountPct > 0;
  const badgeText = buildTierBadgeText(effectiveTiers);

  const maxDiscountTier = effectiveTiers.reduce(
    (max, tier) => (tier.discountPct > max.discountPct ? tier : max),
    effectiveTiers[0]
  );
  const lowestTierPrice = calculateTierPrice(product.retailPrice, maxDiscountTier);
  const wholesalePriceVal =
    product.wholesalePrice > 0 && product.wholesalePrice < product.retailPrice
      ? product.wholesalePrice
      : lowestTierPrice < product.retailPrice
      ? lowestTierPrice
      : Math.round(product.retailPrice * 0.9);

  // SEO-optimized image alt text
  const productAlt = generateProductAltText(product, selectedCategory);

  return (
    <article
      className="group bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden hover:shadow-xl transition-all duration-300 flex flex-col justify-between relative max-w-full"
      dir="rtl"
      aria-label={`منتج: ${product.name}`}
    >
      {/* Product Image Box */}
      <div
        className="relative aspect-square overflow-hidden bg-gray-100 dark:bg-gray-800 cursor-pointer"
        onClick={() => onSelectProduct?.(product)}
      >
        {product.image ? (
          <Image
            src={product.image}
            alt={productAlt}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            priority={priorityImage}
            loading={priorityImage ? undefined : "lazy"}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-5xl text-gray-300"
            aria-hidden="true"
          >
            📦
          </div>
        )}

        {/* Administrative Control Gear Button (⚙️) — Strictly Isolated to Staff */}
        {isStaff && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onEditProduct?.(product);
            }}
            className="absolute top-2 left-2 z-20 p-2 text-gray-700 dark:text-gray-200 bg-white/80 dark:bg-gray-800/80 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 dark:hover:text-white backdrop-blur-md rounded-xl shadow-md border border-gray-200/50 dark:border-gray-700/50 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer flex items-center justify-center"
            title="تعديل المنتج (للإدارة فقط)"
            aria-label={`تعديل المنتج ${product.name}`}
          >
            <span className="text-base leading-none" aria-hidden="true">
              ⚙️
            </span>
          </button>
        )}

        {/* Detail View Hint Overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
          <span className="px-3 py-1.5 rounded-xl bg-white/90 dark:bg-gray-900/90 text-xs font-bold text-gray-700 dark:text-gray-200 shadow-lg backdrop-blur-sm">
            🔍 عرض التفاصيل
          </span>
        </div>

        {/* Tier Mode Discount Badge */}
        {hasDiscount && qty > 1 && (
          <div className="absolute top-2 right-2 z-10">
            <span className="px-2 py-0.5 rounded-lg text-[10px] font-extrabold bg-red-600 text-white shadow-md">
              -{activeTier.discountPct}%
            </span>
          </div>
        )}
      </div>

      {/* Card Body & Information */}
      <div className="p-3 sm:p-4 space-y-3 flex-1 flex flex-col justify-between">
        <div>
          <h3
            className="font-bold text-gray-900 dark:text-white text-sm leading-tight line-clamp-2 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            onClick={() => onSelectProduct?.(product)}
          >
            {product.name}
          </h3>
          {product.notes && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-1">
              {extractCategoryFromNotes(product.notes)}
            </p>
          )}
        </div>

        {/* Dual Price Display */}
        <div className="space-y-1.5">
          {qty === 1 || !hasDiscount ? (
            wholesalePriceVal < product.retailPrice ? (
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-xl sm:text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                  {wholesalePriceVal.toLocaleString()}
                </span>
                <span className="text-sm sm:text-base font-bold text-gray-400 dark:text-gray-500">
                  -
                </span>
                <span className="text-sm sm:text-base font-bold text-gray-600 dark:text-gray-300">
                  {product.retailPrice.toLocaleString()}
                </span>
                <span className="text-xs font-normal text-gray-400">{t.dinar}</span>
              </div>
            ) : (
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-xl sm:text-2xl font-extrabold text-blue-600 dark:text-blue-400">
                  {product.retailPrice.toLocaleString()}
                </span>
                <span className="text-xs font-normal text-gray-400">{t.dinar}</span>
              </div>
            )
          ) : (
            <div>
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-xl sm:text-2xl font-extrabold text-red-600 dark:text-red-400">
                  {unitPrice.toLocaleString()}
                </span>
                <span className="text-sm sm:text-base font-bold text-gray-400 dark:text-gray-500 line-through">
                  {product.retailPrice.toLocaleString()}
                </span>
                <span className="text-xs font-normal text-gray-400">{t.dinar}</span>
                <span className="px-1.5 py-0.5 rounded-lg text-[10px] font-extrabold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 leading-none">
                  -{activeTier.discountPct}% ({activeTier.label})
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-md">
                <span>إجمالي ({qty} قطع):</span>
                <span className="font-extrabold">
                  {(unitPrice * qty).toLocaleString()} {t.dinar}
                </span>
              </div>
            </div>
          )}

          <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed">
            {badgeText}
          </p>
        </div>

        {/* Quick Quantity Stepper & Action Controls */}
        <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-2">
          {/* Stepper */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-gray-400 flex-shrink-0">الكمية:</span>
            <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden flex-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleQtyUpdate(qty - 1);
                }}
                className="w-7 h-7 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 font-bold text-sm transition-colors flex-shrink-0 cursor-pointer"
                aria-label={`تقليل الكمية لـ ${product.name}`}
              >
                −
              </button>
              <span
                className="flex-1 text-center text-xs font-extrabold text-gray-900 dark:text-white"
                aria-live="polite"
              >
                {qty}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleQtyUpdate(qty + 1);
                }}
                className="w-7 h-7 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 font-bold text-sm transition-colors flex-shrink-0 cursor-pointer"
                aria-label={`زيادة الكمية لـ ${product.name}`}
              >
                +
              </button>
            </div>
          </div>

          {/* Action Row: Add to Cart + Wishlist Favorite Heart */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddToCart?.(product, qty);
              }}
              disabled={isAdded}
              className="flex-1 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:scale-100 shadow-md min-h-[40px] flex items-center justify-center gap-1 cursor-pointer"
              style={{ backgroundColor: isAdded ? "#10b981" : theme.primary }}
              aria-label={`إضافة ${product.name} إلى السلة`}
            >
              {isAdded ? (
                <span>✓ تم الإضافة</span>
              ) : (
                <span>
                  أضف {qty > 1 ? `${qty} قطع` : ""} للسلة 🛒
                  {hasDiscount && (
                    <span className="mr-1 opacity-80">(-{activeTier.discountPct}%)</span>
                  )}
                </span>
              )}
            </button>

            {onToggleFavorite && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onToggleFavorite(product);
                }}
                className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all transform active:scale-125 border shrink-0 cursor-pointer ${
                  isFavorite
                    ? "bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800/80 text-rose-600 dark:text-rose-400 scale-105 shadow-sm shadow-rose-100 dark:shadow-none"
                    : "bg-gray-50 dark:bg-gray-800/80 border-gray-200 dark:border-gray-700 text-gray-400 hover:text-rose-500 hover:bg-rose-50/50 hover:border-rose-200"
                }`}
                title={isFavorite ? "إزالة من المفضلة" : "إضافة للمفضلة"}
                aria-label={
                  isFavorite
                    ? `إزالة ${product.name} من المفضلة`
                    : `إضافة ${product.name} للمفضلة`
                }
                aria-pressed={isFavorite}
              >
                {isFavorite ? "❤️" : "🤍"}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

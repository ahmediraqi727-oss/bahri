"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import type { Product } from "@/lib/types";
import { useCart } from "@/lib/cart-context";
import { useData } from "@/lib/data-context";
import { lookupByBarcode } from "@/lib/barcode-service";
import {
  buildTierBadgeText,
  resolveTierForQty,
  calculateTierPrice,
  DEFAULT_PRICING_CONFIG,
} from "@/lib/pricing-engine";
import { useSettings } from "@/lib/settings-context";

interface ScannerProductModalProps {
  scannedCode: string | null;
  onClose: () => void;
  onAddedToCart?: (product: Product, qty: number) => void;
  onRequestLink?: (scannedCode: string) => void;
}

/**
 * ScannerProductModal — POS-style product display triggered by any barcode scan.
 *
 * Smart Queue Logic:
 *   If a new barcode scan arrives while this modal is open,
 *   the current product is automatically added to cart at the specified quantity,
 *   and the modal transitions to display the new product.
 */
export default function ScannerProductModal({
  scannedCode,
  onClose,
  onAddedToCart,
  onRequestLink,
}: ScannerProductModalProps) {
  const { products, lookupProductByBarcode, getEffectiveTiers } = useData();
  const { addItem } = useCart();
  const { settings } = useSettings();
  const globalPricingConfig = settings.pricingTiers ?? DEFAULT_PRICING_CONFIG;

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [qty, setQty] = useState(1);
  const [addedFlash, setAddedFlash] = useState(false);
  const [slideOut, setSlideOut] = useState(false);

  // Smart Queue: holds next product while current is shown
  const nextProductRef = useRef<Product | null>(null);
  const currentCodeRef = useRef<string | null>(null);

  // ─── Load product when scannedCode changes ────────────────────────────────

  const loadProduct = useCallback(async (code: string) => {
    if (!code) return;
    setLoading(true);
    setNotFound(false);
    setQty(1);

    // 1. Instant in-memory lookup (O(1))
    let found = lookupProductByBarcode(code);

    // 2. DB fallback if not in memory
    if (!found) {
      found = await lookupByBarcode(code);
    }

    setProduct(found);
    setNotFound(!found);
    setLoading(false);
  }, [lookupProductByBarcode]);

  useEffect(() => {
    if (!scannedCode) {
      setProduct(null); setNotFound(false); setLoading(false);
      currentCodeRef.current = null;
      return;
    }
    currentCodeRef.current = scannedCode;
    loadProduct(scannedCode);
  }, [scannedCode, loadProduct]);

  // ─── Smart Queue: listen for new hardware scans while modal is open ───────

  useEffect(() => {
    if (!scannedCode) return; // Only queue when modal is open

    const handleNewScan = async (e: Event) => {
      const newCode = (e as CustomEvent<{ code: string }>).detail?.code;
      if (!newCode || newCode === currentCodeRef.current) return;

      // Auto-add current product to cart before transitioning
      if (product) {
        addCurrentToCart();
      }

      // Slide-out animation then load next
      setSlideOut(true);
      setTimeout(async () => {
        setSlideOut(false);
        currentCodeRef.current = newCode;
        await loadProduct(newCode);
      }, 300);
    };

    // Also handle the unified barcode event (from BarcodeScanner component)
    const handleUnifiedScan = async (e: Event) => {
      const newCode = (e as CustomEvent<{ code: string }>).detail?.code;
      if (!newCode || newCode === currentCodeRef.current) return;
      if (product) addCurrentToCart();
      setSlideOut(true);
      setTimeout(async () => {
        setSlideOut(false);
        currentCodeRef.current = newCode;
        await loadProduct(newCode);
      }, 300);
    };

    window.addEventListener("barcode_hardware_scanned", handleNewScan);
    window.addEventListener("barcode_scanned", handleUnifiedScan);
    return () => {
      window.removeEventListener("barcode_hardware_scanned", handleNewScan);
      window.removeEventListener("barcode_scanned", handleUnifiedScan);
    };
  }, [scannedCode, product]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Add to Cart ──────────────────────────────────────────────────────────

  const addCurrentToCart = useCallback(() => {
    if (!product) return;
    const tiers = getEffectiveTiers(product.id, globalPricingConfig);
    addItem({
      productId: product.id,
      name: product.name,
      image: product.image,
      retailPrice: product.retailPrice,
      wholesalePrice: product.wholesalePrice,
      quantity: qty,
      tiers,
    });
    onAddedToCart?.(product, qty);
  }, [product, qty, getEffectiveTiers, globalPricingConfig, addItem, onAddedToCart]);

  const handleAddAndClose = () => {
    addCurrentToCart();
    setAddedFlash(true);
    setTimeout(() => {
      setAddedFlash(false);
      onClose();
    }, 600);
  };

  // ─── Pricing display ──────────────────────────────────────────────────────

  const tiers = product ? getEffectiveTiers(product.id, globalPricingConfig) : [];
  const resolvedTier = product ? resolveTierForQty(qty, tiers) : null;
  const displayPrice = product && resolvedTier
    ? calculateTierPrice(product.retailPrice, resolvedTier)
    : product?.retailPrice ?? 0;
  const tierBadge = product ? buildTierBadgeText(tiers) : "";

  if (!scannedCode) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" dir="rtl">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />

      {/* Modal */}
      <div
        className={`relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-gray-200 dark:border-gray-800 transition-all duration-300 ${
          slideOut ? "opacity-0 translate-y-4 scale-95" : "opacity-100 translate-y-0 scale-100"
        } ${addedFlash ? "ring-4 ring-green-400 ring-offset-2" : ""}`}
      >

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 px-6">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-gray-500 dark:text-gray-400 text-sm">جاري البحث عن المنتج...</p>
            <p className="text-gray-400 text-xs mt-1 font-mono">{scannedCode}</p>
          </div>
        )}

        {/* Not Found State */}
        {!loading && notFound && (
          <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
            <span className="text-5xl mb-3 animate-bounce">🔍</span>
            <h3 className="font-extrabold text-gray-900 dark:text-white text-lg mb-1">
              لم يُعثر على المنتج
            </h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">
              الكود الممسوح غير مرتبط بأي منتج حالياً
            </p>
            <p className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 px-3 py-1.5 rounded-xl mb-6 tracking-wide select-all">
              📷 {scannedCode}
            </p>

            <div className="flex items-center gap-3 w-full">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-sm transition-all"
              >
                إغلاق
              </button>
              {onRequestLink && (
                <button
                  onClick={() => {
                    const code = scannedCode;
                    onClose();
                    if (code) onRequestLink(code);
                  }}
                  className="flex-[1.5] py-2.5 bg-gradient-to-l from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-extrabold text-sm shadow-lg transition-all flex items-center justify-center gap-1.5 active:scale-95"
                >
                  <span>🔗</span>
                  <span>إدخال / ربط بمنتج</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Product Found State */}
        {!loading && product && (
          <>
            {/* Product Image */}
            <div className="relative h-48 bg-gradient-to-b from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-850">
              {product.image ? (
                <Image
                  src={product.image}
                  alt={product.name}
                  fill
                  sizes="400px"
                  className="object-contain p-4"
                  priority
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-6xl opacity-20">
                  📦
                </div>
              )}

              {/* Scanned Code Badge */}
              <div className="absolute top-3 right-3 bg-black/60 text-white text-[10px] font-mono px-2 py-1 rounded-lg backdrop-blur-sm">
                📷 {scannedCode}
              </div>

              {/* Stock Badge */}
              <div className={`absolute top-3 left-3 px-2 py-1 rounded-lg text-[10px] font-extrabold ${
                product.stock > 10
                  ? "bg-green-500 text-white"
                  : product.stock > 0
                  ? "bg-amber-500 text-white"
                  : "bg-red-500 text-white"
              }`}>
                {product.stock > 0 ? `متوفر: ${product.stock}` : "نفد المخزون"}
              </div>
            </div>

            {/* Product Info */}
            <div className="p-5">
              <h3 className="font-extrabold text-gray-900 dark:text-white text-base leading-tight mb-1">
                {product.name}
              </h3>

              {/* Price Display */}
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-2xl font-extrabold text-blue-600 dark:text-blue-400">
                  {displayPrice.toLocaleString()} د.ع
                </span>
                {resolvedTier && resolvedTier.discountPct > 0 && (
                  <span className="text-sm line-through text-gray-400">
                    {product.retailPrice.toLocaleString()}
                  </span>
                )}
              </div>
              {tierBadge && (
                <span className="inline-block bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-xs font-bold px-2 py-0.5 rounded-full mb-3">
                  {tierBadge}
                </span>
              )}

              {/* Quantity Stepper */}
              <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-2xl p-3 mb-4">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">الكمية</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="w-9 h-9 rounded-xl bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-xl font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors flex items-center justify-center"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={product.stock || 999}
                    value={qty}
                    onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-14 text-center text-lg font-extrabold text-gray-900 dark:text-white bg-transparent border-b-2 border-blue-500 focus:outline-none"
                  />
                  <button
                    onClick={() => setQty((q) => q + 1)}
                    className="w-9 h-9 rounded-xl bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-xl font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
                <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                  = {(displayPrice * qty).toLocaleString()} د.ع
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-3 rounded-2xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold text-sm transition-all"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleAddAndClose}
                  disabled={product.stock <= 0}
                  className="flex-[2] py-3 rounded-2xl bg-gradient-to-l from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg flex items-center justify-center gap-2"
                >
                  <span>🛒</span>
                  <span>أضف للسلة</span>
                </button>
              </div>

              {/* Smart Queue hint */}
              <p className="text-center text-xs text-gray-400 mt-3">
                💡 امسح منتجاً آخر لإضافته تلقائياً والانتقال للتالي
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

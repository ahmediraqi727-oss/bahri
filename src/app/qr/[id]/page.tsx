"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/cart-context";
import { useFavorites } from "@/contexts/FavoritesContext";
import { useData } from "@/lib/data-context";
import { Product } from "@/lib/types";
import { lookupByQROrId } from "@/lib/barcode-service";
import {
  resolveTierForQty,
  calculateTierPrice,
  DEFAULT_PRICING_CONFIG,
} from "@/lib/pricing-engine";

export default function SmartQRProductPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { addItem, itemCount } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { getEffectiveTiers } = useData();

  const rawId = (params?.id as string) || "";
  const decodedId = useMemo(() => {
    try {
      return decodeURIComponent(rawId).trim();
    } catch {
      return rawId.trim();
    }
  }, [rawId]);

  const [product, setProduct] = useState<Product | null>(null);
  const [productLoading, setProductLoading] = useState<boolean>(true);
  const [qty, setQty] = useState<number>(1);
  const [addedToast, setAddedToast] = useState<boolean>(false);
  const [favLoading, setFavLoading] = useState<boolean>(false);

  // 1. Staff / Manager / Admin Detection & Redirection
  const isStaff = useMemo(() => {
    if (!user || user.isGuest) return false;
    const role = (user.role || "").toLowerCase();
    return role === "admin" || role === "manager" || role === "staff";
  }, [user]);

  useEffect(() => {
    if (authLoading) return;

    if (isStaff && decodedId) {
      // Redirect staff directly to dashboard scanner edit modal
      router.replace(`/dashboard/scanner?edit=${encodeURIComponent(decodedId)}`);
    }
  }, [authLoading, isStaff, decodedId, router]);

  // 2. Fetch Product for External / Unauthenticated Visitors
  useEffect(() => {
    if (authLoading || isStaff) return;

    let isMounted = true;
    setProductLoading(true);

    lookupByQROrId(decodedId)
      .then((data) => {
        if (isMounted) {
          setProduct(data);
          setProductLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load QR product details:", err);
        if (isMounted) {
          setProduct(null);
          setProductLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [authLoading, isStaff, decodedId]);

  // 3. Pricing Engine Calculations
  const tiers = useMemo(() => {
    if (!product) return [];
    return getEffectiveTiers ? getEffectiveTiers(product.id, DEFAULT_PRICING_CONFIG) : [];
  }, [product, getEffectiveTiers]);

  const activeTier = useMemo(() => resolveTierForQty(qty, tiers), [qty, tiers]);
  const unitPrice = useMemo(
    () => calculateTierPrice(product?.retailPrice ?? 0, activeTier),
    [product?.retailPrice, activeTier]
  );
  const totalPrice = useMemo(() => unitPrice * qty, [unitPrice, qty]);

  const isFav = product ? isFavorite(product.id) : false;

  const handleAddToCart = useCallback(() => {
    if (!product) return;
    addItem({
      productId: product.id,
      name: product.name,
      image: product.image,
      retailPrice: product.retailPrice,
      wholesalePrice: product.wholesalePrice,
      quantity: qty,
      tiers: tiers,
    });

    setAddedToast(true);
    setTimeout(() => setAddedToast(false), 3000);
  }, [product, addItem, qty, tiers]);

  const handleToggleFav = useCallback(async () => {
    if (!product || favLoading) return;
    setFavLoading(true);
    try {
      await toggleFavorite(product.id);
    } catch (err) {
      console.error("Failed to toggle favorite:", err);
    } finally {
      setFavLoading(false);
    }
  }, [product, favLoading, toggleFavorite]);

  // ── Render State 1: Auth Loading or Redirecting Staff ───────────────────────
  if (authLoading || (isStaff && decodedId)) {
    return (
      <div className="min-h-screen bg-[#130f26] text-white flex flex-col items-center justify-center p-4 dir-rtl">
        <div className="bg-[#1e1936]/80 border border-purple-500/20 backdrop-blur-xl p-8 rounded-3xl max-w-md w-full text-center shadow-2xl flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full border-4 border-purple-500/30 border-t-purple-500 animate-spin flex items-center justify-center">
            <span className="text-xl">⚡</span>
          </div>
          <h2 className="text-xl font-bold text-white">
            {isStaff ? "جاري التوجيه إلى لوحة الإدارة..." : "جاري التحقق من الرمز..."}
          </h2>
          <p className="text-sm text-purple-200/70">
            {isStaff
              ? "تم التعرف على صلاحيات الحساب. يتم الآن فتح واجهة التحكم بالمنتج."
              : "يرجى الانتظار لحظة أثناء استعادة بيانات المنتج..."}
          </p>
        </div>
      </div>
    );
  }

  // ── Render State 2: Product Loading Skeleton ───────────────────────────────
  if (productLoading) {
    return (
      <div className="min-h-screen bg-[#130f26] text-white p-4 md:p-8 dir-rtl font-sans">
        <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
          {/* Header Skeleton */}
          <div className="h-16 bg-white/5 rounded-2xl border border-white/10" />

          {/* Main Card Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-[#1e1936]/80 p-6 md:p-8 rounded-3xl border border-white/10">
            <div className="h-72 md:h-96 bg-white/5 rounded-2xl" />
            <div className="space-y-4">
              <div className="h-8 bg-white/10 rounded-xl w-3/4" />
              <div className="h-5 bg-white/5 rounded-lg w-1/2" />
              <div className="h-12 bg-purple-500/10 rounded-xl w-2/3" />
              <div className="h-24 bg-white/5 rounded-xl" />
              <div className="h-12 bg-purple-600/30 rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Render State 3: Missing / 404 Product ──────────────────────────────────
  if (!product) {
    return (
      <div className="min-h-screen bg-[#130f26] text-white flex flex-col items-center justify-center p-4 dir-rtl font-sans">
        <div className="bg-[#1e1936]/90 border border-red-500/20 backdrop-blur-xl p-8 rounded-3xl max-w-lg w-full text-center shadow-2xl space-y-6">
          <div className="w-20 h-20 bg-red-500/10 border border-red-500/30 rounded-3xl mx-auto flex items-center justify-center text-4xl shadow-inner">
            📦
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-extrabold text-white">
              عذراً، هذا المنتج غير متوفر!
            </h1>
            <p className="text-sm text-purple-200/80 leading-relaxed">
              رمز الباركود أو الـ QR الممسوح غير متاح حالياً في قاعدة البيانات. قد يكون المنتج قد تم حذفه أو تعديل ترميزه.
            </p>
          </div>

          <div className="bg-white/5 rounded-2xl p-4 text-xs text-purple-300 font-mono border border-white/10 break-all dir-ltr">
            ID / Code: {decodedId || "غير محدد"}
          </div>

          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 w-full py-3.5 px-6 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-2xl transition-all duration-200 shadow-lg shadow-purple-600/30 active:scale-95"
          >
            <span>العودة إلى رئيسية متجر أحمد بحري</span>
            <span className="text-lg">←</span>
          </Link>
        </div>
      </div>
    );
  }

  // ── Render State 4: High-Conversion Product Landing Page ────────────────────
  const isOutOfStock = product.stock <= 0;

  return (
    <div className="min-h-screen bg-[#130f26] text-white p-4 md:p-8 dir-rtl font-sans relative overflow-x-hidden">
      {/* Background Decorative Glow */}
      <div className="fixed top-0 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Toast Notification Banner */}
      {addedToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-white font-bold text-sm px-6 py-3 rounded-2xl shadow-2xl border border-emerald-400/40 flex items-center gap-3 animate-bounce">
          <span className="text-xl">✅</span>
          <span>تمت إضافة المنتج إلى السلة بنجاح!</span>
        </div>
      )}

      <div className="max-w-4xl mx-auto space-y-6 relative z-10">
        {/* Header Navigation Bar */}
        <header className="bg-[#1e1936]/80 backdrop-blur-xl border border-purple-500/20 p-4 rounded-2xl flex items-center justify-between shadow-xl">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-lg group-hover:scale-105 transition-transform">
              أب
            </div>
            <div>
              <h1 className="font-extrabold text-base text-white group-hover:text-purple-300 transition-colors">
                متجر أحمد بحري
              </h1>
              <p className="text-xs text-purple-300/70">قطع غيار الدراجات والكهربائيات</p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-xs font-bold text-purple-200 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-3.5 py-2 rounded-xl transition-all"
            >
              تصفح الكتالوج 🛍️
            </Link>

            {itemCount > 0 && (
              <div className="bg-purple-600/30 border border-purple-400/40 text-purple-200 text-xs font-extrabold px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                <span>🛒 السلة</span>
                <span className="bg-purple-500 text-white px-1.5 py-0.5 rounded-full text-[10px]">
                  {itemCount}
                </span>
              </div>
            )}
          </div>
        </header>

        {/* Main Product Card */}
        <main className="bg-[#1e1936]/90 backdrop-blur-xl border border-purple-500/20 rounded-3xl p-6 md:p-8 shadow-2xl grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Left Column: Product Image Gallery */}
          <div className="space-y-4 flex flex-col items-center">
            <div className="relative w-full aspect-square bg-[#130f26]/80 rounded-2xl border border-white/10 overflow-hidden group shadow-inner flex items-center justify-center p-4">
              {product.image ? (
                <Image
                  src={product.image}
                  alt={product.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-contain p-4 group-hover:scale-105 transition-transform duration-300"
                  priority
                />
              ) : (
                <div className="text-6xl text-purple-400/30 font-black">⚙️</div>
              )}

              {/* Watermark Overlay Badge */}
              <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-md text-[10px] text-purple-200 font-semibold px-2.5 py-1 rounded-lg border border-white/10">
                أحمد بحري - كركوك 🏍️
              </div>

              {/* Favorite Heart Toggle Button */}
              <button
                onClick={handleToggleFav}
                disabled={favLoading}
                className={`absolute top-3 left-3 p-3 rounded-full backdrop-blur-md border transition-all duration-200 ${
                  isFav
                    ? "bg-red-500/20 border-red-500/50 text-red-400 scale-110 shadow-lg shadow-red-500/20"
                    : "bg-black/40 border-white/10 text-white/70 hover:text-white hover:bg-black/60"
                }`}
                title={isFav ? "إزالة من المفضلة" : "إضافة للمفضلة"}
              >
                <span className="text-xl leading-none">{isFav ? "❤️" : "🤍"}</span>
              </button>
            </div>

            {/* Badges Bar */}
            <div className="flex flex-wrap gap-2 w-full justify-center">
              {(product as Record<string, any>).category && (
                <span className="text-xs bg-purple-500/10 text-purple-300 border border-purple-500/30 px-3 py-1 rounded-full font-medium">
                  {(product as Record<string, any>).category}
                </span>
              )}
              {(product as Record<string, any>).sku && (
                <span className="text-xs bg-white/5 text-purple-200/80 border border-white/10 px-3 py-1 rounded-full font-mono">
                  SKU: {(product as Record<string, any>).sku}
                </span>
              )}
              {product.barcode && (
                <span className="text-xs bg-white/5 text-purple-200/80 border border-white/10 px-3 py-1 rounded-full font-mono">
                  📊 {product.barcode}
                </span>
              )}
            </div>
          </div>

          {/* Right Column: Product Details & Purchase Controls */}
          <div className="space-y-6 flex flex-col justify-between">
            <div className="space-y-4">
              {/* Stock Status Badge */}
              <div>
                {isOutOfStock ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-1 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                    غير متوفر في المخزن حالياً
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    متوفر في المخزن ({product.stock} قطعة)
                  </span>
                )}
              </div>

              {/* Title */}
              <h1 className="text-2xl md:text-3xl font-black text-white leading-tight">
                {product.name}
              </h1>

              {/* Description / Notes if available */}
              {product.notes && (
                <p className="text-sm text-purple-200/70 leading-relaxed bg-white/5 p-3 rounded-xl border border-white/5">
                  {product.notes}
                </p>
              )}

              {/* Pricing Section (Iraqi Dinars IQD) */}
              <div className="bg-gradient-to-br from-purple-900/40 to-indigo-950/40 border border-purple-500/30 p-5 rounded-2xl space-y-3 shadow-inner">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-purple-300 font-semibold">السعر الحالي:</span>
                  <div className="text-left dir-ltr">
                    <span className="text-3xl font-black text-amber-400">
                      {unitPrice.toLocaleString("ar-IQ")}
                    </span>
                    <span className="text-xs font-bold text-amber-300/80 mr-1">د.ع</span>
                  </div>
                </div>

                {activeTier.discountPct > 0 && (
                  <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-xl flex items-center justify-between font-semibold">
                    <span>خصم كمية الجملة ({activeTier.discountPct}%):</span>
                    <span>توفير {((product.retailPrice - unitPrice) * qty).toLocaleString("ar-IQ")} د.ع</span>
                  </div>
                )}

                {/* Pricing Tier breakdown table */}
                {tiers.length > 0 && (
                  <div className="pt-2 border-t border-purple-500/20 space-y-1.5">
                    <span className="text-[11px] text-purple-300/70 font-semibold">شرائح تخفيض الكمية:</span>
                    <div className="grid grid-cols-2 gap-2">
                      {tiers.map((t, idx) => {
                        const isCurrent = activeTier.minQty === t.minQty;
                        return (
                          <div
                            key={idx}
                            className={`text-[11px] p-2 rounded-xl border flex justify-between items-center transition-all ${
                              isCurrent
                                ? "bg-purple-600/40 border-purple-400 text-white font-bold"
                                : "bg-white/5 border-white/5 text-purple-300/70"
                            }`}
                          >
                            <span>{t.label} ({t.minQty}+ قطعة)</span>
                            <span className="text-amber-300 font-mono">
                              {calculateTierPrice(product.retailPrice, t).toLocaleString("ar-IQ")} د.ع
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Quantity Selector */}
              <div className="space-y-2">
                <label className="text-xs text-purple-300 font-semibold block">الكمية المطلوبة:</label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center bg-white/5 border border-white/10 rounded-2xl p-1 shadow-inner">
                    <button
                      onClick={() => setQty((q) => Math.max(1, q - 1))}
                      disabled={qty <= 1}
                      className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 text-white font-black text-lg disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    >
                      -
                    </button>
                    <span className="w-14 text-center text-lg font-black text-white font-mono">
                      {qty}
                    </span>
                    <button
                      onClick={() => setQty((q) => Math.min(product.stock || 999, q + 1))}
                      disabled={qty >= (product.stock || 999)}
                      className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 text-white font-black text-lg disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    >
                      +
                    </button>
                  </div>

                  <div className="text-xs text-purple-300/80">
                    الإجمالي:{" "}
                    <span className="text-amber-400 font-black text-base font-mono">
                      {totalPrice.toLocaleString("ar-IQ")}
                    </span>{" "}
                    د.ع
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3 pt-4 border-t border-purple-500/20">
              <button
                onClick={handleAddToCart}
                disabled={isOutOfStock}
                className="w-full py-4 px-6 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-base rounded-2xl shadow-xl shadow-purple-600/30 disabled:opacity-40 disabled:hover:from-purple-600 active:scale-98 transition-all flex items-center justify-center gap-3"
              >
                <span className="text-xl">🛒</span>
                <span>أضف إلى السلة ({totalPrice.toLocaleString("ar-IQ")} د.ع)</span>
              </button>

              <Link
                href="/"
                className="w-full py-3 px-6 bg-white/5 hover:bg-white/10 border border-white/10 text-purple-200 hover:text-white font-bold text-xs rounded-2xl transition-all text-center block"
              >
                تصفح كافة المنتجات وقطع الغيار في المتجر ←
              </Link>
            </div>
          </div>
        </main>

        {/* Footer Banner */}
        <footer className="text-center py-4 text-xs text-purple-300/60 border-t border-white/5">
          متجر أحمد بحري لقطع غيار الدراجات النارية والكهربائية • كركوك ، العراق 🇮🇶
        </footer>
      </div>
    </div>
  );
}

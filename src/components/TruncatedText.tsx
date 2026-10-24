"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

export interface TooltipProductData {
  name: string;
  category?: string;
  retailPrice?: number;
  wholesalePrice?: number;
}

interface TruncatedTextProps {
  text: string | number | null | undefined;
  tooltipText?: string;
  productData?: TooltipProductData;
  className?: string;
  maxWidthClass?: string;
  as?: "span" | "p" | "div" | "h3" | "h4";
  children?: React.ReactNode;
}

const LONG_PRESS_DURATION_MS = 450;
const TOUCH_MOVE_THRESHOLD_PX = 8;
const MOBILE_AUTO_HIDE_MS = 4000;

/**
 * TruncatedText — مكون عرض النصوص في سطر أفقي واحد مع اقتطاع أنيق (...)
 * وتلميح مخصص بلون المتجر البنفسجي الملكي (#5b21b6):
 * - يظهر فقط عندما يكون النص مقتطعاً فعلياً (scrollWidth > clientWidth) لمنع التكرار البصري.
 * - يعرض بطاقة بيانات المنتج (الاسم، التصنيف، سعر المفرد، سعر الجملة بالدينار العراقي) عند تمرير productData.
 * - يدعم تمرير الماوس على الحاسوب، واللمس المطول (Long-Press) فقط على الجوال لمنع الظهور العشوائي أثناء التمرير.
 */
export default function TruncatedText({
  text,
  tooltipText,
  productData,
  className = "",
  maxWidthClass = "max-w-full",
  as: Component = "span",
  children,
}: TruncatedTextProps) {
  const displayValue = text !== null && text !== undefined ? String(text) : "";
  const fullTooltip = (tooltipText ?? displayValue).trim();

  const elRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; placeAbove: boolean }>({
    top: 0,
    left: 0,
    placeAbove: true,
  });
  const [mounted, setMounted] = useState(false);

  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastTouchTimeRef = useRef<number>(0);

  const clearTimers = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  /**
   * التحقق مما إذا كان النص مقتطعاً فعلياً داخل الحاوية
   */
  const checkIsTruncated = useCallback((): boolean => {
    const el = elRef.current;
    if (!el) return false;
    return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
  }, []);

  const updatePosition = useCallback(() => {
    const el = elRef.current;
    if (!el || typeof window === "undefined") return;
    const rect = el.getBoundingClientRect();
    const minTopSpace = productData ? 145 : 76;
    const placeAbove = rect.top > minTopSpace;
    const top = placeAbove ? rect.top - 10 : rect.bottom + 10;
    const centerX = rect.left + rect.width / 2;
    const halfMaxCard = productData ? 150 : 130;
    const clampedLeft = Math.max(
      halfMaxCard + 12,
      Math.min(window.innerWidth - halfMaxCard - 12, centerX)
    );
    setCoords({ top, left: clampedLeft, placeAbove });
  }, [productData]);

  // ─── Desktop Mouse Hover ────────────────────────────────────────────────────
  const handleMouseEnter = () => {
    // تجاهل أحداث الماوس الوهمية التي يطلقها المتصفح مباشرة بعد اللمس على الجوال
    if (Date.now() - lastTouchTimeRef.current < 800) return;
    if (!fullTooltip && !productData?.name) return;
    if (!checkIsTruncated()) return;

    clearTimers();
    updatePosition();
    setOpen(true);
  };

  const handleMouseLeave = () => {
    if (Date.now() - lastTouchTimeRef.current < 800) return;
    clearTimers();
    setOpen(false);
  };

  // ─── Mobile Long-Press Gesture ──────────────────────────────────────────────
  const handleTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    lastTouchTimeRef.current = Date.now();
    if (!fullTooltip && !productData?.name) return;
    if (!checkIsTruncated()) return;

    const touch = e.touches[0];
    if (!touch) return;
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }

    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      if (!checkIsTruncated()) return;
      updatePosition();
      setOpen(true);

      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        setOpen(false);
      }, MOBILE_AUTO_HIDE_MS);
    }, LONG_PRESS_DURATION_MS);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLElement>) => {
    if (!touchStartPosRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;

    const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);

    // إذا حرك المستخدم إصبعه للتمرير، نلغي مؤقت اللمس المطول فوراً
    if (dx > TOUCH_MOVE_THRESHOLD_PX || dy > TOUCH_MOVE_THRESHOLD_PX) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      touchStartPosRef.current = null;
    }
  };

  const handleTouchEndOrCancel = () => {
    lastTouchTimeRef.current = Date.now();
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartPosRef.current = null;
  };

  useEffect(() => {
    if (!open) return;
    const handleDismiss = () => setOpen(false);
    const handleOutsideTouch = (ev: TouchEvent) => {
      if (elRef.current && ev.target instanceof Node && !elRef.current.contains(ev.target)) {
        setOpen(false);
      }
    };

    window.addEventListener("scroll", handleDismiss, true);
    window.addEventListener("resize", handleDismiss);
    window.addEventListener("touchstart", handleOutsideTouch, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleDismiss, true);
      window.removeEventListener("resize", handleDismiss);
      window.removeEventListener("touchstart", handleOutsideTouch);
    };
  }, [open]);

  const hasContent = Boolean(fullTooltip.length > 0 || productData?.name);

  return (
    <>
      <Component
        ref={(node: HTMLElement | null) => {
          elRef.current = node;
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEndOrCancel}
        onTouchCancel={handleTouchEndOrCancel}
        onContextMenu={(e: React.MouseEvent) => {
          if (open) e.preventDefault();
        }}
        className={`block truncate whitespace-nowrap overflow-hidden text-ellipsis min-w-0 select-none sm:select-text ${maxWidthClass} ${className}`}
      >
        {children !== undefined ? children : displayValue}
      </Component>

      {mounted &&
        open &&
        hasContent &&
        createPortal(
          <div
            dir="rtl"
            role="tooltip"
            style={{
              position: "fixed",
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              transform: coords.placeAbove
                ? "translate(-50%, -100%)"
                : "translate(-50%, 0)",
              zIndex: 9999,
            }}
            className="pointer-events-none w-max max-w-[min(92vw,340px)] rounded-2xl bg-gradient-to-br from-[#5b21b6] via-[#3b156e] to-[#241046] text-white shadow-[0_14px_36px_rgba(91,33,182,0.65)] border border-purple-400/50 animate-fadeIn overflow-hidden"
          >
            {productData ? (
              <div className="p-3 space-y-2 text-right">
                {/* الاسم الكامل للمنتج */}
                <div className="flex items-start gap-2 border-b border-purple-400/25 pb-2">
                  <span className="text-sm shrink-0 mt-0.5">📦</span>
                  <p className="text-xs font-extrabold text-white leading-relaxed break-words">
                    {productData.name || fullTooltip}
                  </p>
                </div>

                {/* التصنيف / القسم */}
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-purple-200/80 font-medium">التصنيف:</span>
                  <span className="px-2 py-0.5 rounded-lg bg-purple-950/70 border border-purple-400/35 text-purple-100 font-bold truncate max-w-[200px]">
                    📂 {productData.category || "جميع الاقسام"}
                  </span>
                </div>

                {/* سعرا المفرد والجملة بالدينار العراقي */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-purple-400/25">
                  <div className="bg-purple-950/55 rounded-xl px-2.5 py-1.5 border border-purple-400/25">
                    <span className="block text-[10px] text-purple-200/80 font-medium">
                      سعر المفرد
                    </span>
                    <span className="text-xs font-black text-emerald-300 font-mono tabular-nums whitespace-nowrap">
                      {typeof productData.retailPrice === "number"
                        ? `${productData.retailPrice.toLocaleString("en-US")} د.ع`
                        : "—"}
                    </span>
                  </div>

                  <div className="bg-purple-950/55 rounded-xl px-2.5 py-1.5 border border-purple-400/25">
                    <span className="block text-[10px] text-purple-200/80 font-medium">
                      سعر الجملة
                    </span>
                    <span className="text-xs font-extrabold text-amber-300 font-mono tabular-nums whitespace-nowrap">
                      {typeof productData.wholesalePrice === "number"
                        ? `${productData.wholesalePrice.toLocaleString("en-US")} د.ع`
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-3.5 py-2 text-xs font-bold leading-relaxed break-words">
                {fullTooltip}
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

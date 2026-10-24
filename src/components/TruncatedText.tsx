"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

interface TruncatedTextProps {
  text: string | number | null | undefined;
  tooltipText?: string;
  className?: string;
  maxWidthClass?: string;
  as?: "span" | "p" | "div" | "h3" | "h4";
  children?: React.ReactNode;
}

/**
 * TruncatedText — مكون عرض النصوص في سطر أفقي واحد مع اقتطاع أنيق (...)
 * وتلميح مخصص بلون المتجر البنفسجي الملكي (#5b21b6) يعمل عند تمرير الماوس أو اللمس على الجوال.
 */
export default function TruncatedText({
  text,
  tooltipText,
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

  useEffect(() => {
    setMounted(true);
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const updatePosition = useCallback(() => {
    const el = elRef.current;
    if (!el || typeof window === "undefined") return;
    const rect = el.getBoundingClientRect();
    const placeAbove = rect.top > 72;
    const top = placeAbove ? rect.top - 8 : rect.bottom + 8;
    const centerX = rect.left + rect.width / 2;
    const clampedLeft = Math.max(16, Math.min(window.innerWidth - 16, centerX));
    setCoords({ top, left: clampedLeft, placeAbove });
  }, []);

  const handleMouseEnter = () => {
    if (!fullTooltip) return;
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    updatePosition();
    setOpen(true);
  };

  const handleMouseLeave = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setOpen(false);
  };

  const handleTouchStart = () => {
    if (!fullTooltip) return;
    updatePosition();
    setOpen(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setOpen(false);
    }, 2600);
  };

  useEffect(() => {
    if (!open) return;
    const handleScrollOrResize = () => setOpen(false);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [open]);

  return (
    <>
      <Component
        ref={(node: any) => {
          elRef.current = node;
        }}
        title={fullTooltip || undefined}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        className={`block truncate whitespace-nowrap overflow-hidden text-ellipsis min-w-0 ${maxWidthClass} ${className}`}
      >
        {children !== undefined ? children : displayValue}
      </Component>

      {mounted &&
        open &&
        fullTooltip.length > 0 &&
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
            className="pointer-events-none max-w-[min(90vw,360px)] px-3 py-2 rounded-xl bg-gradient-to-l from-[#5b21b6] via-[#4c1d95] to-[#241046] text-white text-xs font-bold leading-relaxed shadow-[0_12px_32px_rgba(91,33,182,0.55)] border border-purple-400/50 break-words animate-fadeIn"
          >
            {fullTooltip}
          </div>,
          document.body
        )}
    </>
  );
}

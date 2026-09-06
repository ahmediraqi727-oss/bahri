"use client";

import React, { useState, useEffect, useRef } from "react";

export interface SmartFloatingBarProps {
  children?: React.ReactNode;
  className?: string;
}

export default function SmartFloatingBar({
  children,
  className = "",
}: SmartFloatingBarProps) {
  const [isAtBottom, setIsAtBottom] = useState<boolean>(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  // فحص حركة التمرير للشريط والصفحة
  useEffect(() => {
    const handleScroll = () => {
      if (typeof window === "undefined" || !document.documentElement) return;
      const scrollTop = window.scrollY;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;
      const distanceToBottom = scrollHeight - (scrollTop + clientHeight);

      setIsAtBottom(distanceToBottom <= 120);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // فحص التمرير الأفقي للأزرار داخل الشريط (إذا كانت عريضة)
  const checkHorizontalScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const tolerance = 5;
    setShowRightArrow(el.scrollWidth > el.clientWidth && Math.abs(el.scrollLeft) > tolerance);
    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    setShowLeftArrow(el.scrollWidth > el.clientWidth && Math.abs(el.scrollLeft) < maxScrollLeft - tolerance);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkHorizontalScroll();
    el.addEventListener("scroll", checkHorizontalScroll);
    window.addEventListener("resize", checkHorizontalScroll);
    return () => {
      el.removeEventListener("scroll", checkHorizontalScroll);
      window.removeEventListener("resize", checkHorizontalScroll);
    };
  }, [children]);

  return (
    <div
      className={`
        fixed left-4 right-4 sm:left-8 sm:right-8 md:max-w-7xl md:mx-auto
        ${isAtBottom ? "bottom-4" : "top-4"}
        z-50 
        bg-[#1e1936]/95 border border-purple-500/50 backdrop-blur-xl rounded-2xl
        transition-all duration-300 ease-in-out shadow-2xl shadow-purple-950/50
        ${className}
      `.trim().replace(/\s+/g, " ")}
    >
      <div className="relative group flex items-center">
        {/* سهم التمرير اليمين للشاشات التي تستخدم الماوس */}
        {showRightArrow && (
          <div className="hidden lg:flex absolute right-1 top-1/2 -translate-y-1/2 z-20 bg-purple-900/90 text-white p-1.5 rounded-full shadow-lg pointer-events-none animate-pulse">
            ◀
          </div>
        )}

        {/* الحاوية القابلة للتمرير الأفقي للأزرار */}
        <div
          ref={scrollRef}
          className="overflow-x-auto scrollbar-none flex items-center justify-between gap-3 w-full p-2"
        >
          {children}
        </div>

        {/* سهم التمرير اليسار */}
        {showLeftArrow && (
          <div className="hidden lg:flex absolute left-1 top-1/2 -translate-y-1/2 z-20 bg-purple-900/90 text-white p-1.5 rounded-full shadow-lg pointer-events-none animate-pulse">
            ▶
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useState, useRef, useEffect } from "react";

export interface ScrollableIndicatorContainerProps {
  children: React.ReactNode;
  className?: string;
}

export default function ScrollableIndicatorContainer({
  children,
  className = "",
}: ScrollableIndicatorContainerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;

    const { scrollLeft, scrollWidth, clientWidth } = el;
    // في اللغات العربية والتمرير، تختلف اتجاهات scrollLeft باختلاف المتصفح، لذا نتحقق بدقة:
    const tolerance = 5;

    // هل يوجد محتوى مخفي نحو اليمين؟
    setShowRightArrow(scrollWidth > clientWidth && Math.abs(scrollLeft) > tolerance);

    // هل يوجد محتوى مخفي نحو اليسار؟
    const maxScrollLeft = scrollWidth - clientWidth;
    setShowLeftArrow(scrollWidth > clientWidth && Math.abs(scrollLeft) < maxScrollLeft - tolerance);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    checkScroll();
    el.addEventListener("scroll", checkScroll);
    window.addEventListener("resize", checkScroll);

    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, []);

  return (
    <div className={`relative group ${className}`.trim()}>
      {/* سهم جهة اليمين (يظهر عند وجود محتوى مخفي يميناً) */}
      {showRightArrow && (
        <div className="hidden hover:pointer:fine:flex absolute right-2 top-1/2 -translate-y-1/2 z-20 bg-purple-900/80 text-white p-2 rounded-full shadow-lg backdrop-blur-sm animate-pulse pointer-events-none">
          ◀
        </div>
      )}

      {/* حاوية المحتوى القابل للتمرير الأفقي */}
      <div
        ref={scrollRef}
        className="overflow-x-auto scrollbar-thin scrollbar-thumb-purple-600 scrollbar-track-transparent flex items-center gap-2 py-2 px-1 max-w-full"
      >
        {children}
      </div>

      {/* سهم جهة اليسار (يظهر عند وجود محتوى مخفي يساراً) */}
      {showLeftArrow && (
        <div className="hidden hover:pointer:fine:flex absolute left-2 top-1/2 -translate-y-1/2 z-20 bg-purple-900/80 text-white p-2 rounded-full shadow-lg backdrop-blur-sm animate-pulse pointer-events-none">
          ▶
        </div>
      )}
    </div>
  );
}

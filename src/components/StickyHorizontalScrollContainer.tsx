"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

interface StickyHorizontalScrollContainerProps {
  children: React.ReactNode;
  className?: string;
  topOffset?: number;
}

/**
 * StickyHorizontalScrollContainer — Sticky Synchronized Double Horizontal Scrollbar Component.
 * Bi-directionally syncs a top sticky scrollbar with a bottom wide table container.
 * Uses ResizeObserver to dynamically bind scrollWidth and @media(pointer:fine) for mouse-only desktop targeting.
 */
export default function StickyHorizontalScrollContainer({
  children,
  className = "",
  topOffset = 0,
}: StickyHorizontalScrollContainerProps) {
  const topScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingTop = useRef(false);
  const isSyncingBottom = useRef(false);

  const [scrollWidth, setScrollWidth] = useState(0);
  const [hasOverflow, setHasOverflow] = useState(false);

  // Bi-directional Scroll Synchronization
  const handleTopScroll = useCallback(() => {
    if (isSyncingBottom.current) {
      isSyncingBottom.current = false;
      return;
    }
    if (topScrollRef.current && bottomScrollRef.current) {
      isSyncingTop.current = true;
      bottomScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  }, []);

  const handleBottomScroll = useCallback(() => {
    if (isSyncingTop.current) {
      isSyncingTop.current = false;
      return;
    }
    if (topScrollRef.current && bottomScrollRef.current) {
      isSyncingBottom.current = true;
      topScrollRef.current.scrollLeft = bottomScrollRef.current.scrollLeft;
    }
  }, []);

  // Update inner dummy width when bottom table or container resizes
  useEffect(() => {
    const bottomEl = bottomScrollRef.current;
    if (!bottomEl) return;

    const updateMetrics = () => {
      if (bottomScrollRef.current) {
        const sw = bottomScrollRef.current.scrollWidth;
        const cw = bottomScrollRef.current.clientWidth;
        setScrollWidth(sw);
        setHasOverflow(sw > cw + 4);
      }
    };

    updateMetrics();

    const resizeObserver = new ResizeObserver(() => {
      updateMetrics();
    });

    resizeObserver.observe(bottomEl);
    if (bottomEl.firstElementChild) {
      resizeObserver.observe(bottomEl.firstElementChild);
    }

    window.addEventListener("resize", updateMetrics);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateMetrics);
    };
  }, []);

  return (
    <div className={`relative w-full max-w-full ${className}`}>
      {/* Top Sticky Synchronized Scrollbar (Active exclusively for mouse pointer devices) */}
      {hasOverflow && (
        <div
          ref={topScrollRef}
          onScroll={handleTopScroll}
          style={{ top: `${topOffset}px` }}
          className="sticky top-0 z-30 overflow-x-auto overflow-y-hidden hidden [@media(pointer:fine)]:block bg-gray-100/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 rounded-t-xl transition-all shadow-sm sticky-top-scrollbar"
        >
          <div style={{ width: `${scrollWidth}px`, height: "12px" }} />
        </div>
      )}

      {/* Main Bottom Scroll Container */}
      <div
        ref={bottomScrollRef}
        onScroll={handleBottomScroll}
        className="overflow-x-auto max-w-full rounded-b-xl"
      >
        {children}
      </div>
    </div>
  );
}

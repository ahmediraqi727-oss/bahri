"use client";

import React, { useState, useEffect } from "react";

export interface SmartFloatingBarProps {
  children?: React.ReactNode;
  className?: string;
}

export default function SmartFloatingBar({
  children,
  className = "",
}: SmartFloatingBarProps) {
  const [isAtBottom, setIsAtBottom] = useState<boolean>(false);

  useEffect(() => {
    const handleScroll = () => {
      if (typeof window === "undefined" || !document.documentElement) return;
      
      const scrollTop = window.scrollY;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;

      const distanceToBottom = scrollHeight - (scrollTop + clientHeight);

      if (distanceToBottom <= 120) {
        setIsAtBottom(true); // الوصول للنهاية -> الانتقال للأسفل تماماً
      } else {
        setIsAtBottom(false); // طوال التصفح -> الثبات العلوي العائم
      }
    };

    handleScroll();

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  return (
    <div
      className={`
        fixed left-3 right-3 sm:left-6 sm:max-w-7xl sm:mx-auto
        ${isAtBottom ? "bottom-4" : "top-4"}
        z-50 
        bg-[#1e1936]/95 border border-purple-500/50 backdrop-blur-xl rounded-2xl
        transition-all duration-300 ease-in-out shadow-2xl shadow-purple-950/50
        ${className}
      `.trim().replace(/\s+/g, " ")}
    >
      {children}
    </div>
  );
}

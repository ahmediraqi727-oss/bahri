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

      // حساب المسافة المتبقية للوصول إلى نهاية الصفحة (أقل من 150 بكسل)
      const distanceToBottom = scrollHeight - (scrollTop + clientHeight);

      if (distanceToBottom <= 150) {
        setIsAtBottom(true); // الوصول للنهاية -> الانتقال للأسفل
      } else {
        setIsAtBottom(false); // أثناء التصفح العلوي والوسط -> الثبات في الأعلى
      }
    };

    handleScroll(); // التحقق الأولي عند التحميل

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
        sticky ${isAtBottom ? "bottom-4" : "top-4"}
        z-40 mx-4 my-3
        bg-[#1e1936]/95 border border-purple-500/40 backdrop-blur-md rounded-2xl
        transition-all duration-300 ease-in-out shadow-2xl
        ${className}
      `.trim().replace(/\s+/g, " ")}
    >
      {children}
    </div>
  );
}

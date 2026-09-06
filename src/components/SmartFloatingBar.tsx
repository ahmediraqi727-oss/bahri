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
      const scrollPosition = window.scrollY + window.innerHeight;
      const threshold = document.documentElement.scrollHeight - 120;
      setIsAtBottom(scrollPosition >= threshold);
    };

    // Initial check on mount
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
        ${isAtBottom ? "sticky bottom-4" : "sticky top-4"}
        z-40 mx-4 my-3
        bg-[#1e1936]/95 border border-purple-500/40 backdrop-blur-md rounded-2xl
        transition-all duration-300 ease-in-out
        ${className}
      `.trim().replace(/\s+/g, " ")}
    >
      {children}
    </div>
  );
}

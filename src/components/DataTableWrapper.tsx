"use client";

import React, { useRef, useState } from "react";

interface DataTableWrapperProps {
  children: React.ReactNode;
  className?: string;
}

export default function DataTableWrapper({ children, className = "" }: DataTableWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    // Don't initiate drag if clicking on interactive elements like buttons, inputs, links, checkboxes
    const target = e.target as HTMLElement;
    if (target.closest("button, input, select, a, textarea")) return;

    setIsDragging(true);
    setStartX(e.pageX - containerRef.current.offsetLeft);
    setScrollLeft(containerRef.current.scrollLeft);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    e.preventDefault();
    const x = e.pageX - containerRef.current.offsetLeft;
    const walk = (x - startX) * 1.5; // Drag speed multiplier
    containerRef.current.scrollLeft = scrollLeft - walk;
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseLeave={handleMouseLeave}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
      className={`overflow-x-auto w-full max-w-full touch-pan-x scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700 ${
        isDragging ? "cursor-grabbing select-none" : "cursor-grab"
      } ${className}`}
    >
      {children}
    </div>
  );
}

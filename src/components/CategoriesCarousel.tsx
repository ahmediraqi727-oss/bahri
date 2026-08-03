"use client";

import { useRef, useState } from "react";
import { useData } from "@/lib/data-context";
import { CategoryItem, getCategoryDisplayImage } from "@/lib/types";

interface CategoriesCarouselProps {
  selectedCategory: string | null;
  onSelectCategory: (categoryName: string | null) => void;
}

export default function CategoriesCarousel({ selectedCategory, onSelectCategory }: CategoriesCarouselProps) {
  const { categories, products, incrementCategoryViews } = useData();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Touch & Mouse Drag state
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeftState, setScrollLeftState] = useState(0);
  const [dragged, setDragged] = useState(false);

  // Combine database categories with categories detected from products
  const allCategories: CategoryItem[] = [...categories];

  products.forEach((p) => {
    if (!p.notes) return;
    let name = "";
    if (p.notes.includes("الفئة:")) {
      name = p.notes.split("الفئة:")[1]?.split("|")[0]?.trim() || "";
    } else {
      const parts = p.notes.split(/[\n|,]/);
      if (parts[0] && parts[0].length <= 35) name = parts[0].trim();
    }
    if (name && !allCategories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      allCategories.push({
        id: `auto-${name}`,
        name: name,
        image: "",
        priority: 99,
        isActive: true,
      });
    }
  });

  // Sort categories by priority ascending (1 first)
  const sortedCategories = allCategories
    .filter((c) => c.isActive !== false)
    .sort((a, b) => (a.priority || 0) - (b.priority || 0));

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const amount = direction === "left" ? -280 : 280;
      scrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    setIsMouseDown(true);
    setDragged(false);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeftState(scrollRef.current.scrollLeft);
  };

  const handleMouseLeaveOrUp = () => {
    setIsMouseDown(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isMouseDown || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    if (Math.abs(walk) > 5) setDragged(true);
    scrollRef.current.scrollLeft = scrollLeftState - walk;
  };

  if (sortedCategories.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-2" dir="rtl">
      {/* Header with Folder Icon & Title "الأقسام" */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19.5 21a3 3 0 0 0 3-3v-8a3 3 0 0 0-3-3h-7.854l-1.879-2.254A3 3 0 0 0 7.433 3.5H4.5a3 3 0 0 0-3 3v11.5a3 3 0 0 0 3 3h15Z" />
            </svg>
          </div>

          <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 dark:text-white">
            الأقسام
          </h2>

          {selectedCategory && (
            <button
              onClick={() => onSelectCategory(null)}
              className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline mr-2 flex items-center gap-1 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800"
            >
              <span>عرض جميع المنتجات</span>
              <span>↺</span>
            </button>
          )}
        </div>
      </div>

      {/* Interactive Horizontal Carousel Track */}
      <div
        ref={scrollRef}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeaveOrUp}
        onMouseUp={handleMouseLeaveOrUp}
        onMouseMove={handleMouseMove}
        className={`flex items-center gap-3.5 overflow-x-auto py-2.5 no-scrollbar scroll-smooth cursor-grab active:cursor-grabbing select-none touch-pan-x ${
          isMouseDown ? "scroll-auto" : "scroll-smooth"
        }`}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {/* Render Actual Store Categories Directly without 'All Categories' Card */}
        {sortedCategories.map((cat) => {
          const isSelected = selectedCategory === cat.name;
          const displayImg = getCategoryDisplayImage(cat, products);
          return (
            <button
              key={cat.id}
              onClick={() => {
                if (!dragged) {
                  incrementCategoryViews(cat.id);
                  onSelectCategory(isSelected ? null : cat.name);
                }
              }}
              className={`flex-shrink-0 flex flex-col items-center justify-between w-28 sm:w-32 h-32 sm:h-36 p-3 rounded-2xl border-2 transition-all duration-300 ${
                isSelected
                  ? "border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 shadow-lg scale-105"
                  : "border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:border-blue-300 hover:shadow-md hover:scale-102"
              }`}
            >
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 shadow-inner">
                {displayImg ? (
                  <img src={displayImg} alt={cat.name} className="w-full h-full object-cover pointer-events-none" />
                ) : (
                  <span className="text-2xl">📁</span>
                )}
              </div>
              <span className="text-xs sm:text-sm font-extrabold text-center line-clamp-2 leading-tight mt-1">
                {cat.name}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

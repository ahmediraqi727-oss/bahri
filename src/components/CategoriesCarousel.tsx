"use client";

import { useRef, useState } from "react";
import { useData } from "@/lib/data-context";
import { CategoryItem } from "@/lib/types";

interface CategoriesCarouselProps {
  selectedCategory: string | null;
  onSelectCategory: (categoryName: string | null) => void;
}

export default function CategoriesCarousel({ selectedCategory, onSelectCategory }: CategoriesCarouselProps) {
  const { categories, products } = useData();
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
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🎞️</span>
          <h2 className="text-base sm:text-lg font-extrabold text-gray-900 dark:text-white">
            تصفحه حسب القسم
          </h2>
          {selectedCategory && (
            <button
              onClick={() => onSelectCategory(null)}
              className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline mr-2"
            >
              عرض الكل ↺
            </button>
          )}
        </div>

        {/* Scroll Buttons with Arrows */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => scroll("right")}
            className="w-9 h-9 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700 shadow-sm transition-all hover:scale-105 active:scale-95 font-bold"
            title="التمرير يميناً"
          >
            ➔
          </button>
          <button
            onClick={() => scroll("left")}
            className="w-9 h-9 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700 shadow-sm transition-all hover:scale-105 active:scale-95 font-bold"
            title="التمرير يساراً"
          >
            ⬅
          </button>
        </div>
      </div>

      {/* Interactive Horizontal Carousel Track with Mouse & Touch Drag */}
      <div
        ref={scrollRef}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeaveOrUp}
        onMouseUp={handleMouseLeaveOrUp}
        onMouseMove={handleMouseMove}
        className={`flex items-center gap-3 overflow-x-auto py-2.5 no-scrollbar scroll-smooth cursor-grab active:cursor-grabbing select-none touch-pan-x ${
          isMouseDown ? "scroll-auto" : "scroll-smooth"
        }`}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {/* All Products Card */}
        <button
          onClick={() => {
            if (!dragged) onSelectCategory(null);
          }}
          className={`flex-shrink-0 flex flex-col items-center justify-center w-24 sm:w-28 h-28 sm:h-32 p-3 rounded-2xl border-2 transition-all duration-300 ${
            !selectedCategory
              ? "border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 shadow-md scale-105"
              : "border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:border-blue-300 hover:scale-102"
          }`}
        >
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-2xl mb-2">
            🏷️
          </div>
          <span className="text-xs font-bold text-center line-clamp-1">جميع الأقسام</span>
        </button>

        {sortedCategories.map((cat) => {
          const isSelected = selectedCategory === cat.name;
          return (
            <button
              key={cat.id}
              onClick={() => {
                if (!dragged) onSelectCategory(isSelected ? null : cat.name);
              }}
              className={`flex-shrink-0 flex flex-col items-center justify-between w-28 sm:w-32 h-32 sm:h-36 p-3 rounded-2xl border-2 transition-all duration-300 ${
                isSelected
                  ? "border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 shadow-lg scale-105"
                  : "border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:border-blue-300 hover:shadow-md hover:scale-102"
              }`}
            >
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 shadow-inner">
                {cat.image ? (
                  <img src={cat.image} alt={cat.name} className="w-full h-full object-cover pointer-events-none" />
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

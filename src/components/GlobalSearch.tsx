"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useData } from "@/lib/data-context";
import { useSettings } from "@/lib/settings-context";
import { useRouter } from "next/navigation";

interface SearchResult {
  type: "product" | "supplier" | "order";
  title: string;
  subtitle: string;
  icon: string;
  href: string;
}

export default function GlobalSearch() {
  const { products, suppliers } = useData();
  const { settings } = useSettings();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const results = useMemo<SearchResult[]>(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();

    const productResults: SearchResult[] = products
      .filter((p) => p.name.toLowerCase().includes(q) || p.notes.toLowerCase().includes(q))
      .map((p) => ({
        type: "product" as const,
        title: p.name,
        subtitle: `${p.retailPrice.toLocaleString()} د.ع | الكمية: ${p.stock}`,
        icon: "📦",
        href: "/dashboard/products",
      }));

    const supplierResults: SearchResult[] = suppliers
      .filter((s) => s.name.toLowerCase().includes(q) || s.phone.includes(q) || s.email.toLowerCase().includes(q))
      .map((s) => ({
        type: "supplier" as const,
        title: s.name,
        subtitle: `${s.phone || "لا هاتف"} | ${s.email || "لا بريد"}`,
        icon: "🚚",
        href: "/dashboard/suppliers",
      }));

    return [...productResults, ...supplierResults].slice(0, 10);
  }, [query, products, suppliers]);

  const handleSelect = (href: string) => {
    router.push(href);
    setIsOpen(false);
    setQuery("");
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setIsOpen(true); setTimeout(() => inputRef.current?.focus(), 100); }}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="hidden sm:inline">بحث...</span>
        <kbd className="hidden sm:inline px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">⌘K</kbd>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
          <div className="absolute inset-0 bg-black/40" onClick={() => setIsOpen(false)} />
          <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث عن منتج، مورد، هاتف..."
                className="flex-1 bg-transparent text-gray-900 dark:text-gray-100 outline-none text-sm"
                dir="rtl"
              />
              <kbd className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs text-gray-500">ESC</kbd>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {query.trim() && results.length === 0 && (
                <div className="p-8 text-center text-gray-400 text-sm">
                  لا توجد نتائج لـ "{query}"
                </div>
              )}

              {!query.trim() && (
                <div className="p-4 space-y-2">
                  <p className="text-xs text-gray-400 mb-2">بحث سريع</p>
                  {[
                    { label: "المنتجات", icon: "📦", href: "/dashboard/products" },
                    { label: "الموردين", icon: "🚚", href: "/dashboard/suppliers" },
                    { label: "المخزون", icon: "📊", href: "/dashboard/inventory" },
                    { label: "الطلبات", icon: "🛒", href: "/dashboard/orders" },
                    { label: "الإحصاءات", icon: "📈", href: "/dashboard/analytics" },
                  ].map((item) => (
                    <button
                      key={item.href}
                      onClick={() => handleSelect(item.href)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-right"
                    >
                      <span>{item.icon}</span>
                      <span className="text-sm text-gray-700 dark:text-gray-300">{item.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {results.map((result, i) => (
                <button
                  key={i}
                  onClick={() => handleSelect(result.href)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-right border-b border-gray-100 dark:border-gray-800 last:border-0"
                >
                  <span className="text-xl">{result.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{result.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{result.subtitle}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500">
                    {result.type === "product" ? "منتج" : result.type === "supplier" ? "مورد" : "طلب"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

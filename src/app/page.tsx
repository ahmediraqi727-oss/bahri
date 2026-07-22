"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useSettings } from "@/lib/settings-context";
import { useData } from "@/lib/data-context";
import { useCart } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";
import ImageSearch from "@/components/ImageSearch";
import CartSidebar from "@/components/CartSidebar";
import { supabase } from "@/lib/supabase-client";
import { useLang, Lang } from "@/lib/lang-context";

export default function Home() {
  const { settings, toggleDarkMode } = useSettings();
  const { products, suppliers } = useData();
  const { addItem, itemCount } = useCart();
  const { user, signOut } = useAuth();
  const { t, lang, setLang } = useLang();
  const theme = settings.roleThemes.customer;

  const [search, setSearch] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [addedId, setAddedId] = useState<string | null>(null);
  const [imageResults, setImageResults] = useState<{ id: string; score: number }[] | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchSubmitted, setSearchSubmitted] = useState(false);
  const [suggestions, setSuggestions] = useState<typeof products>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [eyeCare, setEyeCare] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactMsg, setContactMsg] = useState("");
  const [contactSent, setContactSent] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [heroGallery, setHeroGallery] = useState<{ position: number; image_url: string }[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  const isManager = user?.role === "manager" || user?.role === "admin";

  const allAvailableProducts = useMemo(() => products.filter((p) => p.stock > 0), [products]);

  const textFilteredProducts = useMemo(() => {
    if (!search) return allAvailableProducts;
    const q = search.toLowerCase();
    return allAvailableProducts.filter((p) => {
      const supplier = suppliers.find((s) => s.id === p.supplierId);
      return p.name.toLowerCase().includes(q) || (supplier?.name.toLowerCase().includes(q));
    });
  }, [allAvailableProducts, search, suppliers]);

  const similarProducts = useMemo(() => {
    if (!search || textFilteredProducts.length > 0 || !searchSubmitted) return [];
    const q = search.toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    return products.filter((p) => {
      const name = p.name.toLowerCase();
      return words.some((w) => name.includes(w));
    }).slice(0, 4);
  }, [search, textFilteredProducts, searchSubmitted, products]);

  const availableProducts = useMemo(() => {
    if (!imageResults || imageResults.length === 0) return textFilteredProducts;
    const scored = imageResults.map((r) => {
      const product = allAvailableProducts.find((p) => p.id === r.id);
      return product ? { ...product, score: r.score } : null;
    }).filter(Boolean);
    const textIds = new Set(textFilteredProducts.map((p) => p.id));
    return scored.filter((p) => textIds.has(p!.id)) as typeof allAvailableProducts;
  }, [textFilteredProducts, imageResults, allAvailableProducts]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setImageResults(null);
    setSearchSubmitted(false);
    if (value.trim().length >= 1) {
      const q = value.toLowerCase();
      setSuggestions(
        products.filter((p) => {
          const supplier = suppliers.find((s) => s.id === p.supplierId);
          return p.name.toLowerCase().includes(q) || (supplier?.name.toLowerCase().includes(q));
        }).slice(0, 5)
      );
    } else {
      setSuggestions([]);
    }
  };

  const handleSearchSubmit = () => {
    setSearchSubmitted(true);
    setSuggestions([]);
  };

  const handleSuggestionClick = (name: string) => {
    setSearch(name);
    setSuggestions([]);
    setSearchSubmitted(true);
  };

  const handleImageResults = useCallback((results: { id: string; score: number }[]) => {
    setImageResults(results);
    setSearch("");
  }, []);

  const handleClearImage = useCallback(() => {
    setImageResults(null);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("site-font-size");
    if (saved) setFontSize(Number(saved));
  }, []);

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}px`;
    localStorage.setItem("site-font-size", String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    supabase
      .from("hero_gallery")
      .select("position, image_url")
      .order("position", { ascending: true })
      .then(({ data }) => {
        if (data) setHeroGallery(data);
      });
  }, []);

  const handleAdd = (product: typeof products[0]) => {
    addItem({
      productId: product.id,
      name: product.name,
      image: product.image,
      retailPrice: product.retailPrice,
    });
    setAddedId(product.id);
    setTimeout(() => setAddedId(null), 1200);
  };

  return (
    <div className={`min-h-screen ${settings.darkMode ? "dark" : ""}`} style={{ fontFamily: settings.fontFamily }}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">

        {/* Navbar */}
        <nav className="sticky top-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16" dir="rtl">
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center gap-2 px-4 py-2.5 text-base font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <span className="text-2xl">🏠</span>
                  <svg className={`w-4 h-4 transition-transform ${menuOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl overflow-hidden z-50">
                    <div className="p-2">
                      {isManager ? (
                        <>
                          <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                            <span className="text-xl">👤</span>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{t.dashboard}</span>
                          </Link>
                          <Link href="/dashboard/products" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                            <span className="text-xl">📦</span>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{t.products}</span>
                          </Link>
                          <Link href="/dashboard/settings" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                            <span className="text-xl">⚙️</span>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{t.settings}</span>
                          </Link>
                          <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                          <button onClick={() => { signOut(); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                            <span className="text-xl">🚪</span>
                            <span className="text-sm font-medium text-red-600 dark:text-red-400">{t.logout}</span>
                          </button>
                        </>
                      ) : user ? (
                        <>
                          <div className="flex items-center gap-3 px-4 py-3">
                            <span className="text-xl">👤</span>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">{user.fullName}</span>
                          </div>
                          <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                          <button onClick={() => { signOut(); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                            <span className="text-xl">🚪</span>
                            <span className="text-sm font-medium text-red-600 dark:text-red-400">{t.logout}</span>
                          </button>
                          <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                        </>
                      ) : (
                        <>
                          <Link href="/login" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                            <span className="text-xl">👤</span>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{t.login}</span>
                          </Link>
                          <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                        </>
                      )}
                      <button onClick={() => { toggleDarkMode(); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <span className="text-xl">{settings.darkMode ? "☀️" : "🌙"}</span>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{settings.darkMode ? t.lightMode : t.darkMode}</span>
                      </button>
                      <button onClick={() => { setEyeCare(!eyeCare); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <span className="text-xl">{eyeCare ? "👁️" : "🕶️"}</span>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{eyeCare ? t.eyeCareOff : t.eyeCare}</span>
                      </button>
                      <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                      <div className="flex items-center gap-2 px-4 py-2">
                        <button onClick={() => setFontSize(Math.max(12, fontSize - 2))} className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm font-medium text-gray-700 dark:text-gray-200">
                          <span>A</span><span className="text-xs">−</span>
                        </button>
                        <span className="text-xs text-gray-400 min-w-[3rem] text-center">{fontSize}px</span>
                        <button onClick={() => setFontSize(Math.min(28, fontSize + 2))} className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm font-medium text-gray-700 dark:text-gray-200">
                          <span>A</span><span className="text-lg">+</span>
                        </button>
                      </div>
                      <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                      <div className="px-4 py-2">
                        <p className="text-xs text-gray-400 mb-2">{t.language}</p>
                        <div className="flex gap-1">
                          {([
                            { code: "ar" as Lang, label: "العربية", flag: "🇸🇦" },
                            { code: "en" as Lang, label: "English", flag: "🇬🇧" },
                          ]).map((l) => (
                            <button key={l.code} onClick={() => { setLang(l.code); setMenuOpen(false); }} className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-xs font-medium transition-colors ${lang === l.code ? "text-white" : "bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200"}`} style={lang === l.code ? { backgroundColor: theme.primary } : {}}>
                              <span className="text-base">{l.flag}</span><span>{l.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                      <button onClick={() => { setContactOpen(true); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <span className="text-xl">💬</span>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{t.help}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 sm:gap-4">
                <button
                  onClick={() => setSearchOpen(!searchOpen)}
                  className="relative p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  title={t.search}
                >
                  <img src="/search-icon.png" alt={t.search} className="w-11 h-11 rounded-xl object-cover" />
                  {imageResults && (
                    <span className="absolute -top-0.5 -left-0.5 w-3 h-3 bg-blue-500 rounded-full border-2 border-white dark:border-gray-900" />
                  )}
                </button>

                <button onClick={() => setCartOpen(true)} className="relative p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <span className="text-2xl">🛒</span>
                  {itemCount > 0 && (
                    <span className="absolute -top-1 -left-1 w-5 h-5 text-white text-xs font-bold rounded-full flex items-center justify-center" style={{ backgroundColor: theme.primary }}>
                      {itemCount > 9 ? "9+" : itemCount}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </nav>

        {/* Search Panel */}
        {searchOpen && (
          <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex-1 relative w-full max-w-lg">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearchSubmit()}
                    placeholder={t.searchPlaceholder}
                    autoFocus
                    className="w-full py-3 pl-16 pr-12 border border-gray-200 dark:border-gray-700 rounded-full bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <button
                    onClick={() => { handleSearchSubmit(); setSearchOpen(false); }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-full text-xs font-medium transition-colors"
                  >
                    {t.search}
                  </button>
                  {suggestions.length > 0 && (
                    <div className="absolute top-full mt-2 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl overflow-hidden z-50">
                      {suggestions.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => handleSuggestionClick(p.name)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-right"
                        >
                          {p.image ? (
                            <img src={p.image} alt="" className="w-10 h-10 rounded-lg object-cover" />
                          ) : (
                            <span className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-lg">📦</span>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.name}</p>
                            <p className="text-xs text-gray-400">{p.retailPrice.toLocaleString()} {t.dinar}</p>
                          </div>
                          <span className="text-xs text-gray-400">{p.stock} {t.pieces}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <ImageSearch onResults={handleImageResults} onClear={handleClearImage} isSearching={false} />
              </div>
              {imageResults && (
                <div className="mt-2 flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span>{imageResults.length} {t.resultCount}</span>
                </div>
              )}

            </div>
          </div>
        )}

        {/* Hero */}
        <section className="relative overflow-hidden">
          {settings.heroImage ? (
            <div className="relative h-[420px]">
              <img src={settings.heroImage} alt="Hero" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent flex items-end">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 w-full">
                  <h2 className="text-3xl sm:text-5xl font-bold text-white mb-3 drop-shadow-lg">
                    مرحباً بك في {settings.siteName}
                  </h2>
                  <p className="text-lg text-gray-200 max-w-xl">
                    اكتشف أفضل المنتجات بأسعار مميزة
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-[380px] flex items-center justify-center relative" style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` }}>
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 25% 25%, white 1px, transparent 1px)", backgroundSize: "50px 50px" }} />
              <div className="text-center text-white relative z-10 px-4">
                <img src="/logo.jpg" alt="شعار أحمد بحري" className="w-28 h-28 rounded-3xl object-cover mx-auto mb-6 shadow-2xl ring-4 ring-white/20" />
                <h2 className="text-3xl sm:text-5xl font-bold mb-3 drop-shadow-lg">
                  مرحباً بك في {settings.siteName}
                </h2>
                <p className="text-lg text-white/80 max-w-xl mx-auto">
                  اكتشف أفضل المنتجات بأسعار مميزة
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Hero Gallery */}
        {heroGallery.length > 0 && (
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {heroGallery.map((img) => (
                <div key={img.position} className="aspect-square rounded-2xl overflow-hidden shadow-sm">
                  <img
                    src={img.image_url}
                    alt={`معرض ${img.position + 1}`}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Search & Stats */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-10">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 flex flex-col sm:flex-row gap-4 items-center">
            <div className="flex-1 relative w-full max-w-lg">
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearchSubmit()}
                placeholder={t.searchPlaceholder}
                className="w-full py-3 pl-16 pr-12 border border-gray-200 dark:border-gray-700 rounded-full bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <button
                onClick={() => { handleSearchSubmit(); setSearchOpen(true); }}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-full text-xs font-medium transition-colors"
              >
                {t.search}
              </button>
              {suggestions.length > 0 && (
                <div className="absolute top-full mt-2 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl overflow-hidden z-50">
                  {suggestions.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleSuggestionClick(p.name)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-right"
                    >
                      {p.image ? (
                        <img src={p.image} alt="" className="w-10 h-10 rounded-lg object-cover" />
                      ) : (
                        <span className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-lg">📦</span>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.name}</p>
                        <p className="text-xs text-gray-400">{p.retailPrice.toLocaleString()} {t.dinar}</p>
                      </div>
                      <span className="text-xs text-gray-400">{p.stock} {t.pieces}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-4 text-sm text-gray-500 dark:text-gray-400">
              <span>📦 {availableProducts.length} {t.productCount}</span>
              {isManager && <span>🚚 {suppliers.length} {t.supplierCount}</span>}
            </div>
          </div>
        </section>

        {/* Products Grid */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Hidden images for AI analysis */}
          <div className="hidden">
            {allAvailableProducts.map((p) =>
              p.image ? (
                <img key={p.id} src={p.image} alt="" data-product-id={p.id} data-product-image="true" />
              ) : null
            )}
          </div>

          {availableProducts.length === 0 ? (
            <div className="text-center py-12">
              <span className="text-6xl block mb-4">📭</span>
              {search && searchSubmitted ? (
                <>
                  <p className="text-xl font-bold text-gray-700 dark:text-gray-200 mb-1">
                    {t.productUnavailable}
                  </p>
                  <p className="text-sm text-gray-400 mb-6">{t.similarProducts}</p>
                  {similarProducts.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
                      {similarProducts.map((p) => (
                        <div key={p.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-all">
                          <div className="aspect-square bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
                            {p.image ? (
                              <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-5xl">📦</span>
                            )}
                          </div>
                          <div className="p-3">
                            <p className="font-bold text-gray-900 dark:text-white text-sm truncate">{p.name}</p>
                            <p className="text-lg font-extrabold mt-1" style={{ color: theme.primary }}>
                              {p.retailPrice.toLocaleString()} <span className="text-xs font-normal text-gray-400">{t.dinar}</span>
                            </p>
                            <button
                              onClick={() => { setSearch(p.name); setSearchSubmitted(false); setSuggestions([]); }}
                              className="mt-2 w-full text-xs py-1.5 rounded-lg font-medium border transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                              style={{ borderColor: theme.primary, color: theme.primary }}
                            >
                              {t.viewProduct}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">{t.noSimilar}</p>
                  )}
                </>
              ) : (
                <p className="text-xl text-gray-500 dark:text-gray-400">
                  {imageResults ? t.noSimilar : t.noProducts}
                </p>
              )}
              {(search || imageResults) && (
                <button onClick={() => { setSearch(""); setImageResults(null); setSearchSubmitted(false); setSuggestions([]); }} className="mt-4 text-sm underline" style={{ color: theme.primary }}>
                  {t.clearSearch}
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {availableProducts.map((product) => {
                const supplier = suppliers.find((s) => s.id === product.supplierId);
                const isAdded = addedId === product.id;
                const score = imageResults?.find((r) => r.id === product.id)?.score;
                return (
                  <div key={product.id} className="group bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                    <div className="relative aspect-square overflow-hidden bg-gray-100 dark:bg-gray-800">
                      {product.image ? (
                        <img src={product.image} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-6xl text-gray-300">📦</div>
                      )}
                      <div className="absolute top-3 right-3">
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold text-white" style={{ backgroundColor: theme.primary }}>
                          {product.stock} {t.pieces}
                        </span>
                      </div>
                      {score !== undefined && (
                        <div className="absolute top-3 left-3">
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold text-white bg-blue-600">
                            {Math.round(score * 100)}% {t.match}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="p-4 space-y-3">
                      <div>
                        <h3 className="font-bold text-gray-900 dark:text-white text-base leading-tight">{product.name}</h3>
                        {supplier && <p className="text-xs text-gray-400 mt-1">🚚 {supplier.name}</p>}
                      </div>

                      {product.notes && <p className="text-xs text-gray-400 line-clamp-2">{product.notes}</p>}

                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-2xl font-extrabold" style={{ color: theme.primary }}>
                            {product.retailPrice.toLocaleString()}
                            <span className="text-xs font-normal text-gray-400 mr-1">{t.dinar}</span>
                          </p>
                          {product.wholesalePrice > 0 && (
                            <p className="text-xs text-gray-400 line-through">{product.wholesalePrice.toLocaleString()} {t.dinar}</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleAdd(product)}
                          disabled={isAdded}
                          className="px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-all hover:scale-105 active:scale-95 disabled:scale-100"
                          style={{ backgroundColor: isAdded ? "#10b981" : theme.primary }}
                        >
                          {isAdded ? `✓ ${t.added}` : t.addToCart}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {settings.footerImage && (
              <img src={settings.footerImage} alt="Footer" className="w-full h-28 object-cover rounded-xl mb-6" />
            )}
            <div className="flex flex-col items-center gap-4">
              <img src="/logo.jpg" alt="شعار أحمد بحري" className="w-16 h-16 rounded-2xl object-cover shadow-lg" />
              <div className="text-center text-gray-500 dark:text-gray-400 text-sm">
                <p>&copy; 2026 {settings.siteName} - جميع الحقوق محفوظة</p>
              </div>
            </div>
          </div>
        </footer>
      </div>

      {/* Contact Modal for Customers */}
      {contactOpen && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setContactOpen(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="font-bold text-lg text-gray-900 dark:text-white">{t.contactUs}</h3>
              <button onClick={() => setContactOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl">&times;</button>
            </div>
            <div className="p-5 space-y-4">
              <a href="tel:+9647800000000" className="flex items-center gap-3 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors">
                <span className="text-2xl">📞</span>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{t.callUs}</p>
                  <p className="text-xs text-gray-500" dir="ltr">+964 780 000 0000</p>
                </div>
              </a>
              <a href="mailto:info@ahmedbahri.com" className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
                <span className="text-2xl">📧</span>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{t.emailUs}</p>
                  <p className="text-xs text-gray-500">info@ahmedbahri.com</p>
                </div>
              </a>
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <p className="text-sm font-bold text-gray-900 dark:text-white mb-3">{t.sendMessage}</p>
                {contactSent ? (
                  <div className="text-center py-4">
                    <span className="text-3xl block mb-2">✅</span>
                    <p className="text-sm text-green-600 dark:text-green-400 font-medium">{t.messageSent}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder={t.yourName} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                    <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder={t.yourPhone} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                    <textarea value={contactMsg} onChange={(e) => setContactMsg(e.target.value)} placeholder={t.yourMessage} rows={3} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
                    <button onClick={() => { if (contactName && contactMsg) { setContactSent(true); setTimeout(() => setContactSent(false), 3000); } }} className="w-full py-2.5 rounded-xl text-white text-sm font-medium transition-colors" style={{ backgroundColor: theme.primary }}>
                      {t.send}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <CartSidebar isOpen={cartOpen} onClose={() => setCartOpen(false)} />
      {eyeCare && <div className="fixed inset-0 bg-amber-900/15 pointer-events-none z-50" />}
    </div>
  );
}

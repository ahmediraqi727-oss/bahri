"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useSettings } from "@/lib/settings-context";
import { useData } from "@/lib/data-context";
import { useCart } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";
import ImageSearch from "@/components/ImageSearch";
import CustomerCartSidebar from "@/components/CustomerCartSidebar";
import CategoriesCarousel from "@/components/CategoriesCarousel";
import GuestWelcomeModal from "@/components/GuestWelcomeModal";
import ProfileEditModal from "@/components/ProfileEditModal";
import { supabase } from "@/lib/supabase-client";
import { useLang, Lang } from "@/lib/lang-context";

export default function Home() {
  const { settings, toggleDarkMode, toggleEyeProtection } = useSettings();
  const { products, suppliers } = useData();
  const { addItem, itemCount } = useCart();
  const { user, signOut, loading: authLoading } = useAuth();
  const { t, lang, setLang } = useLang();
  const theme = settings.roleThemes.customer;

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [addedId, setAddedId] = useState<string | null>(null);
  const [imageResults, setImageResults] = useState<{ id: string; score: number }[] | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchSubmitted, setSearchSubmitted] = useState(false);
  const [suggestions, setSuggestions] = useState<typeof products>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [eyeCare, setEyeCare] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactMsg, setContactMsg] = useState("");
  const [contactSent, setContactSent] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [heroGallery, setHeroGallery] = useState<{ position: number; image_url: string }[]>([]);
  
  const menuRef = useRef<HTMLDivElement>(null);
  const categoriesRef = useRef<HTMLDivElement>(null);

  const isManager = user?.role === "manager" || user?.role === "admin";

  const allAvailableProducts = useMemo(() => products.filter((p) => p.stock > 0), [products]);

  // Extract all categories dynamically from product notes / category fields
  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (!p.notes) return;
      if (p.notes.includes("الفئة:")) {
        const cat = p.notes.split("الفئة:")[1]?.split("|")[0]?.trim();
        if (cat) set.add(cat);
      } else {
        const parts = p.notes.split(/[\n|,]/);
        if (parts[0] && parts[0].length <= 35) set.add(parts[0].trim());
      }
    });
    return Array.from(set).filter(Boolean);
  }, [products]);

  const textFilteredProducts = useMemo(() => {
    let result = allAvailableProducts;

    if (selectedCategory) {
      result = result.filter((p) => p.notes && p.notes.toLowerCase().includes(selectedCategory.toLowerCase()));
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p) => {
        const supplier = suppliers.find((s) => s.id === p.supplierId);
        return p.name.toLowerCase().includes(q) || (supplier?.name.toLowerCase().includes(q)) || (p.notes && p.notes.toLowerCase().includes(q));
      });
    }

    return result;
  }, [allAvailableProducts, search, selectedCategory, suppliers]);

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
      if (categoriesRef.current && !categoriesRef.current.contains(e.target as Node)) setCategoriesOpen(false);
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors" style={{ fontFamily: settings.fontFamily }}>
      
      {/* Sticky Responsive Header */}
      <nav className="sticky top-0 z-40 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 shadow-sm transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20" dir="rtl">
            
            {/* Right: Logo & Navigation Controls */}
            <div className="flex items-center gap-2 sm:gap-4">
              
              {/* Main Menu Dropdown */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm sm:text-base font-bold text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800"
                  title="القائمة الرئيسية"
                >
                  {settings.homeIcon ? (
                    <img src={settings.homeIcon} alt="القائمة" style={{ width: settings.homeIconSize || 28, height: settings.homeIconSize || 28 }} className="object-contain" />
                  ) : (
                    <span style={{ fontSize: (settings.homeIconSize || 28) * 0.8 }}>🏠</span>
                  )}
                  <span className="hidden md:inline">الرئيسية</span>
                  <svg className={`w-4 h-4 transition-transform ${menuOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {menuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl overflow-hidden z-50 animate-fadeIn text-right" dir="rtl">
                    
                    {/* Top User Profile Header Card */}
                    {authLoading ? (
                      <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3 animate-pulse">
                        <div className="w-12 h-12 rounded-2xl bg-gray-300 dark:bg-gray-700 flex-shrink-0" />
                        <div className="space-y-2 flex-1">
                          <div className="h-3.5 bg-gray-300 dark:bg-gray-700 rounded w-3/4" />
                          <div className="h-2.5 bg-gray-200 dark:bg-gray-800 rounded w-1/2" />
                        </div>
                      </div>
                    ) : user ? (
                      <div
                        onClick={() => { setProfileEditOpen(true); setMenuOpen(false); }}
                        className="p-4 bg-gradient-to-br from-blue-50/80 via-indigo-50/50 to-purple-50/80 dark:from-blue-950/40 dark:via-gray-900 dark:to-purple-950/40 border-b border-gray-100 dark:border-gray-800 cursor-pointer hover:bg-blue-100/60 dark:hover:bg-blue-900/50 transition-all group"
                        title="انقر لتعديل الملف الشخصي والمعلومات الأمنيّة ✏️"
                      >
                        <div className="flex items-center gap-3">
                          {user.avatarUrl ? (
                            <img
                              src={user.avatarUrl}
                              alt={user.fullName}
                              className="w-12 h-12 rounded-2xl object-cover border-2 border-blue-500 shadow-sm flex-shrink-0 group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 text-white font-extrabold text-lg flex items-center justify-center shadow-md flex-shrink-0 group-hover:scale-105 transition-transform">
                              {user.fullName?.charAt(0) || user.email?.charAt(0)?.toUpperCase() || "👤"}
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h4 className="font-extrabold text-sm text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                {user.fullName || "مستخدم مسجل"} ✏️
                              </h4>
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold flex-shrink-0 ${
                                  user.role === "manager"
                                    ? "bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300"
                                    : user.role === "admin"
                                    ? "bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300"
                                    : "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300"
                                }`}
                              >
                                {user.role === "manager"
                                  ? "👑 مدير نظام"
                                  : user.role === "admin"
                                  ? "🛡️ إداري"
                                  : "👤 زبون"}
                              </span>
                            </div>

                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5 font-mono">
                              {user.email || "حساب معتمد"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {/* Menu Items List */}
                    <div className="p-2 space-y-1">
                      {isManager ? (
                        <>
                          <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                            <span className="text-xl">📊</span>
                            <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{t.dashboard}</span>
                          </Link>
                          <Link href="/dashboard/products" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                            <span className="text-xl">📦</span>
                            <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{t.products}</span>
                          </Link>
                          <Link href="/dashboard/invoices" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                            <span className="text-xl">🧾</span>
                            <span className="text-sm font-bold text-gray-700 dark:text-gray-200">الفواتير والطلبات</span>
                          </Link>
                          <Link href="/dashboard/settings" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                            <span className="text-xl">⚙️</span>
                            <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{t.settings}</span>
                          </Link>
                        </>
                      ) : user ? (
                        <>
                          <Link href="/dashboard/settings" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                            <span className="text-xl">⚙️</span>
                            <span className="text-sm font-bold text-gray-700 dark:text-gray-200">إعدادات الحساب</span>
                          </Link>
                        </>
                      ) : (
                        <>
                          <Link href="/login" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold transition-colors">
                            <span className="text-xl">🔑</span>
                            <span className="text-sm font-bold">{t.login}</span>
                          </Link>
                        </>
                      )}

                      {user && (
                        <>
                          <div className="border-t border-gray-100 dark:border-gray-800 my-1" />
                          <button onClick={() => { signOut(); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                            <span className="text-xl">🚪</span>
                            <span className="text-sm font-bold text-red-600 dark:text-red-400">{t.logout}</span>
                          </button>
                        </>
                      )}
                      
                      <div className="border-t border-gray-100 dark:border-gray-800 my-1" />
                      
                      <button onClick={() => { toggleDarkMode(); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <span className="text-xl">{settings.darkMode ? "☀️" : "🌙"}</span>
                        <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{settings.darkMode ? t.lightMode : t.darkMode}</span>
                      </button>

                      <button onClick={() => { toggleEyeProtection(); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <span className="text-xl">{settings.eyeProtection ? "👁️" : "🕶️"}</span>
                        <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{settings.eyeProtection ? t.eyeCareOff : t.eyeCare}</span>
                      </button>

                      <div className="border-t border-gray-100 dark:border-gray-800 my-1" />
                      
                      <button onClick={() => { setContactOpen(true); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <span className="text-xl">💬</span>
                        <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{t.help}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Categories Button ("الأقسام") - Visible to EVERYONE */}
              <div className="relative" ref={categoriesRef}>
                <button
                  onClick={() => setCategoriesOpen(!categoriesOpen)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm sm:text-base font-bold text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 transition-colors"
                  title="أقسام المنتجات"
                >
                  <span className="text-xl">📁</span>
                  <span>الأقسام</span>
                  {selectedCategory && (
                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                  )}
                  <svg className={`w-4 h-4 transition-transform ${categoriesOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {categoriesOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl overflow-hidden z-50 p-2 space-y-1 animate-fadeIn">
                    <div className="px-3 py-2 text-xs font-bold text-gray-400 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                      <span>جميع الأقسام والفئات</span>
                      {selectedCategory && (
                        <button onClick={() => setSelectedCategory(null)} className="text-blue-600 dark:text-blue-400 hover:underline text-[11px]">
                          إلغاء التصفية
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => { setSelectedCategory(null); setCategoriesOpen(false); }}
                      className={`w-full text-right px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                        !selectedCategory ? "bg-blue-600 text-white" : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                      }`}
                    >
                      عرض جميع الأقسام ({products.length})
                    </button>
                    {categoriesList.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-gray-400">لا توجد أقسام مخصصة بعد</p>
                    ) : (
                      categoriesList.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => { setSelectedCategory(cat); setCategoriesOpen(false); }}
                          className={`w-full text-right px-3 py-2 rounded-xl text-xs font-bold transition-colors truncate ${
                            selectedCategory === cat ? "bg-blue-600 text-white" : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                          }`}
                        >
                          📁 {cat}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Logo / Brand Name */}
              <Link href="/" className="flex items-center gap-2 mr-2">
                {settings.logo ? (
                  <img src={settings.logo} alt={settings.siteName} className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl object-cover shadow-sm" />
                ) : (
                  <img src="/logo.jpg" alt="Logo" className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl object-cover shadow-sm" />
                )}
                <span className="font-extrabold text-base sm:text-lg text-gray-900 dark:text-white hidden lg:inline">
                  {settings.siteName}
                </span>
              </Link>
            </div>

            {/* Left: Search & Cart & Mode Action Icons */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Light / Dark Mode Toggle */}
              <button
                onClick={toggleDarkMode}
                className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-xl"
                title={settings.darkMode ? "التحويل للوضع النهاري (الفاتح)" : "التحويل للوضع المظلم (الليلي)"}
              >
                {settings.darkMode ? "☀️" : "🌙"}
              </button>

              {/* Eye Protection Sepia Toggle */}
              <button
                onClick={toggleEyeProtection}
                className={`p-2 rounded-xl transition-all text-xl flex items-center justify-center ${
                  settings.eyeProtection
                    ? "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 ring-2 ring-amber-400"
                    : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
                }`}
                title={settings.eyeProtection ? "إيقاف وضع حماية العين" : "تفعيل وضع حماية العين (Warm Sepia)"}
              >
                👁️
              </button>

              {/* Search Toggle Icon */}
              <button
                onClick={() => setSearchOpen(!searchOpen)}
                className="relative p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center justify-center"
                title={t.search}
              >
                {settings.searchIcon ? (
                  <img src={settings.searchIcon} alt={t.search} style={{ width: settings.searchIconSize || 28, height: settings.searchIconSize || 28 }} className="object-contain" />
                ) : (
                  <span style={{ fontSize: (settings.searchIconSize || 28) * 0.8 }}>🔍</span>
                )}
              </button>

              {/* Customer Cart Icon */}
              <button
                onClick={() => setCartOpen(true)}
                className="relative p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center justify-center"
                title="سلة المشتريات"
              >
                {settings.cartIcon ? (
                  <img src={settings.cartIcon} alt="السلة" style={{ width: settings.cartIconSize || 28, height: settings.cartIconSize || 28 }} className="object-contain" />
                ) : (
                  <span style={{ fontSize: (settings.cartIconSize || 28) * 0.8 }}>🛒</span>
                )}
                {itemCount > 0 && (
                  <span
                    className="absolute -top-1 -left-1 w-5 h-5 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-md animate-scaleUp"
                    style={{ backgroundColor: theme.primary }}
                  >
                    {itemCount > 9 ? "9+" : itemCount}
                  </span>
                )}
              </button>
            </div>

          </div>
        </div>
      </nav>

      {/* Expanded Search Panel */}
      {searchOpen && (
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-lg animate-fadeIn">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex-1 relative w-full">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearchSubmit()}
                  placeholder={t.searchPlaceholder}
                  autoFocus
                  className="w-full py-3 pl-16 pr-12 border border-gray-300 dark:border-gray-700 rounded-full bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
                />
                <button
                  onClick={() => { handleSearchSubmit(); setSearchOpen(false); }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-full text-xs font-bold transition-colors"
                >
                  {t.search}
                </button>
              </div>
              <ImageSearch onResults={handleImageResults} onClear={handleClearImage} isSearching={false} />
            </div>
          </div>
        </div>
      )}

      {/* Hero Banner Section */}
      <section className="relative overflow-hidden">
        {settings.heroImage ? (
          <div className="relative h-[260px] sm:h-[380px] lg:h-[450px]">
            <img src={settings.heroImage} alt="Hero" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex items-end">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 sm:pb-12 w-full text-right" dir="rtl">
                <h2 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold text-white mb-2 drop-shadow-lg">
                  مرحباً بك في {settings.siteName}
                </h2>
                <p className="text-sm sm:text-lg text-gray-200 max-w-xl font-medium">
                  تسوق أفضل منتجات وقطع الغيار بأسعار وجودة مميزة
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-[280px] sm:h-[380px] flex items-center justify-center relative" style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` }}>
            <div className="text-center text-white relative z-10 px-4">
              {settings.logo ? (
                <img src={settings.logo} alt="Logo" className="w-20 h-20 sm:w-28 sm:h-28 rounded-3xl object-cover mx-auto mb-4 shadow-2xl ring-4 ring-white/20" />
              ) : (
                <img src="/logo.jpg" alt="Logo" className="w-20 h-20 sm:w-28 sm:h-28 rounded-3xl object-cover mx-auto mb-4 shadow-2xl ring-4 ring-white/20" />
              )}
              <h2 className="text-2xl sm:text-4xl font-extrabold mb-2 drop-shadow-lg">
                مرحباً بك في {settings.siteName}
              </h2>
              <p className="text-sm sm:text-base text-white/80 max-w-xl mx-auto font-medium">
                تصفح المنتجات واطلبها مباشرة بسهولة
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Interactive Categories Carousel Slider */}
      {settings.showCategoriesCarousel !== false && (
        <CategoriesCarousel
          selectedCategory={selectedCategory}
          onSelectCategory={(cat) => setSelectedCategory(cat)}
        />
      )}

      {/* Category Filter Active Pill Banner */}
      {selectedCategory && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 flex items-center justify-between" dir="rtl">
            <div className="flex items-center gap-2 text-sm font-bold text-blue-900 dark:text-blue-200">
              <span>📁 تصفية حسب القسم:</span>
              <span className="bg-blue-600 text-white px-3 py-1 rounded-xl text-xs">{selectedCategory}</span>
            </div>
            <button
              onClick={() => setSelectedCategory(null)}
              className="text-xs font-bold text-red-600 dark:text-red-400 hover:underline"
            >
              إلغاء التصفية ✕
            </button>
          </div>
        </section>
      )}

      {/* Products Grid Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {availableProducts.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-8 shadow-sm">
            <span className="text-6xl block mb-4">📭</span>
            <p className="text-xl font-bold text-gray-700 dark:text-gray-200 mb-2">
              {selectedCategory ? `لا توجد منتجات متوفرة حالياً في قسم "${selectedCategory}"` : "لا توجد منتجات مطابقة للبحث"}
            </p>
            <button
              onClick={() => { setSearch(""); setSelectedCategory(null); setImageResults(null); }}
              className="mt-4 px-6 py-2.5 rounded-xl text-white text-sm font-bold shadow-md"
              style={{ backgroundColor: theme.primary }}
            >
              عرض جميع المنتجات
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {availableProducts.map((product) => {
              const isAdded = addedId === product.id;
              return (
                <div
                  key={product.id}
                  className="group bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden hover:shadow-xl transition-all duration-300 flex flex-col justify-between"
                  dir="rtl"
                >
                  <div className="relative aspect-square overflow-hidden bg-gray-100 dark:bg-gray-800">
                    {product.image ? (
                      <img src={product.image} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-5xl text-gray-300">📦</div>
                    )}
                  </div>

                  <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-gray-900 dark:text-white text-sm sm:text-base leading-tight line-clamp-2">{product.name}</h3>
                      {product.notes && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{product.notes}</p>}
                    </div>

                    <div className="pt-2 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                      <div>
                        <p className="text-xl sm:text-2xl font-extrabold text-blue-600 dark:text-blue-400">
                          {product.retailPrice.toLocaleString()}
                          <span className="text-xs font-normal text-gray-400 mr-1">{t.dinar}</span>
                        </p>
                      </div>

                      <button
                        onClick={() => handleAdd(product)}
                        disabled={isAdded}
                        className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold text-white transition-all hover:scale-105 active:scale-95 disabled:scale-100 shadow-md"
                        style={{ backgroundColor: isAdded ? "#10b981" : theme.primary }}
                      >
                        {isAdded ? "✓ تم الإضافة" : "أضف للسلة 🛒"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Customizable Dynamic Footer */}
      <footer
        className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 transition-colors"
        style={{ minHeight: settings.footerHeight || 120, padding: "30px 15px" }}
      >
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-gray-600 dark:text-gray-300" dir="rtl">
          {/* Right Column Text */}
          <div className="text-right font-bold text-xs sm:text-sm">
            {settings.footerRightText || `جميع الحقوق محفوظة © 2026 ${settings.siteName}`}
          </div>

          {/* Center Column Image & Text */}
          <div className="text-center space-y-2">
            {settings.footerImage ? (
              <img src={settings.footerImage} alt="Footer" className="h-14 object-contain mx-auto rounded-xl" />
            ) : (
              <img src={settings.logo || "/logo.jpg"} alt="Logo" className="w-12 h-12 rounded-xl object-cover mx-auto shadow-md" />
            )}
            <p className="font-extrabold text-gray-900 dark:text-white text-xs sm:text-sm">
              {settings.footerCenterText || "أفضل المنتجات والخدمات لعملائنا الكرام"}
            </p>
          </div>

          {/* Left Column Text */}
          <div className="text-left font-bold text-xs sm:text-sm">
            {settings.footerLeftText || `للطلب والتواصل: ${settings.phoneLink || "07800000000"}`}
          </div>
        </div>
      </footer>

      {/* Customer Cart Drawer */}
      <CustomerCartSidebar isOpen={cartOpen} onClose={() => setCartOpen(false)} />

      {/* Guest Welcome Modal */}
      <GuestWelcomeModal />

      {/* Profile Edit Modal */}
      <ProfileEditModal isOpen={profileEditOpen} onClose={() => setProfileEditOpen(false)} />
    </div>
  );
}

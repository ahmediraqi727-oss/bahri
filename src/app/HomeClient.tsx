"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
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
import ProductDetailModal from "@/components/ProductDetailModal";
import CustomerProductsModal, {
  getFavoriteProductIds,
  toggleFavoriteProductId,
} from "@/components/CustomerProductsModal";
import CustomerMessagesModal from "@/components/CustomerMessagesModal";
import CustomerNotificationsModal from "@/components/CustomerNotificationsModal";
import GuestRetentionModal from "@/components/GuestRetentionModal";
import ContactSupportModal from "@/components/ContactSupportModal";
import Footer from "@/components/Footer";
import { useNotifications } from "@/lib/notifications";
import { useFavorites } from "@/contexts/FavoritesContext";
import { supabase } from "@/lib/supabase-client";
import { useLang } from "@/lib/lang-context";
import { hasPermission } from "@/lib/permissions";
import { getAdminPermissionsConfig } from "@/components/PermissionGate";
import {
  buildTierBadgeText,
  resolveTierForQty,
  calculateTierPrice,
  DEFAULT_PRICING_CONFIG,
} from "@/lib/pricing-engine";
import type { Product } from "@/lib/types";
import { generateProductAltText, extractCategoryFromNotes } from "@/lib/seo";
// ─── Barcode / QR Scanner ─────────────────────────────────────────────────
import BarcodeScanner from "@/components/BarcodeScanner";
import ScannerProductModal from "@/components/ScannerProductModal";
import { HardwareScannerService, subscribeToHardwareScan } from "@/lib/hardware-scanner";

interface StoreLocation {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  google_maps_url: string;
}

interface TeamMember {
  id: string;
  full_name: string;
  job_title: string;
  bio: string;
  avatar_url: string;
  display_order: number;
}

interface Post {
  id: string;
  title: string;
  body: string;
  post_type: "educational" | "promotional";
  display_position: string;
  media_url: string | null;
  media_type: "image" | "video";
  views_count: number;
  created_at: string;
}

export default function HomeClient() {
  const { settings, toggleDarkMode, toggleEyeProtection } = useSettings();
  const { products, suppliers, categories, getEffectiveTiers } = useData();
  const { addItem, itemCount } = useCart();
  const { user, signOut, loading: authLoading } = useAuth();
  const { t, lang, setLang } = useLang();
  const theme = settings.roleThemes.customer;

  // Global pricing config from settings
  const globalPricingConfig = settings.pricingTiers ?? DEFAULT_PRICING_CONFIG;

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
  const { unreadCount: notifUnreadCount } = useNotifications();
  const [guestEditOpen, setGuestEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [myProductsOpen, setMyProductsOpen] = useState(false);
  const [customerMessagesOpen, setCustomerMessagesOpen] = useState(false);
  const [customerNotificationsOpen, setCustomerNotificationsOpen] = useState(false);
  const [guestRetentionOpen, setGuestRetentionOpen] = useState(false);
  const [copyNotice, setCopyNotice] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  // Per-card quick qty state: productId -> qty
  const [cardQty, setCardQty] = useState<Record<string, number>>({});
  // Favorites / Wishlist State
  const { favoriteIds, toggleFavorite } = useFavorites();
  const [favToast, setFavToast] = useState<string | null>(null);

  // ─── Barcode / QR Scanner State ──────────────────────────────────────────
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannedCode, setScannedCode] = useState<string | null>(null);

  // Compute scanner RBAC permissions from current role
  const adminPermConfig = getAdminPermissionsConfig();
  const currentUserRole = user?.role ?? "customer";
  const canViewScannerBtn = currentUserRole === "manager" || hasPermission(currentUserRole, "scanner.view_button", adminPermConfig);
  const canUseCamera      = currentUserRole === "manager" || hasPermission(currentUserRole, "scanner.use_camera", adminPermConfig);
  const canUseImageUpload = currentUserRole === "manager" || hasPermission(currentUserRole, "scanner.use_image_upload", adminPermConfig);
  const canUseManualEntry = currentUserRole === "manager" || hasPermission(currentUserRole, "scanner.use_manual_entry", adminPermConfig);
  const canUseHardware    = currentUserRole === "manager" || hasPermission(currentUserRole, "scanner.use_hardware", adminPermConfig);

  // ─── Hardware Scanner Lifecycle (focus-trap-aware via HardwareScannerService) ─
  useEffect(() => {
    if (!canUseHardware) return; // RBAC gate

    HardwareScannerService.start();
    const unsub = subscribeToHardwareScan((code) => {
      setScannedCode(code);
      setScannerOpen(false); // Close software scanner if open
    });

    return () => {
      unsub();
      HardwareScannerService.stop();
    };
  }, [canUseHardware]);

  // Handler: software scanner modal scanned a code
  const handleSoftwareScan = (code: string) => {
    setScannerOpen(false);
    setScannedCode(code);
  };

  const handleToggleFavorite = async (productId: string, productName: string) => {
    const updated = await toggleFavorite(productId);
    const isFavNow = updated.includes(productId);
    setFavToast(isFavNow ? `❤️ تمت إضافة "${productName}" إلى المفضلة` : `💔 تم إزالة "${productName}" من المفضلة`);
    setTimeout(() => setFavToast(null), 2500);
  };
  // Detail modal
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [heroGallery, setHeroGallery] = useState<{ position: number; image_url: string }[]>([]);

  const homeVis = settings?.homeMenuVisibility || {
    showLogos: true,
    showShare: true,
    showMap: true,
    showContact: true,
  };
  const [storeLocation, setStoreLocation] = useState<StoreLocation | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [homePosts, setHomePosts] = useState<Post[]>([]);

  const menuRef = useRef<HTMLDivElement>(null);
  const categoriesRef = useRef<HTMLDivElement>(null);

  const isManager = user?.role === "manager" || user?.role === "admin";

  const allAvailableProducts = useMemo(() => products, [products]);

  // Extract all categories dynamically from categories context and product notes
  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    categories.forEach((c) => {
      if (c.name) set.add(c.name.trim());
    });
    products.forEach((p) => {
      if (!p.notes) return;
      if (p.notes.includes("الفئة:")) {
        const cat = p.notes.split("الفئة:")[1]?.split("|")[0]?.trim();
        if (cat) set.add(cat);
      }
    });
    return Array.from(set).filter(Boolean);
  }, [products, categories]);

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

  useEffect(() => {
    supabase.from("store_locations").select("*").eq("is_active", true).limit(1).single()
      .then(({ data }) => { if (data) setStoreLocation(data); });
    supabase.from("team_members").select("*").eq("is_visible", true).order("display_order").limit(12)
      .then(({ data }) => { if (data) setTeamMembers(data); });
    supabase.from("posts").select("*").eq("is_published", true).order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => { if (data) setHomePosts(data); });
  }, []);

  const openMap = () => {
    const rawMapUrl =
      storeLocation?.google_maps_url ||
      settings.storeMapLink ||
      settings.storeMapEmbedUrl ||
      (settings.storeAddress
        ? `https://maps.google.com/?q=${encodeURIComponent(settings.storeAddress)}`
        : "https://maps.google.com/?q=أحمد+بحري+متجر");

    const isCapacitor = typeof window !== "undefined" && !!(window as typeof window & { Capacitor?: { isNativePlatform: () => boolean } }).Capacitor?.isNativePlatform?.();

    if (isCapacitor && rawMapUrl) {
      const geoQuery = rawMapUrl.includes("q=") ? rawMapUrl.split("q=")[1] : rawMapUrl.includes("@") ? rawMapUrl.split("@")[1].split(",")[0] : "";
      if (geoQuery) {
        window.location.href = `geo:0,0?q=${encodeURIComponent(geoQuery)}`;
        return;
      }
    }
    window.open(rawMapUrl, "_blank", "noopener,noreferrer");
  };

  const handleAdd = (product: typeof products[0]) => {
    const qty = cardQty[product.id] ?? 1;
    const tiers = getEffectiveTiers(product.id, globalPricingConfig);
    addItem({
      productId: product.id,
      name: product.name,
      image: product.image,
      retailPrice: product.retailPrice,
      wholesalePrice: product.wholesalePrice,
      quantity: qty,
      tiers,
    });
    setAddedId(product.id);
    setTimeout(() => setAddedId(null), 1200);
  };

  // ── Computed H1 text: changes with selected category or search ──
  const pageH1 = selectedCategory
    ? `${selectedCategory} - متجر أحمد بحري جملة ومفرد`
    : search
    ? `نتائج البحث عن: ${search} | قطع غيار دراجات نارية وكهربائية`
    : "متجر أحمد بحري | قطع غيار دراجات نارية وكهربائية - جملة ومفرد كركوك";

  const productsGridH2 = selectedCategory
    ? `منتجات قسم: ${selectedCategory}`
    : search
    ? `نتائج البحث: ${search}`
    : "جميع قطع الغيار الأصلية";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors" style={{ fontFamily: settings.fontFamily }}>

      {/* Visually hidden H1 — always present for Googlebot even when hero image covers it */}
      <h1 className="sr-only">{pageH1}</h1>

      {/* Wishlist Toast Notification */}
      {favToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-md border border-rose-500/40 text-xs font-extrabold animate-bounce flex items-center gap-2">
          <span>{favToast}</span>
        </div>
      )}

      {/* Sticky Responsive Header */}
      <nav className="sticky top-0 z-40 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 shadow-sm transition-colors" aria-label="التنقل الرئيسي">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20" dir="rtl">

            {/* Right: Logo & Main Menu Trigger */}
            <div className="flex items-center gap-2 sm:gap-4">

              {/* Main Menu Dropdown (Triggered by Store Logo) */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-all cursor-pointer group border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
                  title="القائمة الرئيسية"
                  aria-expanded={menuOpen}
                  aria-label="القائمة الرئيسية"
                >
                  {settings.logo ? (
                    <div className="relative w-9 h-9 sm:w-11 sm:h-11 rounded-xl overflow-hidden shadow-sm group-hover:scale-105 transition-transform flex-shrink-0">
                      <Image
                        src={settings.logo}
                        alt={`شعار ${settings.siteName}`}
                        fill
                        sizes="44px"
                        className="object-cover"
                        priority
                      />
                    </div>
                  ) : (
                    <div className="relative w-9 h-9 sm:w-11 sm:h-11 rounded-xl overflow-hidden shadow-sm group-hover:scale-105 transition-transform flex-shrink-0">
                      <Image
                        src="/logo.jpg"
                        alt="شعار متجر أحمد بحري"
                        fill
                        sizes="44px"
                        className="object-cover"
                        priority
                      />
                    </div>
                  )}
                  <span className="font-extrabold text-base sm:text-lg text-gray-900 dark:text-white hidden lg:inline group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {settings.siteName}
                  </span>
                  <svg
                    className={`w-4 h-4 text-gray-500 transition-transform ${menuOpen ? "rotate-180 text-blue-600" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {menuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl overflow-hidden z-50 animate-fadeIn text-right" dir="rtl">

                    {/* Top User Profile Header Card OR Login/Guest Prompt */}
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
                        onClick={() => {
                          if (user.isGuest || user.id.startsWith("guest-")) {
                            setGuestEditOpen(true);
                          } else {
                            setProfileEditOpen(true);
                          }
                          setMenuOpen(false);
                        }}
                        className="p-4 bg-gradient-to-br from-blue-50/80 via-indigo-50/50 to-purple-50/80 dark:from-blue-950/40 dark:via-gray-900 dark:to-purple-950/40 border-b border-gray-100 dark:border-gray-800 cursor-pointer hover:bg-blue-100/60 dark:hover:bg-blue-900/50 transition-all group"
                        title={user.isGuest || user.id.startsWith("guest-") ? "انقر لتعديل بيانات الضيف ✏️" : "انقر لتعديل الملف الشخصي والمعلومات الأمنيّة ✏️"}
                      >
                        <div className="flex items-center gap-3">
                          {user.avatarUrl ? (
                            <div className="relative w-12 h-12 rounded-2xl overflow-hidden border-2 border-blue-500 shadow-sm flex-shrink-0 group-hover:scale-105 transition-transform">
                              <Image
                                src={user.avatarUrl}
                                alt={`صورة ${user.fullName}`}
                                fill
                                sizes="48px"
                                className="object-cover"
                              />
                            </div>
                          ) : (
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 text-white font-extrabold text-lg flex items-center justify-center shadow-md flex-shrink-0 group-hover:scale-105 transition-transform">
                              {user.isGuest || user.id.startsWith("guest-") ? "🤝" : user.fullName?.charAt(0) || user.email?.charAt(0)?.toUpperCase() || "👤"}
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h4 className="font-extrabold text-sm text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                {user.fullName || "ضيف عزيز"} ✏️
                              </h4>
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold flex-shrink-0 ${
                                  user.isGuest || user.id.startsWith("guest-")
                                    ? "bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300"
                                    : user.role === "manager"
                                    ? "bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300"
                                    : user.role === "admin"
                                    ? "bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300"
                                    : "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300"
                                }`}
                              >
                                {user.isGuest || user.id.startsWith("guest-")
                                  ? "🤝 ضيف / Guest"
                                  : user.role === "manager"
                                  ? "👑 مدير نظام"
                                  : user.role === "admin"
                                  ? "🛡️ إداري"
                                  : "👤 زبون"}
                              </span>
                            </div>

                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5 font-mono">
                              {user.isGuest || user.id.startsWith("guest-")
                                ? user.governorate ? `المحافظة: ${user.governorate}` : "زائر المتجر"
                                : user.email || "حساب معتمد"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 border-b border-gray-100 dark:border-gray-800">
                        <Link
                          href="/login"
                          onClick={() => setMenuOpen(false)}
                          className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                        >
                          <span>🔑</span>
                          <span>تسجيل الدخول / الدخول كضيف</span>
                        </Link>
                      </div>
                    )}

                    <div className="p-2 space-y-1">
                      {/* Categories */}
                      <div ref={categoriesRef}>
                        <button
                          onClick={() => setCategoriesOpen(!categoriesOpen)}
                          className="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-right"
                          aria-expanded={categoriesOpen}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xl" aria-hidden="true">📁</span>
                            <span className="text-sm font-bold text-gray-700 dark:text-gray-200">أقسام المنتجات</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {selectedCategory && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                                {selectedCategory}
                              </span>
                            )}
                            <svg className={`w-4 h-4 transition-transform ${categoriesOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </button>

                        {categoriesOpen && (
                          <div className="mr-4 pr-3 border-r-2 border-blue-500/40 my-1 space-y-1 max-h-48 overflow-y-auto">
                            <button
                              onClick={() => { setSelectedCategory(null); setMenuOpen(false); }}
                              className={`w-full text-right px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                                !selectedCategory ? "bg-blue-600 text-white" : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200"
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
                                  onClick={() => { setSelectedCategory(cat); setMenuOpen(false); }}
                                  className={`w-full text-right px-3 py-2 rounded-lg text-xs font-bold transition-colors truncate ${
                                    selectedCategory === cat ? "bg-blue-600 text-white" : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200"
                                  }`}
                                >
                                  📁 {cat}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>

                      {/* DIVIDER 1 */}
                      <div className="border-t border-gray-100 dark:border-gray-800 my-1" />

                      {/* Invoices & Orders */}
                      {((user && (user.role === "manager" || user.role === "admin")) || (user && !user.isGuest && !user.id.startsWith("guest-"))) && (
                        <Link
                          href="/dashboard/invoices"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <span className="text-xl" aria-hidden="true">🧾</span>
                          <span className="text-sm font-bold text-gray-700 dark:text-gray-200">
                            {user.role === "manager" || user.role === "admin" ? "الفواتير والطلبات" : "فواتيري وطلباتي الشراء"}
                          </span>
                        </Link>
                      )}

                      {/* Dashboard */}
                      {user && (user.role === "manager" || user.role === "admin") && (
                        <Link
                          href="/dashboard"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <span className="text-xl" aria-hidden="true">📊</span>
                          <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{t.dashboard}</span>
                        </Link>
                      )}

                      {/* Settings */}
                      {user && (user.role === "manager" || user.role === "admin") && (
                        <Link
                          href="/dashboard/settings"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <span className="text-xl" aria-hidden="true">⚙️</span>
                          <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{t.settings}</span>
                        </Link>
                      )}

                      {/* Team Members Management */}
                      {user && (user.role === "manager" || user.role === "admin") && (
                        <Link
                          href="/dashboard/team"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <span className="text-xl" aria-hidden="true">👥</span>
                          <span className="text-sm font-bold text-gray-700 dark:text-gray-200">إدارة أعضاء الفريق</span>
                        </Link>
                      )}

                      {/* Posts Management */}
                      {user && (user.role === "manager" || user.role === "admin") && (
                        <Link
                          href="/dashboard/posts"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <span className="text-xl" aria-hidden="true">📢</span>
                          <span className="text-sm font-bold text-gray-700 dark:text-gray-200">إدارة المنشورات</span>
                        </Link>
                      )}

                      {/* Admin Permissions Management */}
                      {user && !user.isGuest && !user.id.startsWith("guest-") && (user.role === "manager" || hasPermission(user.role, "permissions.manage", getAdminPermissionsConfig())) && (
                        <Link
                          href="/dashboard/roles"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 transition-colors"
                        >
                          <span className="text-xl" aria-hidden="true">🔐</span>
                          <span className="text-sm font-bold">إدارة الصلاحيات</span>
                        </Link>
                      )}

                      {/* Guest edit & upgrade options */}
                      {(user?.isGuest || user?.id.startsWith("guest-")) && (
                        <>
                          <button
                            onClick={() => { setGuestEditOpen(true); setMenuOpen(false); }}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors text-right"
                          >
                            <span className="text-xl" aria-hidden="true">✏️</span>
                            <span className="text-sm font-bold text-amber-800 dark:text-amber-300">تعديل بيانات الضيف</span>
                          </button>

                          <Link
                            href="/login?mode=signup&upgrade=true"
                            onClick={() => setMenuOpen(false)}
                            className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold transition-colors"
                          >
                            <span className="text-xl" aria-hidden="true">🔑</span>
                            <span className="text-sm font-bold">ترقية لحساب رسمي</span>
                          </Link>
                        </>
                      )}

                      {/* DIVIDER 2 */}
                      <div className="border-t border-gray-100 dark:border-gray-800 my-1" />

                      {/* Products / My Products Button */}
                      {homeVis.showLogos !== false && (
                        (user?.role === "manager" || user?.role === "admin") ? (
                          <Link
                            href="/dashboard/products"
                            onClick={() => setMenuOpen(false)}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors text-right"
                          >
                            <span className="text-xl" aria-hidden="true">📦</span>
                            <div className="flex-1 text-right">
                              <span className="text-sm font-bold text-blue-700 dark:text-blue-400">المنتجات</span>
                              <p className="text-[11px] text-gray-400 mt-0.5">إدارة المنتجات والمخزون</p>
                            </div>
                          </Link>
                        ) : (
                          <button
                            onClick={() => { setMyProductsOpen(true); setMenuOpen(false); }}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors text-right"
                          >
                            <span className="text-xl" aria-hidden="true">🛍️</span>
                            <div className="flex-1 text-right">
                              <span className="text-sm font-bold text-blue-700 dark:text-blue-400">منتجاتي</span>
                              <p className="text-[11px] text-gray-400 mt-0.5">المنتجات المشتراة والمفضلة</p>
                            </div>
                          </button>
                        )
                      )}

                      {/* Messages Button */}
                      <button
                        onClick={() => { setCustomerMessagesOpen(true); setMenuOpen(false); }}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-sky-50 dark:hover:bg-sky-950/30 transition-colors text-right"
                      >
                        <span className="text-xl" aria-hidden="true">💬</span>
                        <div className="flex-1 text-right">
                          <span className="text-sm font-bold text-sky-700 dark:text-sky-400">الرسائل</span>
                          <p className="text-[11px] text-gray-400 mt-0.5">العروض والإشعارات والمحادثات المباشرة</p>
                        </div>
                      </button>

                      {/* Notifications Button */}
                      <button
                        onClick={() => { setCustomerNotificationsOpen(true); setMenuOpen(false); }}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors text-right group"
                      >
                        <span className="text-xl" aria-hidden="true">🔔</span>
                        <div className="flex-1 text-right flex items-center justify-between">
                          <div>
                            <span className="text-sm font-bold text-violet-700 dark:text-violet-400">الشعارات</span>
                            <p className="text-[11px] text-gray-400 mt-0.5">مركز التنبيهات المباشرة والتحديثات</p>
                          </div>
                          {notifUnreadCount > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-600 text-white animate-pulse">
                              {notifUnreadCount}
                            </span>
                          )}
                        </div>
                      </button>

                      {/* Share Button */}
                      {homeVis.showShare !== false && (
                        <button
                          onClick={() => { setShareOpen(true); setMenuOpen(false); }}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors text-right"
                        >
                          <span className="text-xl" aria-hidden="true">🔗</span>
                          <div className="flex-1 text-right">
                            <span className="text-sm font-bold text-indigo-700 dark:text-indigo-400">المشاركة</span>
                            <p className="text-[11px] text-gray-400 mt-0.5">مشاركة رابط المتجر والتطبيق</p>
                          </div>
                        </button>
                      )}

                      {/* Map Button */}
                      {homeVis.showMap !== false && (
                        <a
                          href={
                            (settings as any)?.google_maps_url ||
                            settings?.storeMapLink ||
                            `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                              (settings as any)?.store_address || settings?.storeAddress || "العراق كركوك"
                            )}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setMenuOpen(false)}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors text-right"
                        >
                          <span className="text-xl" aria-hidden="true">📍</span>
                          <div className="flex-1 text-right">
                            <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">موقعنا على الخريطة</span>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {(settings as any)?.store_address || settings?.storeAddress || "العراق — كركوك"}
                            </p>
                          </div>
                        </a>
                      )}

                      {/* Contact Button */}
                      {homeVis.showContact !== false && (
                        <button
                          onClick={() => { setContactOpen(true); setMenuOpen(false); }}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-teal-50 dark:hover:bg-teal-950/30 transition-colors text-right"
                        >
                          <span className="text-xl" aria-hidden="true">💬</span>
                          <div className="flex-1 text-right">
                            <span className="text-sm font-bold text-teal-700 dark:text-teal-400">التواصل والدعم الفني</span>
                            <p className="text-[11px] text-gray-400 mt-0.5">تواصل مباشر مع الدعم الفني والإدارة</p>
                          </div>
                        </button>
                      )}

                      {/* Posts Page Link */}
                      <Link
                        href="/posts"
                        onClick={() => setMenuOpen(false)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-950/30 transition-colors"
                      >
                        <span className="text-xl" aria-hidden="true">📢</span>
                        <span className="text-sm font-bold text-purple-700 dark:text-purple-400">المنشورات والمقاطع</span>
                      </Link>

                      {/* Logout */}
                      {user && (
                        <button
                          onClick={() => {
                            if (user.isGuest || user.id.startsWith("guest-")) {
                              setGuestRetentionOpen(true);
                            } else {
                              signOut();
                            }
                            setMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-right"
                        >
                          <span className="text-xl" aria-hidden="true">🚪</span>
                          <span className="text-sm font-bold text-red-600 dark:text-red-400">
                            {user.isGuest || user.id.startsWith("guest-") ? "خروج كزائر" : t.logout}
                          </span>
                        </button>
                      )}

                      {/* Dark / Light Mode Toggle */}
                      <button
                        onClick={() => toggleDarkMode()}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-right"
                      >
                        <span className="text-xl" aria-hidden="true">{settings.darkMode ? "☀️" : "🌙"}</span>
                        <span className="text-sm font-bold text-gray-700 dark:text-gray-200">
                          {settings.darkMode ? t.lightMode : t.darkMode}
                        </span>
                      </button>

                      {/* Eye Protection Toggle */}
                      <button
                        onClick={() => toggleEyeProtection()}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-right"
                      >
                        <span className="text-xl" aria-hidden="true">{settings.eyeProtection ? "👁️" : "🕶️"}</span>
                        <span className="text-sm font-bold text-gray-700 dark:text-gray-200">
                          {settings.eyeProtection ? t.eyeCareOff : t.eyeCare}
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Left: Search & Cart Icons */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Search Toggle Icon */}
              <button
                onClick={() => setSearchOpen(!searchOpen)}
                className="relative p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center justify-center"
                title={t.search}
                aria-label={t.search}
              >
                {settings.searchIcon ? (
                  <div className="relative" style={{ width: settings.searchIconSize || 28, height: settings.searchIconSize || 28 }}>
                    <Image src={settings.searchIcon} alt={t.search} fill className="object-contain" />
                  </div>
                ) : (
                  <span style={{ fontSize: (settings.searchIconSize || 28) * 0.8 }} aria-hidden="true">🔍</span>
                )}
              </button>

              {/* 📷 QR / Barcode Scanner Button — RBAC gated */}
              {canViewScannerBtn && (
                <button
                  id="barcode-scanner-btn"
                  onClick={() => setScannerOpen(true)}
                  className="relative p-2 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-600 dark:text-blue-400 transition-all flex items-center justify-center group"
                  title="ماسح الباركود والـ QR"
                  aria-label="فتح ماسح الباركود والـ QR"
                >
                  <span className="text-[22px] group-hover:scale-110 transition-transform" aria-hidden="true">📷</span>
                  {/* Pulse indicator to make it noticeable */}
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" />
                </button>
              )}

              {/* Customer Cart Icon */}
              <button
                onClick={() => setCartOpen(true)}
                className="relative p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center justify-center"
                title="سلة المشتريات"
                aria-label={`سلة المشتريات ${itemCount > 0 ? `(${itemCount} منتج)` : ""}`}
              >
                {settings.cartIcon ? (
                  <div className="relative" style={{ width: settings.cartIconSize || 28, height: settings.cartIconSize || 28 }}>
                    <Image src={settings.cartIcon} alt="سلة المشتريات" fill className="object-contain" />
                  </div>
                ) : (
                  <span style={{ fontSize: (settings.cartIconSize || 28) * 0.8 }} aria-hidden="true">🛒</span>
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
                  type="search"
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearchSubmit()}
                  placeholder={t.searchPlaceholder}
                  autoFocus
                  className="w-full py-3 pl-16 pr-12 border border-gray-300 dark:border-gray-700 rounded-full bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
                  aria-label="البحث في المنتجات"
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

      {/* ─────────────────────────────────────────────────────────
          Hero Banner Section — contains the visible H1 equivalent
          The sr-only <h1> above serves Googlebot; the visible
          heading in the hero serves real users.
          ───────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden" aria-label="الترحيب والشعار">
        {settings.heroImage ? (
          <div className="relative h-[260px] sm:h-[380px] lg:h-[450px]">
            <Image
              src={settings.heroImage}
              alt={`${settings.siteName} - تجارة قطع غيار الدراجات النارية والكهربائية في كركوك`}
              fill
              sizes="100vw"
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex items-end">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 sm:pb-12 w-full text-right" dir="rtl">
                {/* Visible hero heading — mirrors sr-only H1 but styled for users */}
                <p className="text-2xl sm:text-4xl lg:text-5xl font-extrabold text-white mb-2 drop-shadow-lg" aria-hidden="true">
                  مرحباً بك في {settings.siteName}
                </p>
                <p className="text-sm sm:text-lg text-gray-200 max-w-xl font-medium">
                  {selectedCategory
                    ? `تصفح ${selectedCategory} بأفضل الأسعار وخصومات الكميات`
                    : "تسوق أفضل قطع غيار الدراجات النارية والكهربائية بأسعار جملة ومفرد"}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-[280px] sm:h-[380px] flex items-center justify-center relative" style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` }}>
            <div className="text-center text-white relative z-10 px-4">
              {settings.logo ? (
                <div className="relative w-20 h-20 sm:w-28 sm:h-28 rounded-3xl overflow-hidden mx-auto mb-4 shadow-2xl ring-4 ring-white/20">
                  <Image
                    src={settings.logo}
                    alt={`شعار ${settings.siteName}`}
                    fill
                    sizes="112px"
                    className="object-cover"
                    priority
                  />
                </div>
              ) : (
                <div className="relative w-20 h-20 sm:w-28 sm:h-28 rounded-3xl overflow-hidden mx-auto mb-4 shadow-2xl ring-4 ring-white/20">
                  <Image
                    src="/logo.jpg"
                    alt="شعار متجر أحمد بحري"
                    fill
                    sizes="112px"
                    className="object-cover"
                    priority
                  />
                </div>
              )}
              <p className="text-2xl sm:text-4xl font-extrabold mb-2 drop-shadow-lg" aria-hidden="true">
                مرحباً بك في {settings.siteName}
              </p>
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
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6" aria-label="تصفية القسم النشط">
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 flex items-center justify-between" dir="rtl">
            <div className="flex items-center gap-2 text-sm font-bold text-blue-900 dark:text-blue-200">
              <span aria-hidden="true">📁 تصفية حسب القسم:</span>
              <span className="bg-blue-600 text-white px-3 py-1 rounded-xl text-xs">{selectedCategory}</span>
            </div>
            <button
              onClick={() => setSelectedCategory(null)}
              className="text-xs font-bold text-red-600 dark:text-red-400 hover:underline"
              aria-label="إلغاء تصفية القسم"
            >
              إلغاء التصفية ✕
            </button>
          </div>
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────
          Products Grid Section — H2 + H3 semantic hierarchy
          ───────────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" aria-label="معرض المنتجات">

        {/* H2: Products catalog section heading */}
        <h2 className="sr-only">{productsGridH2}</h2>

        {availableProducts.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-8 shadow-sm">
            <span className="text-6xl block mb-4" aria-hidden="true">📭</span>
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
              const effectiveTiers = getEffectiveTiers(product.id, globalPricingConfig);
              const qty = cardQty[product.id] ?? 1;
              const activeTier = resolveTierForQty(qty, effectiveTiers);
              const unitPrice = calculateTierPrice(product.retailPrice, activeTier);
              const hasDiscount = activeTier.discountPct > 0;
              const badgeText = buildTierBadgeText(effectiveTiers);

              const maxDiscountTier = effectiveTiers.reduce(
                (max, t) => (t.discountPct > max.discountPct ? t : max),
                effectiveTiers[0]
              );
              const lowestTierPrice = calculateTierPrice(product.retailPrice, maxDiscountTier);
              const wholesalePriceVal =
                product.wholesalePrice > 0 && product.wholesalePrice < product.retailPrice
                  ? product.wholesalePrice
                  : lowestTierPrice < product.retailPrice
                  ? lowestTierPrice
                  : Math.round(product.retailPrice * 0.9);
              const isFav = favoriteIds.includes(product.id);

              // SEO-optimized alt text using the utility
              const productAlt = generateProductAltText(product, selectedCategory);

              return (
                <article
                  key={product.id}
                  className="group bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden hover:shadow-xl transition-all duration-300 flex flex-col justify-between"
                  dir="rtl"
                  aria-label={`منتج: ${product.name}`}
                >
                  {/* Product Image — click to open detail modal */}
                  <div
                    className="relative aspect-square overflow-hidden bg-gray-100 dark:bg-gray-800 cursor-pointer"
                    onClick={() => setDetailProduct(product)}
                  >
                    {product.image ? (
                      <Image
                        src={product.image}
                        alt={productAlt}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-5xl text-gray-300" aria-hidden="true">📦</div>
                    )}

                    {/* Detail View Hint */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <span className="px-3 py-1.5 rounded-xl bg-white/90 dark:bg-gray-900/90 text-xs font-bold text-gray-700 dark:text-gray-200 shadow-lg backdrop-blur-sm">
                        🔍 عرض التفاصيل
                      </span>
                    </div>
                    {/* Tier Mode Badge */}
                    {hasDiscount && qty > 1 && (
                      <div className="absolute top-2 right-2">
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-extrabold bg-red-600 text-white shadow-md">
                          -{activeTier.discountPct}%
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="p-3 sm:p-4 space-y-3 flex-1 flex flex-col justify-between">
                    <div>
                      {/* H3: Product name — each product card has its own H3 */}
                      <h3
                        className="font-bold text-gray-900 dark:text-white text-sm leading-tight line-clamp-2 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        onClick={() => setDetailProduct(product)}
                      >
                        {product.name}
                      </h3>
                      {product.notes && (
                        <p className="text-xs text-gray-400 mt-1 line-clamp-1">
                          {extractCategoryFromNotes(product.notes)}
                        </p>
                      )}
                    </div>

                    {/* ── Dual Price Display ── */}
                    <div className="space-y-1.5">
                      {qty === 1 || !hasDiscount ? (
                        wholesalePriceVal < product.retailPrice ? (
                          <div className="flex items-baseline gap-1.5 flex-wrap">
                            <span className="text-xl sm:text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                              {wholesalePriceVal.toLocaleString()}
                            </span>
                            <span className="text-sm sm:text-base font-bold text-gray-400 dark:text-gray-500">-</span>
                            <span className="text-sm sm:text-base font-bold text-gray-600 dark:text-gray-300">
                              {product.retailPrice.toLocaleString()}
                            </span>
                            <span className="text-xs font-normal text-gray-400">{t.dinar}</span>
                          </div>
                        ) : (
                          <div className="flex items-baseline gap-1.5 flex-wrap">
                            <span className="text-xl sm:text-2xl font-extrabold text-blue-600 dark:text-blue-400">
                              {product.retailPrice.toLocaleString()}
                            </span>
                            <span className="text-xs font-normal text-gray-400">{t.dinar}</span>
                          </div>
                        )
                      ) : (
                        <div>
                          <div className="flex items-baseline gap-1.5 flex-wrap">
                            <span className="text-xl sm:text-2xl font-extrabold text-red-600 dark:text-red-400">
                              {unitPrice.toLocaleString()}
                            </span>
                            <span className="text-sm sm:text-base font-bold text-gray-400 dark:text-gray-500 line-through">
                              {product.retailPrice.toLocaleString()}
                            </span>
                            <span className="text-xs font-normal text-gray-400">{t.dinar}</span>
                            <span className="px-1.5 py-0.5 rounded-lg text-[10px] font-extrabold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 leading-none">
                              -{activeTier.discountPct}% ({activeTier.label})
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-md">
                            <span>إجمالي ({qty} قطع):</span>
                            <span className="font-extrabold">{(unitPrice * qty).toLocaleString()} {t.dinar}</span>
                          </div>
                        </div>
                      )}

                      {/* Dynamic tier badge instruction */}
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed">
                        {badgeText}
                      </p>
                    </div>

                    {/* ── Quick Qty Stepper + Add to Cart + Wishlist Heart ── */}
                    <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-2">
                      {/* Qty stepper */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-gray-400 flex-shrink-0">الكمية:</span>
                        <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden flex-1">
                          <button
                            onClick={() => setCardQty((prev) => ({ ...prev, [product.id]: Math.max(1, (prev[product.id] ?? 1) - 1) }))}
                            className="w-7 h-7 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 font-bold text-sm transition-colors flex-shrink-0"
                            aria-label={`تقليل الكمية لـ ${product.name}`}
                          >
                            −
                          </button>
                          <span className="flex-1 text-center text-xs font-extrabold text-gray-900 dark:text-white" aria-live="polite">
                            {qty}
                          </span>
                          <button
                            onClick={() => setCardQty((prev) => ({ ...prev, [product.id]: (prev[product.id] ?? 1) + 1 }))}
                            className="w-7 h-7 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 font-bold text-sm transition-colors flex-shrink-0"
                            aria-label={`زيادة الكمية لـ ${product.name}`}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Action Row: Add to Cart + Wishlist Heart button */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAdd(product)}
                          disabled={isAdded}
                          className="flex-1 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:scale-100 shadow-md min-h-[40px] flex items-center justify-center gap-1"
                          style={{ backgroundColor: isAdded ? "#10b981" : theme.primary }}
                          aria-label={`إضافة ${product.name} إلى السلة`}
                        >
                          {isAdded ? (
                            <span>✓ تم الإضافة</span>
                          ) : (
                            <span>
                              أضف {qty > 1 ? `${qty} قطع` : ""} للسلة 🛒
                              {hasDiscount && <span className="mr-1 opacity-80">(-{activeTier.discountPct}%)</span>}
                            </span>
                          )}
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleFavorite(product.id, product.name);
                          }}
                          className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all transform active:scale-125 border shrink-0 ${
                            isFav
                              ? "bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800/80 text-rose-600 dark:text-rose-400 scale-105 shadow-sm shadow-rose-100 dark:shadow-none"
                              : "bg-gray-50 dark:bg-gray-800/80 border-gray-200 dark:border-gray-700 text-gray-400 hover:text-rose-500 hover:bg-rose-50/50 hover:border-rose-200"
                          }`}
                          title={isFav ? "إزالة من المفضلة" : "إضافة للمفضلة"}
                          aria-label={isFav ? `إزالة ${product.name} من المفضلة` : `إضافة ${product.name} للمفضلة`}
                          aria-pressed={isFav}
                        >
                          {isFav ? "❤️" : "🤍"}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ─── Posts: home_bottom position ─── */}
      {homePosts.filter((p) => p.display_position === "home_bottom").length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" dir="rtl" aria-label="منشورات وإعلانات المتجر">
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <h2 className="text-xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
              <span aria-hidden="true">📢</span> منشورات وإعلانات
            </h2>
            <Link href="/posts" className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline">
              عرض الكل ←
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {homePosts.filter((p) => p.display_position === "home_bottom").slice(0, 3).map((p) => (
              <Link key={p.id} href="/posts" className="group bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden hover:shadow-lg transition-shadow block">
                {p.media_url && (
                  <div className="relative aspect-video overflow-hidden bg-gray-100 dark:bg-gray-800">
                    {p.media_type === "video" ? (
                      <video src={p.media_url} className="w-full h-full object-cover" />
                    ) : (
                      <Image
                        src={p.media_url}
                        alt={`${p.title} | متجر أحمد بحري`}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                    )}
                  </div>
                )}
                <div className="p-4">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${p.post_type === "promotional" ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300" : "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"}`}>
                    {p.post_type === "promotional" ? "📣 ترويجي" : "📚 تعليمي"}
                  </span>
                  <h3 className="font-extrabold text-gray-900 dark:text-white mt-2 text-sm line-clamp-2">{p.title}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{p.body}</p>
                  <p className="text-xs text-gray-400 mt-2 flex items-center gap-1"><span aria-hidden="true">👁️</span> {p.views_count} مشاهدة</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ─── Team Members Footer Section ─── */}
      {teamMembers.length > 0 && (
        <section className="border-t border-gray-200 dark:border-gray-800 bg-gradient-to-br from-gray-50 to-blue-50/30 dark:from-gray-900 dark:to-blue-950/20 py-12 px-4 overflow-x-hidden" dir="rtl" aria-label="فريق عملنا">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white"><span aria-hidden="true">👥</span> فريق عملنا</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">تعرف على الفريق المتميز وراء متجر أحمد بحري</p>
            </div>
            <div className="flex flex-wrap justify-center gap-6">
              {teamMembers.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-col items-center text-center bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm hover:shadow-md transition-shadow w-36 sm:w-44"
                >
                  {m.avatar_url ? (
                    <div className="relative w-16 h-16 rounded-2xl overflow-hidden border-2 border-blue-200 dark:border-blue-800 mb-3">
                      <Image
                        src={m.avatar_url}
                        alt={`صورة ${m.full_name} - ${m.job_title} في متجر أحمد بحري`}
                        fill
                        sizes="64px"
                        className="object-cover"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-extrabold text-2xl mb-3" aria-hidden="true">
                      {m.full_name.charAt(0)}
                    </div>
                  )}
                  <h3 className="font-extrabold text-gray-900 dark:text-white text-sm">{m.full_name}</h3>
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-bold mt-0.5">{m.job_title}</p>
                  {m.bio && <p className="text-[11px] text-gray-400 mt-1 line-clamp-2">{m.bio}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─── Store Location Banner ─── */}
      <div className="bg-emerald-600 dark:bg-emerald-700 text-white py-4 px-4 shadow-md transition-colors" dir="rtl">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-right">
          {/* Right Side: Store Name & Database Address */}
          <a
            href={
              settings.storeMapLink ||
              storeLocation?.google_maps_url ||
              `https://maps.google.com/?q=${encodeURIComponent(settings.storeAddress || "متجر أحمد بحري كركوك")}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 group text-white hover:opacity-95 transition-opacity cursor-pointer"
          >
            <span className="text-2xl group-hover:scale-110 transition-transform" aria-hidden="true">📍</span>
            <div>
              <p className="font-extrabold text-sm sm:text-base">
                {settings.siteName || storeLocation?.name || "متجر أحمد بحري"}
              </p>
              <p className="text-xs text-emerald-100 font-medium">
                {settings.storeAddress || (storeLocation ? `${storeLocation.city ? storeLocation.city + " — " : ""}${storeLocation.address}` : "")}
              </p>
            </div>
          </a>

          {/* Left Side: Interactive Map Link labeled "موقعنا" */}
          <a
            href={
              settings.storeMapLink ||
              storeLocation?.google_maps_url ||
              `https://maps.google.com/?q=${encodeURIComponent(settings.storeAddress || "متجر أحمد بحري كركوك")}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2 bg-white text-emerald-700 hover:bg-emerald-50 font-extrabold text-sm rounded-xl shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
          >
            <span aria-hidden="true">🗺️</span>
            <span>موقعنا</span>
          </a>
        </div>
      </div>

      {/* Customizable Dynamic Enterprise Footer */}
      <Footer />

      {/* Customer Cart Drawer */}
      <CustomerCartSidebar isOpen={cartOpen} onClose={() => setCartOpen(false)} />

      {/* ─── Barcode / QR Scanner Modal ─────────────────────────────────── */}
      <BarcodeScanner
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleSoftwareScan}
        canUseCamera={canUseCamera}
        canUseImageUpload={canUseImageUpload}
        canUseManualEntry={canUseManualEntry}
      />

      {/* ─── POS-Style Scanner Product Modal with Smart Queue ───────────── */}
      <ScannerProductModal
        scannedCode={scannedCode}
        onClose={() => setScannedCode(null)}
        onAddedToCart={() => {
          // Optionally open cart after adding from scanner
        }}
      />

      {/* Product Detail Modal with Real-Time Pricing */}
      {detailProduct && (
        <ProductDetailModal
          product={detailProduct}
          tiers={getEffectiveTiers(detailProduct.id, globalPricingConfig)}
          onClose={() => setDetailProduct(null)}
        />
      )}

      {/* Guest Welcome Modal */}
      <GuestWelcomeModal forceOpen={guestEditOpen} onClose={() => setGuestEditOpen(false)} />

      {/* Profile Edit Modal */}
      <ProfileEditModal isOpen={profileEditOpen} onClose={() => setProfileEditOpen(false)} />

      {/* My Products / Favorites Modal */}
      <CustomerProductsModal isOpen={myProductsOpen} onClose={() => setMyProductsOpen(false)} />

      {/* Customer Messages & Broadcasts Modal */}
      <CustomerMessagesModal isOpen={customerMessagesOpen} onClose={() => setCustomerMessagesOpen(false)} />

      {/* Customer Notifications Center Modal */}
      <CustomerNotificationsModal isOpen={customerNotificationsOpen} onClose={() => setCustomerNotificationsOpen(false)} />

      {/* Guest Retention Warning Modal */}
      <GuestRetentionModal
        isOpen={guestRetentionOpen}
        onClose={() => setGuestRetentionOpen(false)}
        onConfirmLogout={() => signOut()}
      />

      {/* Direct Contact & Technical Support Modal */}
      <ContactSupportModal isOpen={contactOpen} onClose={() => setContactOpen(false)} />

      {/* Store & App Share Modal */}
      {shareOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={() => setShareOpen(false)} dir="rtl">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 w-full max-w-md shadow-2xl mx-4 text-right animate-scaleUp" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xl font-bold" aria-hidden="true">
                  🔗
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-gray-900 dark:text-white">المشاركة</h3>
                  <p className="text-xs text-gray-400">شارك رابط الموقع والتطبيق بسهولة</p>
                </div>
              </div>
              <button onClick={() => setShareOpen(false)} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 text-lg" aria-label="إغلاق">✕</button>
            </div>

            <div className="space-y-4">
              {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
                <button
                  onClick={async () => {
                    try {
                      await navigator.share({
                        title: settings.siteName || "متجر أحمد بحري",
                        text: `تسوق أفضل المنتجات من متجر ${settings.siteName || "أحمد بحري"}`,
                        url: typeof window !== "undefined" ? window.location.origin : "",
                      });
                    } catch { /* user cancel */ }
                  }}
                  className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-extrabold text-xs sm:text-sm rounded-2xl shadow-md flex items-center justify-center gap-2 transition-transform hover:scale-[1.01]"
                >
                  <span aria-hidden="true">📱</span>
                  <span>مشاركة فورية عبر تطبيقات الهاتف (Share)</span>
                </button>
              )}

              <div className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700/60 space-y-2">
                <p className="text-xs font-bold text-gray-700 dark:text-gray-300">رابط المتجر المباشر</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={typeof window !== "undefined" ? window.location.origin : "https://ahmed-bahri.vercel.app"}
                    className="flex-1 px-3 py-2 text-xs font-mono bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-800 dark:text-gray-200 outline-none"
                    aria-label="رابط المتجر"
                  />
                  <button
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        navigator.clipboard.writeText(window.location.origin);
                        setCopyNotice(true);
                        setTimeout(() => setCopyNotice(false), 2500);
                      }
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-md whitespace-nowrap"
                  >
                    {copyNotice ? "✓ تم النسخ!" : "نسخ الرابط"}
                  </button>
                </div>
                {copyNotice && (
                  <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400" role="status">
                    📋 تم نسخ رابط المتجر إلى المحفظة بنجاح!
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent("تسوق أفضل المنتجات في متجر أحمد بحري: " + (typeof window !== "undefined" ? window.location.origin : ""))}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded-2xl font-bold text-xs border border-emerald-200 dark:border-emerald-800/40 hover:scale-[1.02] transition-transform"
                >
                  <span aria-hidden="true">💬</span> واتساب
                </a>
                <a
                  href={`https://t.me/share/url?url=${encodeURIComponent(typeof window !== "undefined" ? window.location.origin : "")}&text=${encodeURIComponent("موقع أحمد بحري")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 rounded-2xl font-bold text-xs border border-blue-200 dark:border-blue-800/40 hover:scale-[1.02] transition-transform"
                >
                  <span aria-hidden="true">✈️</span> تليجرام
                </a>
              </div>

              {(settings.androidAppUrl || settings.iosAppUrl) && (
                <div className="p-3 bg-gradient-to-br from-indigo-50/50 to-purple-50/50 dark:from-indigo-950/30 dark:to-purple-950/30 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 space-y-2">
                  <p className="text-xs font-bold text-indigo-900 dark:text-indigo-200">تحميل تطبيق الهاتف الذكي</p>
                  <div className="flex gap-2">
                    {settings.androidAppUrl && (
                      <a href={settings.androidAppUrl} target="_blank" rel="noreferrer" className="flex-1 py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs text-center"><span aria-hidden="true">🤖</span> أندرويد</a>
                    )}
                    {settings.iosAppUrl && (
                      <a href={settings.iosAppUrl} target="_blank" rel="noreferrer" className="flex-1 py-2 bg-gray-900 text-white rounded-xl font-bold text-xs text-center"><span aria-hidden="true">🍎</span> آيفون</a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

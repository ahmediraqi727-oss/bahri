"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

export type Lang = "ar" | "en";

interface Translations {
  search: string;
  searchPlaceholder: string;
  mainMenu: string;
  login: string;
  logout: string;
  dashboard: string;
  products: string;
  suppliers: string;
  settings: string;
  darkMode: string;
  lightMode: string;
  eyeCare: string;
  eyeCareOff: string;
  help: string;
  addToCart: string;
  added: string;
  pieces: string;
  dinar: string;
  noProducts: string;
  noResults: string;
  noSimilar: string;
  productUnavailable: string;
  similarProducts: string;
  clearSearch: string;
  match: string;
  viewProduct: string;
  resultCount: string;
  productCount: string;
  supplierCount: string;
  cartEmpty: string;
  checkout: string;
  total: string;
  close: string;
  zoomIn: string;
  zoomOut: string;
  language: string;
  arabic: string;
  english: string;
  contactUs: string;
  sendMessage: string;
  yourName: string;
  yourPhone: string;
  yourMessage: string;
  send: string;
  messageSent: string;
  callUs: string;
  emailUs: string;
}

const TRANSLATIONS: Record<Lang, Translations> = {
  ar: {
    search: "بحث",
    searchPlaceholder: "ابحث عن منتج...",
    mainMenu: "القائمة الرئيسية",
    login: "تسجيل الدخول",
    logout: "تسجيل خروج",
    dashboard: "لوحة التحكم",
    products: "المنتجات",
    suppliers: "الموردين",
    settings: "الإعدادات",
    darkMode: "الوضع الليلي",
    lightMode: "الوضع النهاري",
    eyeCare: "حماية العين",
    eyeCareOff: "إلغاء حماية العين",
    help: "المساعدة",
    addToCart: "أضف للسلة",
    added: "تم",
    pieces: "قطعة",
    dinar: "د.ع",
    noProducts: "لا توجد منتجات متاحة حالياً",
    noResults: "لا توجد نتائج للبحث",
    noSimilar: "لا توجد منتجات مشابهة",
    productUnavailable: "المنتج غير متوفر حالياً",
    similarProducts: "قد تهمك هذه المنتجات المشابهة:",
    clearSearch: "مسح البحث",
    match: "تطابق",
    viewProduct: "عرض المنتج",
    resultCount: "نتيجة مشابهة بالصورة",
    productCount: "منتج",
    supplierCount: "مورد",
    cartEmpty: "السلة فارغة",
    checkout: "إتمام الطلب",
    total: "الإجمالي",
    close: "إغلاق",
    zoomIn: "تكبير الخط",
    zoomOut: "تصغير الخط",
    language: "اللغة",
    arabic: "العربية",
    english: "English",
    contactUs: "تواصل معنا",
    sendMessage: "أرسل رسالة للإدارة",
    yourName: "الاسم",
    yourPhone: "رقم الهاتف",
    yourMessage: "رسالتك",
    send: "إرسال",
    messageSent: "تم إرسال رسالتك بنجاح!",
    callUs: "اتصل بنا",
    emailUs: "راسلنا",
  },
  en: {
    search: "Search",
    searchPlaceholder: "Search for a product...",
    mainMenu: "Main Menu",
    login: "Login",
    logout: "Logout",
    dashboard: "Dashboard",
    products: "Products",
    suppliers: "Suppliers",
    settings: "Settings",
    darkMode: "Dark Mode",
    lightMode: "Light Mode",
    eyeCare: "Eye Care",
    eyeCareOff: "Disable Eye Care",
    help: "Help",
    addToCart: "Add to Cart",
    added: "Added",
    pieces: "pcs",
    dinar: "IQD",
    noProducts: "No products available",
    noResults: "No results found",
    noSimilar: "No similar products",
    productUnavailable: "Product is currently unavailable",
    similarProducts: "You might like these similar products:",
    clearSearch: "Clear Search",
    match: "match",
    viewProduct: "View Product",
    resultCount: "similar results by image",
    productCount: "products",
    supplierCount: "suppliers",
    cartEmpty: "Cart is empty",
    checkout: "Checkout",
    total: "Total",
    close: "Close",
    zoomIn: "Zoom In",
    zoomOut: "Zoom Out",
    language: "Language",
    arabic: "العربية",
    english: "English",
    contactUs: "Contact Us",
    sendMessage: "Send a message to admin",
    yourName: "Your Name",
    yourPhone: "Phone Number",
    yourMessage: "Your Message",
    send: "Send",
    messageSent: "Your message has been sent!",
    callUs: "Call Us",
    emailUs: "Email Us",
  },
};

interface LangContextType {
  lang: Lang;
  t: Translations;
  setLang: (l: Lang) => void;
}

const LangContext = createContext<LangContextType>({ lang: "ar", t: TRANSLATIONS.ar, setLang: () => {} });

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ar");

  useEffect(() => {
    const saved = localStorage.getItem("site-lang") as Lang | null;
    if (saved && TRANSLATIONS[saved]) {
      setLangState(saved);
      document.documentElement.dir = saved === "ar" ? "rtl" : "ltr";
      document.documentElement.lang = saved;
    }
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem("site-lang", l);
    document.documentElement.dir = l === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = l;
  }, []);

  return (
    <LangContext.Provider value={{ lang, t: TRANSLATIONS[lang], setLang }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}

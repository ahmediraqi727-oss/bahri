"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { SiteSettings, DEFAULT_SETTINGS, UserRole, RoleTheme } from "./types";
import { supabase } from "./supabase-client";

interface SettingsContextType {
  settings: SiteSettings;
  loading: boolean;
  updateSettings: (updates: Partial<SiteSettings>) => Promise<void>;
  updateRoleTheme: (role: UserRole, theme: Partial<RoleTheme>) => Promise<void>;
  setCurrentRole: (role: UserRole) => void;
  toggleDarkMode: () => Promise<void>;
  toggleEyeProtection: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);
const STORAGE_KEY = "app_site_settings_cache";

function rowToSettings(row: Record<string, unknown>): SiteSettings {
  const rt = (row.role_themes as Record<string, Record<string, string>>) || {};
  const wm = (row.watermark_config as Record<string, any>) || {};

  return {
    siteName: (row.site_name as string) || DEFAULT_SETTINGS.siteName,
    logo: (row.logo as string) || "",
    heroImage: (row.hero_image as string) || (row.hero_image_url as string) || "",
    footerImage: (row.footer_image as string) || (row.footer_image_url as string) || "",
    fontFamily: (row.font_family as string) || "Cairo",
    fontSize: Number(row.font_size) || 16,
    primaryColor: (row.primary_color as string) || "#2563eb",
    secondaryColor: (row.secondary_color as string) || "#7c3aed",
    accentColor: (row.accent_color as string) || "#f59e0b",
    darkMode: Boolean(row.dark_mode) || false,
    eyeProtection: Boolean(row.eye_protection) || false,
    whatsappLink: (row.whatsapp_link as string) || (row.whatsapp_number as string) || "",
    telegramLink: (row.telegram_link as string) || (row.telegram_url as string) || "",
    messengerLink: (row.messenger_link as string) || (row.messenger_url as string) || "",
    phoneLink: (row.phone_link as string) || (row.direct_phone as string) || "07800000000",

    // Icons & Custom Sizing
    homeIcon: (row.home_icon as string) || "",
    homeIconSize: Number(row.home_icon_size) || 28,
    searchIcon: (row.search_icon as string) || "",
    searchIconSize: Number(row.search_icon_size) || 28,
    cartIcon: (row.cart_icon as string) || "",
    cartIconSize: Number(row.cart_icon_size) || 28,

    // Footer Customization
    footerHeight: Number(row.footer_height) || 120,
    footerRightText: (row.footer_right_text as string) || DEFAULT_SETTINGS.footerRightText,
    footerCenterText: (row.footer_center_text as string) || DEFAULT_SETTINGS.footerCenterText,
    footerLeftText: (row.footer_left_text as string) || DEFAULT_SETTINGS.footerLeftText,

    // Carousel & Delivery toggle
    showCategoriesCarousel: row.show_categories_carousel !== undefined ? Boolean(row.show_categories_carousel) : true,
    defaultDeliveryFee: row.default_delivery_fee !== undefined ? Number(row.default_delivery_fee) : 5000,
    defaultDeliveryDuration: (row.default_delivery_duration as string) || "2 - 3 أيام عمل",

    // Watermark Configuration
    watermarkConfig: {
      enabled: wm.enabled !== undefined ? Boolean(wm.enabled) : false,
      watermarkUrl: wm.watermarkUrl || wm.watermark_url || "",
      position: wm.position || "bottom-right",
      customX: wm.customX !== undefined ? Number(wm.customX) : (wm.custom_x !== undefined ? Number(wm.custom_x) : 85),
      customY: wm.customY !== undefined ? Number(wm.customY) : (wm.custom_y !== undefined ? Number(wm.custom_y) : 85),
      opacity: wm.opacity !== undefined ? Number(wm.opacity) : 80,
      scale: wm.scale !== undefined ? Number(wm.scale) : 20,
      applyOnUpload: wm.applyOnUpload !== undefined ? Boolean(wm.applyOnUpload) : (wm.apply_on_upload !== undefined ? Boolean(wm.apply_on_upload) : true),
      targetBucket: wm.targetBucket || wm.target_bucket || "watermarked-products",
    },

    currentRole: "manager",
    roleThemes: {
      manager: {
        primary: rt.manager?.primary || "#1e40af",
        secondary: rt.manager?.secondary || "#7c3aed",
        accent: rt.manager?.accent || "#f59e0b",
      },
      admin: {
        primary: rt.admin?.primary || "#059669",
        secondary: rt.admin?.secondary || "#0891b2",
        accent: rt.admin?.accent || "#f97316",
      },
      customer: {
        primary: rt.customer?.primary || "#2563eb",
        secondary: rt.customer?.secondary || "#6366f1",
        accent: rt.customer?.accent || "#ec4899",
      },
    },
  };
}

function settingsToRow(settings: SiteSettings): Record<string, unknown> {
  return {
    site_name: settings.siteName,
    logo: settings.logo,
    hero_image: settings.heroImage,
    hero_image_url: settings.heroImage,
    footer_image: settings.footerImage,
    footer_image_url: settings.footerImage,
    font_family: settings.fontFamily,
    font_size: settings.fontSize,
    primary_color: settings.primaryColor,
    secondary_color: settings.secondaryColor,
    accent_color: settings.accentColor,
    dark_mode: settings.darkMode,
    eye_protection: settings.eyeProtection,
    whatsapp_link: settings.whatsappLink || "",
    whatsapp_number: settings.whatsappLink || "",
    telegram_link: settings.telegramLink || "",
    telegram_url: settings.telegramLink || "",
    messenger_link: settings.messengerLink || "",
    messenger_url: settings.messengerLink || "",
    phone_link: settings.phoneLink || "",
    direct_phone: settings.phoneLink || "",
    home_icon: settings.homeIcon || "",
    home_icon_size: settings.homeIconSize || 28,
    search_icon: settings.searchIcon || "",
    search_icon_size: settings.searchIconSize || 28,
    cart_icon: settings.cartIcon || "",
    cart_icon_size: settings.cartIconSize || 28,
    footer_height: settings.footerHeight || 120,
    footer_right_text: settings.footerRightText || "",
    footer_center_text: settings.footerCenterText || "",
    footer_left_text: settings.footerLeftText || "",
    show_categories_carousel: settings.showCategoriesCarousel !== undefined ? settings.showCategoriesCarousel : true,
    default_delivery_fee: settings.defaultDeliveryFee !== undefined ? settings.defaultDeliveryFee : 5000,
    default_delivery_duration: settings.defaultDeliveryDuration || "2 - 3 أيام عمل",
    watermark_config: settings.watermarkConfig,
    role_themes: settings.roleThemes,
  };
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  // Synchronize Dark Mode, Eye Protection Sepia Filter, and Font to DOM document element
  useEffect(() => {
    if (typeof document !== "undefined") {
      // 1. Dark mode class
      if (settings.darkMode) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }

      // 2. Eye protection filter
      if (settings.eyeProtection) {
        document.documentElement.classList.add("eye-care");
        document.documentElement.style.filter = "sepia(0.35) contrast(0.95) brightness(0.95)";
      } else {
        document.documentElement.classList.remove("eye-care");
        document.documentElement.style.filter = "none";
      }

      document.documentElement.style.fontFamily = settings.fontFamily || "Cairo";
    }
  }, [settings.darkMode, settings.eyeProtection, settings.fontFamily]);

  // Read cached settings from localStorage on initial render for instant display
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && typeof parsed === "object") {
            setSettings((prev) => ({ ...prev, ...parsed }));
          }
        }
      } catch (err) {
        console.warn("Error reading settings cache:", err);
      }
    }
  }, []);

  // Load public global settings from Supabase database for ALL visitors
  useEffect(() => {
    async function loadFromDb() {
      try {
        const { data, error } = await supabase.from("settings").select("*").limit(1).maybeSingle();
        if (data) {
          const parsed = rowToSettings(data);
          setSettings(parsed);
          setSettingsId(data.id);
          if (typeof window !== "undefined") {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
          }
        } else if (error) {
          console.warn("Supabase settings fetch warning:", error.message);
        }
      } catch (err) {
        console.warn("Settings fetch error:", err);
      } finally {
        setLoading(false);
      }
    }
    loadFromDb();

    // Supabase Real-Time Settings Subscription
    const channel = supabase
      .channel("public:settings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "settings" },
        (payload) => {
          if (payload.new && typeof payload.new === "object") {
            const updated = rowToSettings(payload.new as Record<string, unknown>);
            setSettings(updated);
            if (typeof window !== "undefined") {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const updateSettings = useCallback(
    async (updates: Partial<SiteSettings>) => {
      const merged = { ...settings, ...updates };
      const row = settingsToRow(merged);

      // Update local state and localStorage cache immediately
      setSettings(merged);
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      }

      // Persist to Supabase database cleanly
      let resultData: Record<string, unknown> | null = null;
      let queryError: { message: string; details?: string; hint?: string } | null = null;

      try {
        if (settingsId) {
          const res = await supabase.from("settings").update(row).eq("id", settingsId).select().single();
          resultData = res.data;
          queryError = res.error;
        } else {
          // Check if a row already exists in table
          const existing = await supabase.from("settings").select("id").limit(1).maybeSingle();
          if (existing.data) {
            setSettingsId(existing.data.id);
            const res = await supabase.from("settings").update(row).eq("id", existing.data.id).select().single();
            resultData = res.data;
            queryError = res.error;
          } else {
            const res = await supabase.from("settings").insert(row).select().single();
            resultData = res.data;
            queryError = res.error;
          }
        }
      } catch (err: unknown) {
        console.error("Database query exception:", err);
        const message = err instanceof Error ? err.message : String(err);
        queryError = { message };
      }

      if (queryError) {
        console.error("Failed to save settings to database:", queryError);
        throw new Error(queryError.message || "فشل حفظ الإعدادات في قاعدة البيانات");
      }

      if (resultData && resultData.id) {
        setSettingsId(resultData.id as string);
      }
    },
    [settings, settingsId]
  );

  const updateRoleTheme = useCallback(
    async (role: UserRole, theme: Partial<RoleTheme>) => {
      const newThemes = { ...settings.roleThemes, [role]: { ...settings.roleThemes[role], ...theme } };
      await updateSettings({ roleThemes: newThemes });
    },
    [settings, updateSettings]
  );

  const setCurrentRole = useCallback((role: UserRole) => {
    setSettings((prev) => ({ ...prev, currentRole: role }));
  }, []);

  const toggleDarkMode = useCallback(async () => {
    await updateSettings({ darkMode: !settings.darkMode });
  }, [settings.darkMode, updateSettings]);

  const toggleEyeProtection = useCallback(async () => {
    await updateSettings({ eyeProtection: !settings.eyeProtection });
  }, [settings.eyeProtection, updateSettings]);

  return (
    <SettingsContext.Provider
      value={{ settings, loading, updateSettings, updateRoleTheme, setCurrentRole, toggleDarkMode, toggleEyeProtection }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used within a SettingsProvider");
  return context;
}

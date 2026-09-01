"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { SiteSettings, DEFAULT_SETTINGS, UserRole, RoleTheme, DEFAULT_PRICING_CONFIG } from "./types";
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

  const storeNameVal = (row.store_name as string) || (row.site_name as string) || DEFAULT_SETTINGS.siteName;
  const storeAddressVal = (row.store_address as string) || (row.address as string) || DEFAULT_SETTINGS.storeAddress;
  const mapUrlVal = (row.google_maps_url as string) || (row.store_map_link as string) || (row.map_url as string) || DEFAULT_SETTINGS.storeMapLink;
  const phonePrimaryVal = (row.phone_primary as string) || (row.phone_link as string) || (row.direct_phone as string) || "07800000000";
  const phoneSecondaryVal = (row.phone_secondary as string) || (row.phone_link2 as string) || "";
  const whatsappVal = (row.whatsapp as string) || (row.whatsapp_link as string) || (row.whatsapp_number as string) || "";
  const facebookVal = (row.facebook as string) || (row.facebook_link as string) || "";
  const instagramVal = (row.instagram as string) || (row.instagram_link as string) || "";
  const tiktokVal = (row.tiktok as string) || (row.tiktok_link as string) || "";
  const androidAppUrlVal = (row.android_app_url as string) || "";
  const iosAppUrlVal = (row.ios_app_url as string) || "";
  const scannerPermissionsVal = (row.scanner_permissions as any) || (row.scannerPermissions as any) || {
    camera: true,
    imageUpload: true,
    manualEntry: true,
    hardwareScanner: true,
    adminGenerate: true,
  };

  return {
    siteName: storeNameVal,
    storeName: storeNameVal,
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

    // WhatsApp, Phone, Contact
    whatsapp: whatsappVal,
    whatsappLink: whatsappVal,
    telegramLink: (row.telegram_link as string) || (row.telegram_url as string) || "",
    messengerLink: (row.messenger_link as string) || (row.messenger_url as string) || "",
    phonePrimary: phonePrimaryVal,
    phoneLink: phonePrimaryVal,
    phoneSecondary: phoneSecondaryVal,
    phoneLink2: phoneSecondaryVal,

    // Social Media Links
    facebook: facebookVal,
    facebookLink: facebookVal,
    instagram: instagramVal,
    instagramLink: instagramVal,
    tiktok: tiktokVal,
    tiktokLink: tiktokVal,
    youtubeLink: (row.youtube_link as string) || "",

    // Store Location & Map
    storeAddress: storeAddressVal,
    googleMapsUrl: mapUrlVal,
    storeMapLink: mapUrlVal,
    storeMapEmbedUrl: (row.store_map_embed_url as string) || "",

    // App Download Links & Scanner Permissions
    appDownloadUrl: (row.app_download_url as string) || "",
    androidAppUrl: androidAppUrlVal,
    iosAppUrl: iosAppUrlVal,
    scannerPermissions: scannerPermissionsVal,

    // Custom Themes & Active Theme Preset
    customThemes: (row.custom_themes as any) || [],
    activeThemePreset: (row.active_theme_preset as string) || "classic-blue",

    // Notification Audio & Mute Settings
    notificationSoundUrl: (row.notification_sound_url as string) || "/sounds/chime.mp3",
    notificationVolume: row.notification_volume !== undefined ? Number(row.notification_volume) : 0.8,
    defaultMuteDuration: row.default_mute_duration !== undefined ? Number(row.default_mute_duration) : 1,
    customerNotificationCategories: (row.customer_notification_categories as any) || {
      allowReplies: true,
      allowOffers: true,
      allowPosts: true,
    },

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
    barcodeEngineActive: row.barcode_engine_active !== undefined ? Boolean(row.barcode_engine_active) : (row.barcodeEngineActive !== undefined ? Boolean(row.barcodeEngineActive) : true),
    defaultDeliveryFee: row.default_delivery_fee !== undefined ? Number(row.default_delivery_fee) : 5000,
    defaultDeliveryDuration: (row.default_delivery_duration as string) || "2 - 3 أيام عمل",

    // Watermark Configuration
    watermarkConfig: {
      enabled: wm.enabled !== undefined ? Boolean(wm.enabled) : true,
      watermarkUrl: (wm.watermarkUrl || wm.watermark_url || "").startsWith("data:image/")
        ? "/watermark.png"
        : (wm.watermarkUrl || wm.watermark_url || "/watermark.png"),
      position: wm.position || "top-left",
      customX: wm.customX !== undefined ? Number(wm.customX) : (wm.custom_x !== undefined ? Number(wm.custom_x) : 10),
      customY: wm.customY !== undefined ? Number(wm.customY) : (wm.custom_y !== undefined ? Number(wm.custom_y) : 10),
      opacity: wm.opacity !== undefined ? Number(wm.opacity) : 90,
      scale: wm.scale !== undefined ? Number(wm.scale) : 22,
      applyOnUpload: wm.applyOnUpload !== undefined ? Boolean(wm.applyOnUpload) : (wm.apply_on_upload !== undefined ? Boolean(wm.apply_on_upload) : true),
      targetBucket: wm.targetBucket || wm.target_bucket || "watermarked-products",
    },

    homeMenuVisibility: {
      showLogos: (row.home_menu_visibility as any)?.showLogos !== undefined ? Boolean((row.home_menu_visibility as any).showLogos) : true,
      showShare: (row.home_menu_visibility as any)?.showShare !== undefined ? Boolean((row.home_menu_visibility as any).showShare) : true,
      showMap: (row.home_menu_visibility as any)?.showMap !== undefined ? Boolean((row.home_menu_visibility as any).showMap) : true,
      showContact: (row.home_menu_visibility as any)?.showContact !== undefined ? Boolean((row.home_menu_visibility as any).showContact) : true,
    },

    // ─ Pricing Tiers Engine ───────────────────────────────────
    pricingTiers: (() => {
      if (!row.pricing_tiers) return DEFAULT_PRICING_CONFIG;
      if (typeof row.pricing_tiers === "string") {
        try {
          return JSON.parse(row.pricing_tiers);
        } catch {
          return DEFAULT_PRICING_CONFIG;
        }
      }
      return (row.pricing_tiers as any) || DEFAULT_PRICING_CONFIG;
    })(),
    importMarkupPct: row.import_markup_pct != null ? Number(row.import_markup_pct) : 10,
    importWholesaleReductionPct: row.import_wholesale_reduction_pct != null ? Number(row.import_wholesale_reduction_pct) : 10,

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
  const storeNameVal = settings.storeName || settings.siteName || DEFAULT_SETTINGS.siteName;
  const storeAddressVal = settings.storeAddress || "";
  const mapUrlVal = settings.googleMapsUrl || settings.storeMapLink || "";
  const phonePrimaryVal = settings.phonePrimary || settings.phoneLink || "";
  const phoneSecondaryVal = settings.phoneSecondary || settings.phoneLink2 || "";
  const whatsappVal = settings.whatsapp || settings.whatsappLink || "";
  const facebookVal = settings.facebook || settings.facebookLink || "";
  const instagramVal = settings.instagram || settings.instagramLink || "";
  const tiktokVal = settings.tiktok || settings.tiktokLink || "";

  return {
    site_name: storeNameVal,
    store_name: storeNameVal,
    logo: settings.logo || "",
    hero_image: settings.heroImage || "",
    hero_image_url: settings.heroImage || "",
    footer_image: settings.footerImage || "",
    footer_image_url: settings.footerImage || "",
    font_family: settings.fontFamily || "Cairo",
    font_size: settings.fontSize || 16,
    primary_color: settings.primaryColor || "#2563eb",
    secondary_color: settings.secondaryColor || "#7c3aed",
    accent_color: settings.accentColor || "#f59e0b",
    dark_mode: Boolean(settings.darkMode),
    eye_protection: Boolean(settings.eyeProtection),

    whatsapp: whatsappVal,
    whatsapp_link: whatsappVal,
    whatsapp_number: whatsappVal,
    telegram_link: settings.telegramLink || "",
    telegram_url: settings.telegramLink || "",
    messenger_link: settings.messengerLink || "",
    messenger_url: settings.messengerLink || "",

    phone_primary: phonePrimaryVal,
    phone_link: phonePrimaryVal,
    direct_phone: phonePrimaryVal,
    phone_secondary: phoneSecondaryVal,
    phone_link2: phoneSecondaryVal,

    facebook: facebookVal,
    facebook_link: facebookVal,
    instagram: instagramVal,
    instagram_link: instagramVal,
    tiktok: tiktokVal,
    tiktok_link: tiktokVal,
    youtube_link: settings.youtubeLink || "",

    address: storeAddressVal,
    store_address: storeAddressVal,
    map_url: mapUrlVal,
    store_map_link: mapUrlVal,
    google_maps_url: mapUrlVal,
    store_map_embed_url: settings.storeMapEmbedUrl || "",

    app_download_url: settings.appDownloadUrl || "",
    android_app_url: settings.androidAppUrl || "",
    ios_app_url: settings.iosAppUrl || "",
    scanner_permissions: settings.scannerPermissions || {
      camera: true,
      imageUpload: true,
      manualEntry: true,
      hardwareScanner: true,
      adminGenerate: true,
    },

    custom_themes: settings.customThemes || [],
    active_theme_preset: settings.activeThemePreset || "classic-blue",
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

    // Pricing Tiers Engine
    pricing_tiers: settings.pricingTiers || DEFAULT_PRICING_CONFIG,
    import_markup_pct: settings.importMarkupPct ?? 10,
    import_wholesale_reduction_pct: settings.importWholesaleReductionPct ?? 10,
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
      let updatedSettings: SiteSettings | null = null;

      setSettings((prev) => {
        const merged = { ...prev, ...updates };
        updatedSettings = merged;
        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        }
        return merged;
      });

      if (!updatedSettings) return;

      const currentRowPayload: Record<string, unknown> = {
        ...settingsToRow(updatedSettings),
      };
      let targetId = settingsId;

      try {
        let resData: Record<string, unknown> | null = null;

        if (targetId) {
          const res = await supabase
            .from("settings")
            .update(currentRowPayload)
            .eq("id", targetId)
            .select()
            .maybeSingle();

          if (res.error) throw new Error(res.error.message);
          resData = res.data;
        } else {
          const existing = await supabase.from("settings").select("id").limit(1).maybeSingle();
          if (existing.data?.id) {
            targetId = existing.data.id;
            setSettingsId(existing.data.id);
            const res = await supabase
              .from("settings")
              .update(currentRowPayload)
              .eq("id", existing.data.id)
              .select()
              .maybeSingle();

            if (res.error) throw new Error(res.error.message);
            resData = res.data;
          } else {
            const res = await supabase
              .from("settings")
              .insert(currentRowPayload)
              .select()
              .maybeSingle();

            if (res.error) throw new Error(res.error.message);
            resData = res.data;
          }
        }

        // State Refresh with response data (res.data) from database
        if (resData) {
          if (resData.id) setSettingsId(String(resData.id));
          const freshlyParsed = rowToSettings(resData);
          setSettings(freshlyParsed);
          if (typeof window !== "undefined") {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(freshlyParsed));
          }
        }
      } catch (err) {
        console.error("Database query exception in updateSettings:", err);
        throw err;
      }
    },
    [settingsId]
  );

  const updateRoleTheme = useCallback(
    async (role: UserRole, theme: Partial<RoleTheme>) => {
      const newThemes = { ...settings.roleThemes, [role]: { ...settings.roleThemes[role], ...theme } };
      await updateSettings({ roleThemes: newThemes });
    },
    [settings.roleThemes, updateSettings]
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

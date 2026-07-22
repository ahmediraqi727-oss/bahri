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
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const SETTINGS_USER_ID = "00000000-0000-0000-0000-000000000001";

function rowToSettings(row: Record<string, unknown>): SiteSettings {
  const rt = row.role_themes as Record<string, Record<string, string>> || {};
  return {
    siteName: (row.site_name as string) || "موقع أحمد بحري",
    logo: (row.logo as string) || "",
    heroImage: (row.hero_image as string) || "",
    footerImage: (row.footer_image as string) || "",
    fontFamily: (row.font_family as string) || "Cairo",
    fontSize: Number(row.font_size) || 16,
    primaryColor: (row.primary_color as string) || "#2563eb",
    secondaryColor: (row.secondary_color as string) || "#7c3aed",
    accentColor: (row.accent_color as string) || "#f59e0b",
    darkMode: (row.dark_mode as boolean) || false,
    currentRole: "manager",
    roleThemes: {
      manager: { primary: rt.manager?.primary || "#1e40af", secondary: rt.manager?.secondary || "#7c3aed", accent: rt.manager?.accent || "#f59e0b" },
      admin: { primary: rt.admin?.primary || "#059669", secondary: rt.admin?.secondary || "#0891b2", accent: rt.admin?.accent || "#f97316" },
      customer: { primary: rt.customer?.primary || "#2563eb", secondary: rt.customer?.secondary || "#6366f1", accent: rt.customer?.accent || "#ec4899" },
    },
  };
}

function settingsToRow(settings: SiteSettings): Record<string, unknown> {
  return {
    user_id: SETTINGS_USER_ID,
    site_name: settings.siteName,
    logo: settings.logo,
    hero_image: settings.heroImage,
    footer_image: settings.footerImage,
    font_family: settings.fontFamily,
    font_size: settings.fontSize,
    primary_color: settings.primaryColor,
    secondary_color: settings.secondaryColor,
    accent_color: settings.accentColor,
    dark_mode: settings.darkMode,
    role_themes: settings.roleThemes,
  };
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("settings").select("*").eq("user_id", SETTINGS_USER_ID).single();
      if (data) {
        setSettings(rowToSettings(data));
        setSettingsId(data.id);
      }
      setLoading(false);
    }
    load();
  }, []);

  const updateSettings = useCallback(async (updates: Partial<SiteSettings>) => {
    setSettings((prev) => {
      const merged = { ...prev, ...updates };
      const row = settingsToRow(merged);
      if (settingsId) {
        supabase.from("settings").update(row).eq("id", settingsId);
      } else {
        supabase.from("settings").insert(row).select().single().then(({ data }) => {
          if (data) setSettingsId(data.id);
        });
      }
      return merged;
    });
  }, [settingsId]);

  const updateRoleTheme = useCallback(async (role: UserRole, theme: Partial<RoleTheme>) => {
    setSettings((prev) => {
      const newThemes = { ...prev.roleThemes, [role]: { ...prev.roleThemes[role], ...theme } };
      const updated = { ...prev, roleThemes: newThemes };
      const row = settingsToRow(updated);
      if (settingsId) {
        supabase.from("settings").update(row).eq("id", settingsId);
      } else {
        supabase.from("settings").insert(row).select().single().then(({ data }) => {
          if (data) setSettingsId(data.id);
        });
      }
      return updated;
    });
  }, [settingsId]);

  const setCurrentRole = useCallback((role: UserRole) => {
    setSettings((prev) => ({ ...prev, currentRole: role }));
  }, []);

  const toggleDarkMode = useCallback(async () => {
    setSettings((prev) => {
      const updated = { ...prev, darkMode: !prev.darkMode };
      const row = settingsToRow(updated);
      if (settingsId) {
        supabase.from("settings").update(row).eq("id", settingsId);
      } else {
        supabase.from("settings").insert(row).select().single().then(({ data }) => {
          if (data) setSettingsId(data.id);
        });
      }
      return updated;
    });
  }, [settingsId]);

  return (
    <SettingsContext.Provider
      value={{ settings, loading, updateSettings, updateRoleTheme, setCurrentRole, toggleDarkMode }}
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

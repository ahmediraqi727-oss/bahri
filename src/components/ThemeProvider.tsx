"use client";

import { useSettings } from "@/lib/settings-context";

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();

  const roleTheme = settings.roleThemes[settings.currentRole];
  const effectivePrimary = roleTheme?.primary || settings.primaryColor;
  const effectiveSecondary = roleTheme?.secondary || settings.secondaryColor;
  const effectiveAccent = roleTheme?.accent || settings.accentColor;

  return (
    <div
      className={settings.darkMode ? "dark" : ""}
      style={{
        "--primary": effectivePrimary,
        "--secondary": effectiveSecondary,
        "--accent": effectiveAccent,
        "--font-size-base": `${settings.fontSize}px`,
        "--font-family": settings.fontFamily,
      } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

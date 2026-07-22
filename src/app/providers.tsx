"use client";

import { AuthProvider } from "@/lib/auth-context";
import { SettingsProvider } from "@/lib/settings-context";
import { ActivityLogProvider } from "@/lib/activity-log";
import { TrashProvider } from "@/lib/trash";
import { DataProvider } from "@/lib/data-context";
import { NotificationsProvider } from "@/lib/notifications";
import { CartProvider } from "@/lib/cart-context";
import { SalesProvider } from "@/lib/sales-context";
import { LangProvider } from "@/lib/lang-context";
import ThemeProvider from "@/components/ThemeProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LangProvider>
      <AuthProvider>
        <SettingsProvider>
          <ActivityLogProvider>
            <TrashProvider>
              <DataProvider>
                <NotificationsProvider>
                  <SalesProvider>
                    <CartProvider>
                      <ThemeProvider>{children}</ThemeProvider>
                    </CartProvider>
                  </SalesProvider>
                </NotificationsProvider>
              </DataProvider>
            </TrashProvider>
          </ActivityLogProvider>
        </SettingsProvider>
      </AuthProvider>
    </LangProvider>
  );
}

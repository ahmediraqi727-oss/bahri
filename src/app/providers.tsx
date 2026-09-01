"use client";

import { useEffect, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import { Network } from "@capacitor/network";
import { initNativeUI, initPushNotificationsSafely, getNetworkStatus } from "@/lib/capacitor-native";
import { AuthProvider } from "@/lib/auth-context";
import { SettingsProvider } from "@/lib/settings-context";
import { ActivityLogProvider } from "@/lib/activity-log";
import { TrashProvider } from "@/lib/trash";
import { DataProvider } from "@/lib/data-context";
import { NotificationsProvider } from "@/lib/notifications";
import { CartProvider } from "@/lib/cart-context";
import { SalesProvider } from "@/lib/sales-context";
import { LangProvider } from "@/lib/lang-context";
import { FavoritesProvider } from "@/contexts/FavoritesContext";
import { PurchasesProvider } from "@/contexts/PurchasesContext";
import ThemeProvider from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/ToastProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // Initialize UI (Status Bar & Splash Screen) & Push Notifications safely
    initNativeUI();
    initPushNotificationsSafely();

    // Hardware Back Button listener for Android
    let backListener: any = null;
    const setupBackButton = async () => {
      try {
        backListener = await CapApp.addListener('backButton', ({ canGoBack }) => {
          if (canGoBack) {
            window.history.back();
          } else {
            CapApp.minimizeApp();
          }
        });
      } catch {
        // Ignored on browser environment
      }
    };
    setupBackButton();

    // Network status listener
    let networkListener: any = null;
    const setupNetwork = async () => {
      try {
        const status = await Network.getStatus();
        setIsOffline(!status.connected);

        networkListener = await Network.addListener('networkStatusChange', (status) => {
          setIsOffline(!status.connected);
        });
      } catch {
        // Ignored on browser environment
      }
    };
    setupNetwork();

    return () => {
      if (backListener && typeof backListener.remove === 'function') {
        backListener.remove();
      }
      if (networkListener && typeof networkListener.remove === 'function') {
        networkListener.remove();
      }
    };
  }, []);

  return (
    <LangProvider>
      <AuthProvider>
        <FavoritesProvider>
          <PurchasesProvider>
            <SettingsProvider>
              <ActivityLogProvider>
                <TrashProvider>
                  <DataProvider>
                    <NotificationsProvider>
                      <SalesProvider>
                        <CartProvider>
                          <ThemeProvider>
                            <ToastProvider>
                              {isOffline && (
                                <div className="fixed top-0 left-0 right-0 z-50 bg-amber-600 text-white text-xs font-bold py-2 px-4 text-center flex items-center justify-center gap-2 shadow-md">
                                  <span>⚠️</span>
                                  <span>أنت غير متصل بالإنترنت حالياً - يرجى التحقق من الشبكة</span>
                                  <button
                                    onClick={async () => {
                                      try {
                                        const status = await Network.getStatus();
                                        setIsOffline(!status.connected);
                                      } catch {}
                                    }}
                                    className="bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded text-[11px] underline cursor-pointer"
                                  >
                                    إعادة المحاولة
                                  </button>
                                </div>
                              )}
                              {children}
                            </ToastProvider>
                          </ThemeProvider>
                        </CartProvider>
                      </SalesProvider>
                    </NotificationsProvider>
                  </DataProvider>
                </TrashProvider>
              </ActivityLogProvider>
            </SettingsProvider>
          </PurchasesProvider>
        </FavoritesProvider>
      </AuthProvider>
    </LangProvider>
  );
}


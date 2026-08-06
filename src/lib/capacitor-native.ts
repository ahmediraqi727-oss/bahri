import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Network, ConnectionStatus } from "@capacitor/network";
import { Preferences } from "@capacitor/preferences";
import { PushNotifications } from "@capacitor/push-notifications";

/**
 * فحص ما إذا كان الكود يعمل داخل بيئة تطبيق أصلية (Android / iOS)
 */
export const isNativePlatform = (): boolean => {
  return Capacitor.isNativePlatform();
};

/**
 * تهيئة شريط الحالة وشاشة الترحيب بمرونة على كافة المنصات
 */
export const initNativeUI = async (): Promise<void> => {
  if (!isNativePlatform()) return;

  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#1e3a8a" });
  } catch (error) {
    console.warn("StatusBar setup warning:", error);
  }

  try {
    await SplashScreen.hide();
  } catch (error) {
    console.warn("SplashScreen hide warning:", error);
  }
};

/**
 * الحصول على حالة الشبكة الحالية مع دعم المتصفح كبديل
 */
export const getNetworkStatus = async (): Promise<{ connected: boolean; connectionType: string }> => {
  if (!isNativePlatform()) {
    return {
      connected: typeof navigator !== "undefined" ? navigator.onLine : true,
      connectionType: "browser",
    };
  }

  try {
    const status: ConnectionStatus = await Network.getStatus();
    return {
      connected: status.connected,
      connectionType: status.connectionType,
    };
  } catch (error) {
    console.warn("Failed to get network status, defaulting to browser status:", error);
    return {
      connected: typeof navigator !== "undefined" ? navigator.onLine : true,
      connectionType: "unknown",
    };
  }
};

/**
 * تهيئة الإشعارات المنبثقة بشكل آمن يراعي غياب خدمات جوجل (مثل أجهزة هواوي بدون GMS)
 */
export const initPushNotificationsSafely = async (): Promise<boolean> => {
  if (!isNativePlatform()) return false;

  try {
    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === "prompt") {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive === "granted") {
      await PushNotifications.register();
      return true;
    }
  } catch (error) {
    console.warn("PushNotifications not supported on this device/environment (e.g. Non-GMS Huawei):", error);
  }
  return false;
};

/**
 * التخزين الآلي مع البديل المزدوج (Capacitor Preferences / localStorage)
 */
export const SafeStorage = {
  async setItem(key: string, value: string): Promise<void> {
    if (isNativePlatform()) {
      try {
        await Preferences.set({ key, value });
        return;
      } catch (err) {
        console.warn("Preferences set error, falling back to localStorage", err);
      }
    }
    if (typeof window !== "undefined") {
      localStorage.setItem(key, value);
    }
  },

  async getItem(key: string): Promise<string | null> {
    if (isNativePlatform()) {
      try {
        const res = await Preferences.get({ key });
        if (res.value !== null) return res.value;
      } catch (err) {
        console.warn("Preferences get error, falling back to localStorage", err);
      }
    }
    if (typeof window !== "undefined") {
      return localStorage.getItem(key);
    }
    return null;
  },

  async removeItem(key: string): Promise<void> {
    if (isNativePlatform()) {
      try {
        await Preferences.remove({ key });
        return;
      } catch (err) {
        console.warn("Preferences remove error", err);
      }
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem(key);
    }
  },
};

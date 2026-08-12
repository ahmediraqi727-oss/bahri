"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase-client";
import { useAuth } from "./auth-context";
import { isUUID } from "./data-context";

export interface Notification {
  id: string;
  timestamp: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  user_id?: string | null;
  productId?: string;
}

export type MuteDurationType = "none" | "1h" | "4h" | "24h";

interface NotificationsContextType {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  isMuted: boolean;
  muteUntil: string | null;
  muteDuration: MuteDurationType;
  setMuteTimer: (duration: MuteDurationType) => void;
  playChime: (soundUrl?: string, volume?: number) => void;
  addNotification: (n: Omit<Notification, "id" | "timestamp" | "read">) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  clearAll: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);
const MUTE_STORAGE_KEY = "customer_notification_mute_until";
const MUTE_DURATION_KEY = "customer_notification_mute_duration";

const GUEST_STORAGE_KEY = "ahmed_bahri_guest_session";
const GUEST_TIME_KEY = "ahmed_bahri_guest_time";

/**
 * دالة للحصول على معرف جلسة الضيف الفريد وصالح لمدة 24 ساعة فقط
 * يتم تجديد المعرف وحذف القديم تلقائياً بعد مرور 24 ساعة لضمان الخصوصية
 */
export function getOrCreateGuestSessionId(): string {
  if (typeof window === "undefined") return "";

  const now = Date.now();
  const savedTime = localStorage.getItem(GUEST_TIME_KEY);
  let sessionId = localStorage.getItem(GUEST_STORAGE_KEY);

  if (!sessionId || !savedTime || now - Number(savedTime) > 24 * 60 * 60 * 1000) {
    sessionId = "guest_" + Math.random().toString(36).substring(2) + now.toString(36);
    localStorage.setItem(GUEST_STORAGE_KEY, sessionId);
    localStorage.setItem(GUEST_TIME_KEY, now.toString());
  }

  return sessionId;
}

/**
 * مسح جلسة الضيف المؤقتة بعد دمجها بالحساب الرسمي
 */
export function clearGuestSessionId(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(GUEST_STORAGE_KEY);
  localStorage.removeItem(GUEST_TIME_KEY);
  localStorage.removeItem("store_guest_session_id");
  localStorage.removeItem("store_guest_session_time");
}

export function playNotificationChime(soundUrl?: string, volume = 0.8) {
  try {
    if (typeof window === "undefined") return;
    const url = soundUrl || "/sounds/chime.mp3";
    const audio = new Audio(url);
    audio.volume = Math.max(0, Math.min(1, volume));
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(587.33, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
          gain.gain.setValueAtTime(volume * 0.3, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.2);
        } catch {}
      });
    }
  } catch {}
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [muteUntil, setMuteUntil] = useState<string | null>(null);
  const [muteDuration, setMuteDuration] = useState<MuteDurationType>("none");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedUntil = localStorage.getItem(MUTE_STORAGE_KEY);
      const storedDuration = (localStorage.getItem(MUTE_DURATION_KEY) as MuteDurationType) || "none";
      if (storedUntil && Date.now() < new Date(storedUntil).getTime()) {
        setMuteUntil(storedUntil);
        setMuteDuration(storedDuration);
      }
    }
  }, []);

  const isMuted = Boolean(muteUntil && Date.now() < new Date(muteUntil).getTime());

  const setMuteTimer = useCallback((duration: MuteDurationType) => {
    setMuteDuration(duration);
    if (duration === "none") {
      setMuteUntil(null);
      localStorage.removeItem(MUTE_STORAGE_KEY);
      localStorage.removeItem(MUTE_DURATION_KEY);
      return;
    }
    const hours = duration === "1h" ? 1 : duration === "4h" ? 4 : 24;
    const until = new Date(Date.now() + hours * 3600000).toISOString();
    setMuteUntil(until);
    localStorage.setItem(MUTE_STORAGE_KEY, until);
    localStorage.setItem(MUTE_DURATION_KEY, duration);
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      if (data) {
        const isAdmin = user && (user.role === "manager" || user.role === "admin");
        const parsed: Notification[] = data.map((row: any) => ({
          id: row.id,
          type: row.type || "message",
          title: row.title,
          message: row.message || "",
          read: row.read || false,
          timestamp: row.created_at,
          user_id: row.user_id,
          productId: row.product_id || undefined,
        }));

        // 🔒 فلتر الأمان الصارم للضيوف والزبائن العاديين
        if (!isAdmin) {
          const safeFiltered = parsed.filter((n) => {
            const isOrderOrAdminType = [
              "low_stock",
              "out_of_stock",
              "admin_log",
              "system",
              "contact",
              "order",
              "new_order",
              "whatsapp_order",
            ].includes(n.type);

            const hasOrderKeywords = n.title.includes("طلب") || n.message.includes("طلب");

            // إذا كان الإشعار طلب أو إداري، فلا يظهر أبداً إلا إذا كان موجهة للمستخدم نفسه بصورة خاصة
            if (isOrderOrAdminType || hasOrderKeywords) {
              return n.user_id === user?.id;
            }

            return true;
          });
          setNotifications(safeFiltered);
        } else {
          setNotifications(parsed);
        }
      }
    } catch (err) {
      console.error("Error fetching notifications:", err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.role]);

  useEffect(() => {
    fetchNotifications();

    const channel = supabase
      .channel("notifications-realtime-channel")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const newRow = payload.new as any;
          const newNotif: Notification = {
            id: newRow.id,
            type: newRow.type || "message",
            title: newRow.title,
            message: newRow.message || "",
            read: false,
            timestamp: newRow.created_at,
            user_id: newRow.user_id,
            productId: newRow.product_id || undefined,
          };

          const isAdmin = user && (user.role === "manager" || user.role === "admin");
          const isOrderOrAdminType = [
            "low_stock",
            "out_of_stock",
            "admin_log",
            "system",
            "contact",
            "order",
            "new_order",
            "whatsapp_order",
          ].includes(newNotif.type);
          const hasOrderKeywords = newNotif.title.includes("طلب") || newNotif.message.includes("طلب");

          // تطبيق نفس فلتر الأمان اللحظي
          if (!isAdmin && (isOrderOrAdminType || hasOrderKeywords)) {
            if (newNotif.user_id !== user?.id) {
              return; // تجاهل الإشعار إذا لم يكن يخص هذا الضيف/الزبون
            }
          }

          setNotifications((prev) => [newNotif, ...prev]);

          if (!isMuted) {
            playNotificationChime();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchNotifications, isMuted, user?.id, user?.role]);

  const addNotification = useCallback(
    async (n: Omit<Notification, "id" | "timestamp" | "read">) => {
      const guestSessionId = getOrCreateGuestSessionId();
      const isRegistered = user?.id && isUUID(user.id) && !user.isGuest;

      const row = {
        type: n.type || "message",
        title: n.title,
        message: n.message,
        product_id: n.productId || "",
        user_id: isRegistered ? user.id : null,
        session_id: !isRegistered ? guestSessionId : null,
        read: false,
      };
      const { data: created, error } = await supabase.from("notifications").insert(row).select().single();
      if (error) throw error;
      if (created) {
        const newNotif: Notification = {
          id: created.id,
          type: created.type || "message",
          title: created.title,
          message: created.message || "",
          read: false,
          timestamp: created.created_at,
          user_id: created.user_id,
          productId: created.product_id || undefined,
        };
        setNotifications((prev) => [newNotif, ...prev]);
        if (!isMuted) {
          playNotificationChime();
        }
      }
    },
    [user?.id, isMuted]
  );

  const markAsRead = useCallback(async (id: string) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllAsRead = useCallback(async () => {
    await supabase.from("notifications").update({ read: true }).eq("read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(async () => {
    await supabase.from("notifications").delete().neq("id", "");
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        isMuted,
        muteUntil,
        muteDuration,
        setMuteTimer,
        playChime: playNotificationChime,
        addNotification,
        markAsRead,
        markAllAsRead,
        clearAll,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}

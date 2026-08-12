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
  productId?: string;
  read: boolean;
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

export function playNotificationChime(soundUrl?: string, volume = 0.8) {
  try {
    if (typeof window === "undefined") return;
    const url = soundUrl || "/sounds/chime.mp3";
    const audio = new Audio(url);
    audio.volume = Math.max(0, Math.min(1, volume));
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Fallback Web Audio API synthesizer chime if audio file is blocked or missing
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
          osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
          gain.gain.setValueAtTime(volume * 0.3, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.3);
        } catch { /* ignore audio fallback errors */ }
      });
    }
  } catch { /* ignore audio errors */ }
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

  // جلب الإشعارات بشكل مبسط وآمن تماماً لتجنب خطأ 400
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
          productId: row.product_id || undefined,
          read: row.read || false,
          timestamp: row.created_at,
        }));

        // تصفية أمان العميل (الضيوف والزبائن لا يرون سوى إشعاراتهم أو الإشعارات العامة غير الإدارية)
        if (!isAdmin) {
          const filtered = parsed.filter((n) => {
            const isRestrictedAdminType = ["low_stock", "out_of_stock", "admin_log", "system"].includes(n.type);
            return !isRestrictedAdminType;
          });
          setNotifications(filtered);
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

    // الاستماع الفوري (Realtime) للإشعارات الجديدة
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
            productId: newRow.product_id || undefined,
            read: false,
            timestamp: newRow.created_at,
          };

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
  }, [fetchNotifications, isMuted]);

  const addNotification = useCallback(
    async (n: Omit<Notification, "id" | "timestamp" | "read">) => {
      const row = {
        type: n.type || "message",
        title: n.title,
        message: n.message,
        product_id: n.productId || "",
        user_id: user?.id && isUUID(user.id) ? user.id : null,
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
          productId: created.product_id || undefined,
          read: false,
          timestamp: created.created_at,
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

"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase-client";
import { useAuth } from "./auth-context";
import { isUUID } from "./data-context";

export interface Notification {
  id: string;
  timestamp: string;
  type: "low_stock" | "out_of_stock" | "info" | "message" | "contact";
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

function rowToNotification(row: Record<string, unknown>): Notification {
  return {
    id: row.id as string,
    type: row.type as Notification["type"],
    title: row.title as string,
    message: (row.message as string) || "",
    productId: (row.product_id as string) || undefined,
    read: (row.read as boolean) || false,
    timestamp: row.created_at as string,
  };
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

  // Load mute settings from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedUntil = localStorage.getItem(MUTE_STORAGE_KEY);
      const storedDuration = (localStorage.getItem(MUTE_DURATION_KEY) as MuteDurationType) || "none";
      if (storedUntil) {
        if (Date.now() < new Date(storedUntil).getTime()) {
          setMuteUntil(storedUntil);
          setMuteDuration(storedDuration);
        } else {
          localStorage.removeItem(MUTE_STORAGE_KEY);
          localStorage.removeItem(MUTE_DURATION_KEY);
        }
      }
    }
  }, []);

  // Automatic Restoration Check Interval (every 10 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      if (muteUntil && Date.now() >= new Date(muteUntil).getTime()) {
        // Mute timer expired -> Auto-revert back to General Mode ("عام")
        setMuteUntil(null);
        setMuteDuration("none");
        if (typeof window !== "undefined") {
          localStorage.removeItem(MUTE_STORAGE_KEY);
          localStorage.removeItem(MUTE_DURATION_KEY);
        }
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [muteUntil]);

  const isMuted = Boolean(muteUntil && Date.now() < new Date(muteUntil).getTime());

  const setMuteTimer = useCallback((duration: MuteDurationType) => {
    setMuteDuration(duration);
    if (duration === "none") {
      setMuteUntil(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem(MUTE_STORAGE_KEY);
        localStorage.removeItem(MUTE_DURATION_KEY);
      }
      return;
    }

    const hours = duration === "1h" ? 1 : duration === "4h" ? 4 : 24;
    const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    setMuteUntil(until);
    if (typeof window !== "undefined") {
      localStorage.setItem(MUTE_STORAGE_KEY, until);
      localStorage.setItem(MUTE_DURATION_KEY, duration);
    }
  }, []);

  useEffect(() => {
    async function load() {
      try {
        let query = supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100);
        if (user?.id && isUUID(user.id)) {
          query = query.eq("user_id", user.id);
        }
        const { data } = await query;
        if (data) setNotifications(data.map(rowToNotification));
      } catch {
        // Fallback gracefully on query error
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user?.id]);

  const addNotification = useCallback(async (n: Omit<Notification, "id" | "timestamp" | "read">) => {
    const row = {
      type: n.type,
      title: n.title,
      message: n.message,
      product_id: n.productId || "",
      user_id: user?.id && isUUID(user.id) ? user.id : null,
      read: false,
    };
    const { data: created, error } = await supabase.from("notifications").insert(row).select().single();
    if (error) throw error;
    
    const newNotif = rowToNotification(created);
    setNotifications((prev) => [newNotif, ...prev]);

    // Play chime sound if NOT muted
    if (!isMuted) {
      playNotificationChime();
    }
  }, [user?.id, isMuted]);

  const markAsRead = useCallback(async (id: string) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllAsRead = useCallback(async () => {
    let query = supabase.from("notifications").update({ read: true }).eq("read", false);
    if (user?.id && isUUID(user.id)) query = query.eq("user_id", user.id);
    await query;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, [user?.id]);

  const clearAll = useCallback(async () => {
    let query = supabase.from("notifications").delete().neq("id", "");
    if (user?.id && isUUID(user.id)) query = query.eq("user_id", user.id);
    await query;
    setNotifications([]);
  }, [user?.id]);

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

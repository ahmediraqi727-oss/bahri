"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase-client";
import { useAuth } from "./auth-context";

export interface Notification {
  id: string;
  timestamp: string;
  type: "low_stock" | "out_of_stock" | "info";
  title: string;
  message: string;
  productId?: string;
  read: boolean;
}

interface NotificationsContextType {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  addNotification: (n: Omit<Notification, "id" | "timestamp" | "read">) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  clearAll: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

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

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      let query = supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100);
      if (user?.id) {
        query = query.eq("user_id", user.id);
      }
      const { data } = await query;
      if (data) setNotifications(data.map(rowToNotification));
      setLoading(false);
    }
    load();
  }, [user?.id]);

  const addNotification = useCallback(async (n: Omit<Notification, "id" | "timestamp" | "read">) => {
    const row = {
      type: n.type,
      title: n.title,
      message: n.message,
      product_id: n.productId || "",
      user_id: user?.id || null,
      read: false,
    };
    const { data: created, error } = await supabase.from("notifications").insert(row).select().single();
    if (error) throw error;
    setNotifications((prev) => [rowToNotification(created), ...prev]);
  }, [user?.id]);

  const markAsRead = useCallback(async (id: string) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllAsRead = useCallback(async () => {
    let query = supabase.from("notifications").update({ read: true }).eq("read", false);
    if (user?.id) query = query.eq("user_id", user.id);
    await query;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, [user?.id]);

  const clearAll = useCallback(async () => {
    let query = supabase.from("notifications").delete().neq("id", "");
    if (user?.id) query = query.eq("user_id", user.id);
    await query;
    setNotifications([]);
  }, [user?.id]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, loading, addNotification, markAsRead, markAllAsRead, clearAll }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}

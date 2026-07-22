"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { UserRole } from "./types";
import { supabase } from "./supabase-client";

export interface ActivityEntry {
  id: string;
  timestamp: string;
  user: UserRole;
  action: "create" | "update" | "delete" | "restore" | "login" | "export" | "import";
  entity: string;
  entityId?: string;
  details: string;
  oldValue?: string;
  newValue?: string;
}

interface ActivityLogContextType {
  activities: ActivityEntry[];
  loading: boolean;
  logActivity: (entry: Omit<ActivityEntry, "id" | "timestamp">) => Promise<void>;
  clearActivities: () => Promise<void>;
}

const ActivityLogContext = createContext<ActivityLogContextType | undefined>(undefined);

function rowToActivity(row: Record<string, unknown>): ActivityEntry {
  return {
    id: row.id as string,
    user: row.user_role as UserRole,
    action: row.action as ActivityEntry["action"],
    entity: row.entity as string,
    entityId: (row.entity_id as string) || undefined,
    details: row.details as string,
    oldValue: (row.old_value as string) || undefined,
    newValue: (row.new_value as string) || undefined,
    timestamp: row.created_at as string,
  };
}

export function ActivityLogProvider({ children }: { children: React.ReactNode }) {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(500);
      if (data) setActivities(data.map(rowToActivity));
      setLoading(false);
    }
    load();
  }, []);

  const logActivity = useCallback(async (entry: Omit<ActivityEntry, "id" | "timestamp">) => {
    const row = {
      user_role: entry.user,
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entityId || "",
      details: entry.details,
      old_value: entry.oldValue || "",
      new_value: entry.newValue || "",
    };
    const { data: created, error } = await supabase.from("activity_log").insert(row).select().single();
    if (error) throw error;
    setActivities((prev) => [rowToActivity(created), ...prev]);
  }, []);

  const clearActivities = useCallback(async () => {
    await supabase.from("activity_log").delete().neq("id", "");
    setActivities([]);
  }, []);

  return (
    <ActivityLogContext.Provider value={{ activities, loading, logActivity, clearActivities }}>
      {children}
    </ActivityLogContext.Provider>
  );
}

export function useActivityLog() {
  const context = useContext(ActivityLogContext);
  if (!context) throw new Error("useActivityLog must be used within ActivityLogProvider");
  return context;
}

const ACTION_LABELS: Record<string, string> = {
  create: "إضافة", update: "تعديل", delete: "حذف", restore: "استعادة", login: "دخول", export: "تصدير", import: "استيراد",
};

const ROLE_LABELS: Record<UserRole, string> = {
  manager: "مدير", admin: "إداري", customer: "زبون",
};

export function formatAction(action: ActivityEntry["action"]): string {
  return ACTION_LABELS[action] || action;
}

export function formatRole(role: UserRole): string {
  return ROLE_LABELS[role] || role;
}

export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

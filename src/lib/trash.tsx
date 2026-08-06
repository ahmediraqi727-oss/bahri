"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase-client";

export interface TrashItem {
  id: string;
  deletedAt: string;
  entity: string;
  entityId: string;
  entityName: string;
  data: Record<string, unknown>;
  deletedBy: string;
}

interface TrashContextType {
  items: TrashItem[];
  loading: boolean;
  softDelete: (entity: string, entityId: string, entityName: string, data: Record<string, unknown>, deletedBy: string) => Promise<void>;
  bulkSoftDelete: (deletePayloads: { entity: string; entityId: string; entityName: string; data: Record<string, unknown>; deletedBy: string }[]) => Promise<void>;
  restore: (id: string) => Promise<TrashItem | null>;
  bulkRestore: (ids: string[]) => Promise<TrashItem[]>;
  permanentDelete: (id: string) => Promise<void>;
  bulkPermanentDelete: (ids: string[]) => Promise<void>;
  purgeExpired: () => Promise<number>;
  autoDeleteDays: number;
  setAutoDeleteDays: (days: number) => void;
}

const TrashContext = createContext<TrashContextType | undefined>(undefined);

function rowToTrash(row: Record<string, unknown>): TrashItem {
  return {
    id: row.id as string,
    entity: row.entity as string,
    entityId: row.entity_id as string,
    entityName: row.entity_name as string,
    data: (row.data as Record<string, unknown>) || {},
    deletedBy: (row.deleted_by as string) || "",
    deletedAt: row.deleted_at as string,
  };
}

export function TrashProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [autoDeleteDays, setAutoDeleteDaysState] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await supabase.from("trash").select("*").order("deleted_at", { ascending: false });
        if (data) setItems(data.map(rowToTrash));
      } catch {
        // Fallback gracefully on query error
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const softDelete = useCallback(async (entity: string, entityId: string, entityName: string, data: Record<string, unknown>, deletedBy: string) => {
    const row = {
      entity,
      entity_id: entityId,
      entity_name: entityName,
      data,
      deleted_by: deletedBy,
    };
    const { data: created, error } = await supabase.from("trash").insert(row).select().single();
    if (error) throw error;
    setItems((prev) => [rowToTrash(created), ...prev]);
  }, []);

  const bulkSoftDelete = useCallback(async (deletePayloads: { entity: string; entityId: string; entityName: string; data: Record<string, unknown>; deletedBy: string }[]) => {
    if (!deletePayloads || deletePayloads.length === 0) return;
    const rows = deletePayloads.map((payload) => ({
      entity: payload.entity,
      entity_id: payload.entityId,
      entity_name: payload.entityName,
      data: payload.data,
      deleted_by: payload.deletedBy,
    }));
    const { data: created, error } = await supabase.from("trash").insert(rows).select();
    if (error) throw error;
    if (created) {
      const newItems = created.map(rowToTrash);
      setItems((prev) => [...newItems, ...prev]);
    }
  }, []);

  const restore = useCallback(async (id: string): Promise<TrashItem | null> => {
    const item = items.find((i) => i.id === id);
    const { error } = await supabase.from("trash").delete().eq("id", id);
    if (error) throw error;
    setItems((prev) => prev.filter((i) => i.id !== id));
    return item || null;
  }, [items]);

  const bulkRestore = useCallback(async (ids: string[]): Promise<TrashItem[]> => {
    if (!ids || ids.length === 0) return [];
    const restoredItems = items.filter((i) => ids.includes(i.id));
    const { error } = await supabase.from("trash").delete().in("id", ids);
    if (error) throw error;
    const idSet = new Set(ids);
    setItems((prev) => prev.filter((i) => !idSet.has(i.id)));
    return restoredItems;
  }, [items]);

  const permanentDelete = useCallback(async (id: string) => {
    const { error } = await supabase.from("trash").delete().eq("id", id);
    if (error) throw error;
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const bulkPermanentDelete = useCallback(async (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    const { error } = await supabase.from("trash").delete().in("id", ids);
    if (error) throw error;
    const idSet = new Set(ids);
    setItems((prev) => prev.filter((i) => !idSet.has(i.id)));
  }, []);

  const purgeExpired = useCallback(async (): Promise<number> => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - autoDeleteDays);
    const cutoffISO = cutoff.toISOString();
    const { data, error } = await supabase.from("trash").delete().lt("deleted_at", cutoffISO).select();
    if (error) throw error;
    const count = data?.length || 0;
    if (count > 0) {
      setItems((prev) => prev.filter((i) => new Date(i.deletedAt) >= cutoff));
    }
    return count;
  }, [autoDeleteDays]);

  const setAutoDeleteDays = useCallback((days: number) => {
    setAutoDeleteDaysState(days);
  }, []);

  return (
    <TrashContext.Provider value={{ items, loading, softDelete, bulkSoftDelete, restore, bulkRestore, permanentDelete, bulkPermanentDelete, purgeExpired, autoDeleteDays, setAutoDeleteDays }}>
      {children}
    </TrashContext.Provider>
  );
}

export function useTrash() {
  const context = useContext(TrashContext);
  if (!context) throw new Error("useTrash must be used within TrashProvider");
  return context;
}

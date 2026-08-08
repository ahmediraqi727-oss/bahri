"use client";

/**
 * ==========================================
 * Trash Context & Supabase Synchronization
 * أحمد بحري Dashboard — Enterprise Grade
 * ==========================================
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase-client";
import { productToRow, supplierToRow, categoryToRow, isUUID } from "./data-context";

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
  reloadTrash: () => Promise<void>;
  softDelete: (entity: string, entityId: string, entityName: string, data: Record<string, unknown>, deletedBy: string) => Promise<void>;
  bulkSoftDelete: (deletePayloads: { entity: string; entityId: string; entityName: string; data: Record<string, unknown>; deletedBy: string }[], onProgress?: (processed: number, total: number) => void) => Promise<void>;
  restore: (id: string) => Promise<TrashItem | null>;
  bulkRestore: (ids: string[], onProgress?: (processed: number, total: number) => void) => Promise<TrashItem[]>;
  permanentDelete: (id: string) => Promise<void>;
  bulkPermanentDelete: (ids: string[], onProgress?: (processed: number, total: number) => void) => Promise<void>;
  purgeExpired: () => Promise<number>;
  autoDeleteDays: number;
  setAutoDeleteDays: (days: number) => Promise<void>;
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

const TRASH_DAYS_KEY = "app_trash_auto_delete_days";
const CHUNK_SIZE = 50; // Optimized batch size (50 items per payload to prevent HTTP 414 / PostgREST limits)

export function TrashProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [autoDeleteDays, setAutoDeleteDaysState] = useState(30);
  const [loading, setLoading] = useState(true);

  // Load saved auto-delete days setting from localStorage & Supabase settings
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(TRASH_DAYS_KEY);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed > 0) setAutoDeleteDaysState(parsed);
      }
    }

    // Also fetch saved value from Supabase settings if present
    async function loadSettingsDays() {
      try {
        const { data } = await supabase.from("settings").select("auto_delete_days").limit(1);
        if (data && data.length > 0 && (data[0] as any).auto_delete_days) {
          const val = Number((data[0] as any).auto_delete_days);
          if (val > 0) {
            setAutoDeleteDaysState(val);
            if (typeof window !== "undefined") {
              localStorage.setItem(TRASH_DAYS_KEY, val.toString());
            }
          }
        }
      } catch {
        // Fallback to localStorage
      }
    }
    loadSettingsDays();
  }, []);

  // Manual & automatic reload handler
  const reloadTrash = useCallback(async () => {
    const { data, error } = await supabase.from("trash").select("*").order("deleted_at", { ascending: false });
    if (error) {
      console.error("Supabase reloadTrash error:", error);
      throw new Error(`خطأ في جلب بيانات السلة من Supabase: ${error.message} [Code: ${error.code}]`);
    }
    if (data) setItems(data.map(rowToTrash));
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase.from("trash").select("*").order("deleted_at", { ascending: false });
        if (error) console.error("Initial load trash error:", error);
        if (data) setItems(data.map(rowToTrash));
      } catch (err) {
        console.error("Trash load exception:", err);
      } finally {
        setLoading(false);
      }
    }
    load();

    // Supabase Real-Time Listener on trash table
    const channel = supabase
      .channel("public:trash_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "trash" }, async () => {
        const { data } = await supabase.from("trash").select("*").order("deleted_at", { ascending: false });
        if (data) setItems(data.map(rowToTrash));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
    if (error) {
      console.error("Supabase softDelete error:", error);
      throw new Error(`فشل نقل العنصر للسلة في Supabase: ${error.message} [Code: ${error.code}]`);
    }
    if (created) {
      setItems((prev) => [rowToTrash(created), ...prev]);
    }
  }, []);

  const bulkSoftDelete = useCallback(async (
    deletePayloads: { entity: string; entityId: string; entityName: string; data: Record<string, unknown>; deletedBy: string }[],
    onProgress?: (processed: number, total: number) => void
  ) => {
    if (!deletePayloads || deletePayloads.length === 0) return;
    const rows = deletePayloads.map((payload) => ({
      entity: payload.entity,
      entity_id: payload.entityId,
      entity_name: payload.entityName,
      data: payload.data,
      deleted_by: payload.deletedBy,
    }));

    const createdRows: Record<string, unknown>[] = [];
    let processed = 0;

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const { data: created, error } = await supabase.from("trash").insert(chunk).select();
      if (error) {
        console.error("Supabase bulkSoftDelete error:", error);
        throw new Error(`فشل الحذف الجماعي إلى السلة: ${error.message} [Code: ${error.code}]`);
      }
      if (created) createdRows.push(...created);
      processed += chunk.length;
      if (onProgress) onProgress(processed, rows.length);
    }

    if (createdRows.length > 0) {
      const newItems = createdRows.map(rowToTrash);
      setItems((prev) => [...newItems, ...prev]);
    }
  }, []);

  const restore = useCallback(async (id: string): Promise<TrashItem | null> => {
    const item = items.find((i) => i.id === id);
    if (!item) return null;

    // 1. Re-insert item back to original Supabase table
    if (item.entity === "product" && item.data) {
      const row = productToRow(item.data);
      if (item.entityId && isUUID(item.entityId)) row.id = item.entityId;
      const { error: upsertErr } = await supabase.from("products").upsert(row).select();
      if (upsertErr) {
        console.error("Supabase restore product error:", upsertErr);
        throw new Error(`فشلت استعادة المنتج لقاعدة البيانات: ${upsertErr.message} [Code: ${upsertErr.code}]`);
      }
    } else if (item.entity === "supplier" && item.data) {
      const row = supplierToRow(item.data);
      if (item.entityId && isUUID(item.entityId)) row.id = item.entityId;
      const { error: upsertErr } = await supabase.from("suppliers").upsert(row).select();
      if (upsertErr) {
        console.error("Supabase restore supplier error:", upsertErr);
        throw new Error(`فشلت استعادة المورد لقاعدة البيانات: ${upsertErr.message} [Code: ${upsertErr.code}]`);
      }
    } else if (item.entity === "category" && item.data) {
      const row = categoryToRow(item.data);
      if (item.entityId && isUUID(item.entityId)) row.id = item.entityId;
      const { error: upsertErr } = await supabase.from("categories").upsert(row, { onConflict: "name" }).select();
      if (upsertErr) {
        console.error("Supabase restore category error:", upsertErr);
        throw new Error(`فشلت استعادة القسم لقاعدة البيانات: ${upsertErr.message} [Code: ${upsertErr.code}]`);
      }
    } else if (item.entity === "customer" && item.data) {
      const { error: upsertErr } = await supabase.from("customers").upsert(item.data).select();
      if (upsertErr) throw new Error(`فشلت استعادة الزبون: ${upsertErr.message} [Code: ${upsertErr.code}]`);
    } else if (item.entity === "order" && item.data) {
      const { error: upsertErr } = await supabase.from("orders").upsert(item.data).select();
      if (upsertErr) throw new Error(`فشلت استعادة الطلب: ${upsertErr.message} [Code: ${upsertErr.code}]`);
    }

    // 2. Delete entry from trash table in Supabase
    const { error: delErr } = await supabase.from("trash").delete().eq("id", id);
    if (delErr) {
      console.error("Supabase delete from trash error:", delErr);
      throw new Error(`فشل مسح السجل من سلة المهملات: ${delErr.message} [Code: ${delErr.code}]`);
    }

    setItems((prev) => prev.filter((i) => i.id !== id));
    await reloadTrash();
    return item;
  }, [items, reloadTrash]);

  const bulkRestore = useCallback(async (
    ids: string[],
    onProgress?: (processed: number, total: number) => void
  ): Promise<TrashItem[]> => {
    if (!ids || ids.length === 0) return [];
    const restoredItems = items.filter((i) => ids.includes(i.id));

    // Batch re-insert restored items back to target tables in CHUNK_SIZE = 50
    const productsToRestore = restoredItems.filter((i) => i.entity === "product" && i.data);
    for (let i = 0; i < productsToRestore.length; i += CHUNK_SIZE) {
      const chunk = productsToRestore.slice(i, i + CHUNK_SIZE);
      const rows = chunk.map((item) => {
        const r = productToRow(item.data);
        if (item.entityId && isUUID(item.entityId)) r.id = item.entityId;
        return r;
      });
      const { error: upsertErr } = await supabase.from("products").upsert(rows).select();
      if (upsertErr) throw new Error(`فشلت استعادة المنتجات: ${upsertErr.message} [Code: ${upsertErr.code}]`);
    }

    const suppliersToRestore = restoredItems.filter((i) => i.entity === "supplier" && i.data);
    for (let i = 0; i < suppliersToRestore.length; i += CHUNK_SIZE) {
      const chunk = suppliersToRestore.slice(i, i + CHUNK_SIZE);
      const rows = chunk.map((item) => {
        const r = supplierToRow(item.data);
        if (item.entityId && isUUID(item.entityId)) r.id = item.entityId;
        return r;
      });
      const { error: upsertErr } = await supabase.from("suppliers").upsert(rows).select();
      if (upsertErr) throw new Error(`فشلت استعادة الموردين: ${upsertErr.message} [Code: ${upsertErr.code}]`);
    }

    const categoriesToRestore = restoredItems.filter((i) => i.entity === "category" && i.data);
    for (let i = 0; i < categoriesToRestore.length; i += CHUNK_SIZE) {
      const chunk = categoriesToRestore.slice(i, i + CHUNK_SIZE);
      const rows = chunk.map((item) => {
        const r = categoryToRow(item.data);
        if (item.entityId && isUUID(item.entityId)) r.id = item.entityId;
        return r;
      });
      const { error: upsertErr } = await supabase.from("categories").upsert(rows, { onConflict: "name" }).select();
      if (upsertErr) throw new Error(`فشلت استعادة الأقسام: ${upsertErr.message} [Code: ${upsertErr.code}]`);
    }

    const customersToRestore = restoredItems.filter((i) => i.entity === "customer" && i.data);
    for (let i = 0; i < customersToRestore.length; i += CHUNK_SIZE) {
      const chunk = customersToRestore.slice(i, i + CHUNK_SIZE);
      const { error: upsertErr } = await supabase.from("customers").upsert(chunk.map((item) => item.data)).select();
      if (upsertErr) throw new Error(`فشلت استعادة الزبائن: ${upsertErr.message} [Code: ${upsertErr.code}]`);
    }

    const ordersToRestore = restoredItems.filter((i) => i.entity === "order" && i.data);
    for (let i = 0; i < ordersToRestore.length; i += CHUNK_SIZE) {
      const chunk = ordersToRestore.slice(i, i + CHUNK_SIZE);
      const { error: upsertErr } = await supabase.from("orders").upsert(chunk.map((item) => item.data)).select();
      if (upsertErr) throw new Error(`فشلت استعادة الطلبات: ${upsertErr.message} [Code: ${upsertErr.code}]`);
    }

    // Delete restored entries from trash table in CHUNK_SIZE = 50 batches
    let processed = 0;
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const { error: delErr } = await supabase.from("trash").delete().in("id", chunk);
      if (delErr) throw new Error(`فشل مسح السلة من Supabase: ${delErr.message} [Code: ${delErr.code}]`);
      processed += chunk.length;
      if (onProgress) onProgress(processed, ids.length);
    }

    const idSet = new Set(ids);
    setItems((prev) => prev.filter((i) => !idSet.has(i.id)));
    await reloadTrash();
    return restoredItems;
  }, [items, reloadTrash]);

  const permanentDelete = useCallback(async (id: string) => {
    const item = items.find((i) => i.id === id);
    if (item) {
      if (item.entity === "product" && item.entityId && isUUID(item.entityId)) {
        const { error: pErr } = await supabase.from("products").delete().eq("id", item.entityId);
        if (pErr) console.warn("Notice deleting product entity:", pErr.message);
      } else if (item.entity === "supplier" && item.entityId && isUUID(item.entityId)) {
        const { error: sErr } = await supabase.from("suppliers").delete().eq("id", item.entityId);
        if (sErr) console.warn("Notice deleting supplier entity:", sErr.message);
      } else if (item.entity === "category" && item.entityId && isUUID(item.entityId)) {
        const { error: cErr } = await supabase.from("categories").delete().eq("id", item.entityId);
        if (cErr) console.warn("Notice deleting category entity:", cErr.message);
      } else if (item.entity === "customer" && item.entityId && isUUID(item.entityId)) {
        const { error: custErr } = await supabase.from("customers").delete().eq("id", item.entityId);
        if (custErr) console.warn("Notice deleting customer entity:", custErr.message);
      } else if (item.entity === "order" && item.entityId && isUUID(item.entityId)) {
        const { error: oErr } = await supabase.from("orders").delete().eq("id", item.entityId);
        if (oErr) console.warn("Notice deleting order entity:", oErr.message);
      }
    }

    const { error } = await supabase.from("trash").delete().eq("id", id);
    if (error) {
      console.error("Supabase permanentDelete error:", error);
      throw new Error(`فشل الحذف النهائي من Supabase: ${error.message} [Code: ${error.code}]`);
    }

    setItems((prev) => prev.filter((i) => i.id !== id));
    await reloadTrash();
  }, [items, reloadTrash]);

  const bulkPermanentDelete = useCallback(
    async (
      ids: string[],
      onProgress?: (processed: number, total: number) => void
    ) => {
      if (!ids || ids.length === 0) return;

      let processed = 0;
      const total = ids.length;

      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE);
        const itemsInChunk = items.filter((item) => chunk.includes(item.id));

        // 1. Delete original entity records from products table if any
        const productEntityIds = itemsInChunk
          .filter((item) => item.entity === "product" && item.entityId && isUUID(item.entityId))
          .map((item) => item.entityId);
        if (productEntityIds.length > 0) {
          const { error: prodError } = await supabase.from("products").delete().in("id", productEntityIds);
          if (prodError) {
            console.warn("تنبيه حذف المنتجات من Supabase:", prodError.message);
          }
        }

        const supplierEntityIds = itemsInChunk
          .filter((item) => item.entity === "supplier" && item.entityId && isUUID(item.entityId))
          .map((item) => item.entityId);
        if (supplierEntityIds.length > 0) {
          const { error: supError } = await supabase.from("suppliers").delete().in("id", supplierEntityIds);
          if (supError) console.warn("تنبيه حذف الموردين:", supError.message);
        }

        const categoryEntityIds = itemsInChunk
          .filter((item) => item.entity === "category" && item.entityId && isUUID(item.entityId))
          .map((item) => item.entityId);
        if (categoryEntityIds.length > 0) {
          const { error: catError } = await supabase.from("categories").delete().in("id", categoryEntityIds);
          if (catError) console.warn("تنبيه حذف الأقسام:", catError.message);
        }

        const customerEntityIds = itemsInChunk
          .filter((item) => item.entity === "customer" && item.entityId && isUUID(item.entityId))
          .map((item) => item.entityId);
        if (customerEntityIds.length > 0) {
          const { error: custError } = await supabase.from("customers").delete().in("id", customerEntityIds);
          if (custError) console.warn("تنبيه حذف الزبائن:", custError.message);
        }

        const orderEntityIds = itemsInChunk
          .filter((item) => item.entity === "order" && item.entityId && isUUID(item.entityId))
          .map((item) => item.entityId);
        if (orderEntityIds.length > 0) {
          const { error: ordError } = await supabase.from("orders").delete().in("id", orderEntityIds);
          if (ordError) console.warn("تنبيه حذف الطلبات:", ordError.message);
        }

        // 2. Delete entries from trash table in Supabase
        const { error: trashError } = await supabase.from("trash").delete().in("id", chunk);
        if (trashError) {
          console.error("خطأ حذف سجلات السلة من Supabase:", trashError);
          throw new Error(`فشل الحذف من سلة المهملات: ${trashError.message} [Code: ${trashError.code}]`);
        }

        processed += chunk.length;
        if (onProgress) {
          onProgress(processed, total);
        }
      }

      // 3. Update local state
      const idSet = new Set(ids);
      setItems((prev) => prev.filter((item) => !idSet.has(item.id)));

      // 4. Revalidate data from server for 100% sync
      await reloadTrash();
    },
    [items, reloadTrash]
  );

  const purgeExpired = useCallback(async (): Promise<number> => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - autoDeleteDays);
    const cutoffISO = cutoff.toISOString();
    const { data, error } = await supabase.from("trash").delete().lt("deleted_at", cutoffISO).select();
    if (error) {
      console.error("Supabase purgeExpired error:", error);
      throw new Error(`فشل تنظيف العناصر من Supabase: ${error.message} [Code: ${error.code}]`);
    }
    const count = data?.length || 0;
    if (count > 0) {
      setItems((prev) => prev.filter((i) => new Date(i.deletedAt) >= cutoff));
    }
    return count;
  }, [autoDeleteDays]);

  const setAutoDeleteDays = useCallback(async (days: number) => {
    const valid = Math.max(1, days);
    setAutoDeleteDaysState(valid);
    if (typeof window !== "undefined") {
      localStorage.setItem(TRASH_DAYS_KEY, valid.toString());
    }

    // Persist to Supabase settings table if row exists
    try {
      const { data } = await supabase.from("settings").select("id").limit(1);
      if (data && data.length > 0) {
        await supabase
          .from("settings")
          .update({ auto_delete_days: valid } as any)
          .eq("id", data[0].id);
      }
    } catch {
      // Fallback silently if table column not yet created
    }
  }, []);

  return (
    <TrashContext.Provider
      value={{
        items,
        loading,
        reloadTrash,
        softDelete,
        bulkSoftDelete,
        restore,
        bulkRestore,
        permanentDelete,
        bulkPermanentDelete,
        purgeExpired,
        autoDeleteDays,
        setAutoDeleteDays,
      }}
    >
      {children}
    </TrashContext.Provider>
  );
}

export function useTrash() {
  const context = useContext(TrashContext);
  if (!context) throw new Error("useTrash must be used within TrashProvider");
  return context;
}

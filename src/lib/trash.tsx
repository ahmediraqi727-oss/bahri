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
    entity: (row.entity as string) || (row.type as string) || "product",
    entityId: (row.entity_id as string) || (row.entityId as string) || (row.id as string),
    entityName: (row.entity_name as string) || (row.name as string) || "عنصر",
    data: (row.data as Record<string, unknown>) || {},
    deletedBy: (row.deleted_by as string) || "",
    deletedAt: (row.deleted_at as string) || new Date().toISOString(),
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
    const { data: freshRow } = await supabase.from("trash").select("*").eq("id", id).maybeSingle();
    const item = freshRow ? rowToTrash(freshRow) : items.find((i) => i.id === id);
    if (!item) return null;

    const eType = (item.entity || (item as any).type || "product").toLowerCase();
    const dataId = item.data?.id as string | undefined;
    const targetEntityId = item.entityId && item.entityId !== item.id ? item.entityId : (dataId || item.entityId || item.id);

    // 1. Re-insert item back to original Supabase table
    if (eType === "product" && item.data) {
      const row = productToRow(item.data);
      if (targetEntityId && isUUID(targetEntityId)) row.id = targetEntityId;
      const { error: upsertErr } = await supabase.from("products").upsert(row).select();
      if (upsertErr) {
        console.error("Supabase restore product error:", upsertErr);
        throw new Error(`فشلت استعادة المنتج لقاعدة البيانات: ${upsertErr.message} [Code: ${upsertErr.code}]`);
      }
    } else if (eType === "supplier" && item.data) {
      const row = supplierToRow(item.data);
      if (targetEntityId && isUUID(targetEntityId)) row.id = targetEntityId;
      const { error: upsertErr } = await supabase.from("suppliers").upsert(row).select();
      if (upsertErr) {
        console.error("Supabase restore supplier error:", upsertErr);
        throw new Error(`فشلت استعادة المورد لقاعدة البيانات: ${upsertErr.message} [Code: ${upsertErr.code}]`);
      }
    } else if (eType === "category" && item.data) {
      const row = categoryToRow(item.data);
      if (targetEntityId && isUUID(targetEntityId)) row.id = targetEntityId;
      const { error: upsertErr } = await supabase.from("categories").upsert(row, { onConflict: "name" }).select();
      if (upsertErr) {
        console.error("Supabase restore category error:", upsertErr);
        throw new Error(`فشلت استعادة القسم لقاعدة البيانات: ${upsertErr.message} [Code: ${upsertErr.code}]`);
      }
    } else if (eType === "customer" && item.data) {
      const { error: upsertErr } = await supabase.from("customers").upsert(item.data).select();
      if (upsertErr) throw new Error(`فشلت استعادة الزبون: ${upsertErr.message} [Code: ${upsertErr.code}]`);
    } else if (eType === "order" && item.data) {
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
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (typeof reloadTrash === "function") {
      await reloadTrash();
    }
    return item;
  }, [items, reloadTrash]);

  const bulkRestore = useCallback(async (
    ids: string[],
    onProgress?: (processed: number, total: number) => void
  ): Promise<TrashItem[]> => {
    if (!ids || ids.length === 0) return [];
    
    // Fetch fresh rows from Supabase for all requested IDs to bypass any stale closures
    const { data: freshRows } = await supabase.from("trash").select("*").in("id", ids);
    const restoredItems = freshRows && freshRows.length > 0 ? freshRows.map(rowToTrash) : items.filter((i) => ids.includes(i.id));

    const getItemsByEntityType = (entityType: string) => {
      return restoredItems.filter((i) => {
        const eType = (i.entity || (i as any).type || "").toLowerCase();
        return eType === entityType && i.data;
      });
    };

    // Batch re-insert restored items back to target tables in CHUNK_SIZE = 50
    const productsToRestore = getItemsByEntityType("product");
    for (let i = 0; i < productsToRestore.length; i += CHUNK_SIZE) {
      const chunk = productsToRestore.slice(i, i + CHUNK_SIZE);
      const rows = chunk.map((item) => {
        const r = productToRow(item.data);
        const dataId = item.data?.id as string | undefined;
        const targetId = item.entityId && item.entityId !== item.id ? item.entityId : (dataId || item.entityId || item.id);
        if (targetId && isUUID(targetId)) r.id = targetId;
        return r;
      });
      const { error: upsertErr } = await supabase.from("products").upsert(rows).select();
      if (upsertErr) throw new Error(`فشلت استعادة المنتجات: ${upsertErr.message} [Code: ${upsertErr.code}]`);
    }

    const suppliersToRestore = getItemsByEntityType("supplier");
    for (let i = 0; i < suppliersToRestore.length; i += CHUNK_SIZE) {
      const chunk = suppliersToRestore.slice(i, i + CHUNK_SIZE);
      const rows = chunk.map((item) => {
        const r = supplierToRow(item.data);
        const dataId = item.data?.id as string | undefined;
        const targetId = item.entityId && item.entityId !== item.id ? item.entityId : (dataId || item.entityId || item.id);
        if (targetId && isUUID(targetId)) r.id = targetId;
        return r;
      });
      const { error: upsertErr } = await supabase.from("suppliers").upsert(rows).select();
      if (upsertErr) throw new Error(`فشلت استعادة الموردين: ${upsertErr.message} [Code: ${upsertErr.code}]`);
    }

    const categoriesToRestore = getItemsByEntityType("category");
    for (let i = 0; i < categoriesToRestore.length; i += CHUNK_SIZE) {
      const chunk = categoriesToRestore.slice(i, i + CHUNK_SIZE);
      const rows = chunk.map((item) => {
        const r = categoryToRow(item.data);
        const dataId = item.data?.id as string | undefined;
        const targetId = item.entityId && item.entityId !== item.id ? item.entityId : (dataId || item.entityId || item.id);
        if (targetId && isUUID(targetId)) r.id = targetId;
        return r;
      });
      const { error: upsertErr } = await supabase.from("categories").upsert(rows, { onConflict: "name" }).select();
      if (upsertErr) throw new Error(`فشلت استعادة الأقسام: ${upsertErr.message} [Code: ${upsertErr.code}]`);
    }

    const customersToRestore = getItemsByEntityType("customer");
    for (let i = 0; i < customersToRestore.length; i += CHUNK_SIZE) {
      const chunk = customersToRestore.slice(i, i + CHUNK_SIZE);
      const { error: upsertErr } = await supabase.from("customers").upsert(chunk.map((item) => item.data)).select();
      if (upsertErr) throw new Error(`فشلت استعادة الزبائن: ${upsertErr.message} [Code: ${upsertErr.code}]`);
    }

    const ordersToRestore = getItemsByEntityType("order");
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
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (typeof reloadTrash === "function") {
      await reloadTrash();
    }
    return restoredItems;
  }, [items, reloadTrash]);

  const permanentDelete = useCallback(async (id: string) => {
    // 1. Fetch fresh row directly from Supabase trash table to eliminate stale state closures
    const { data: freshRow } = await supabase.from("trash").select("*").eq("id", id).maybeSingle();
    const item = freshRow ? rowToTrash(freshRow) : items.find((i) => i.id === id);

    if (item) {
      const eType = (item.entity || (item as any).type || "").toLowerCase();
      const dataId = item.data?.id as string | undefined;
      const targetId = item.entityId && item.entityId !== item.id ? item.entityId : (dataId || item.entityId || item.id);

      if (targetId && isUUID(targetId)) {
        if (eType === "product") {
          const { error: pErr } = await supabase.from("products").delete().eq("id", targetId);
          if (pErr) console.error("Notice deleting product entity:", pErr.message);
        } else if (eType === "supplier") {
          const { error: sErr } = await supabase.from("suppliers").delete().eq("id", targetId);
          if (sErr) console.error("Notice deleting supplier entity:", sErr.message);
        } else if (eType === "category") {
          const { error: cErr } = await supabase.from("categories").delete().eq("id", targetId);
          if (cErr) console.error("Notice deleting category entity:", cErr.message);
        } else if (eType === "customer") {
          const { error: custErr } = await supabase.from("customers").delete().eq("id", targetId);
          if (custErr) console.error("Notice deleting customer entity:", custErr.message);
        } else if (eType === "order") {
          const { error: oErr } = await supabase.from("orders").delete().eq("id", targetId);
          if (oErr) console.error("Notice deleting order entity:", oErr.message);
        }
      }
    }

    const { error } = await supabase.from("trash").delete().eq("id", id);
    if (error) {
      console.error("Supabase permanentDelete error:", error);
      throw new Error(`فشل الحذف النهائي من Supabase: ${error.message} [Code: ${error.code}]`);
    }

    setItems((prev) => prev.filter((i) => i.id !== id));
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (typeof reloadTrash === "function") {
      await reloadTrash();
    }
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

        // 1. Fetch fresh chunk rows directly from Supabase trash table to eliminate stale state closures
        const { data: freshChunkRows, error: fetchErr } = await supabase
          .from("trash")
          .select("*")
          .in("id", chunk);

        if (fetchErr) {
          console.error("خطأ جلب سجلات السلة المحدثة:", fetchErr);
        }

        const rowsToProcess = freshChunkRows && freshChunkRows.length > 0
          ? freshChunkRows.map(rowToTrash)
          : items.filter((item) => chunk.includes(item.id));

        // 2. Dual ID Mapping & Multi-table Deletion (item.entityId, item.data.id, item.id)
        const getEntityIds = (entityType: string) => {
          return rowsToProcess
            .filter((item) => {
              const eType = (item.entity || (item as any).type || "").toLowerCase();
              return eType === entityType;
            })
            .map((item) => {
              const dataId = item.data?.id as string | undefined;
              const candidate = item.entityId && item.entityId !== item.id ? item.entityId : (dataId || item.entityId || item.id);
              return candidate && isUUID(candidate) ? candidate : null;
            })
            .filter((id): id is string => Boolean(id));
        };

        // Products
        const productEntityIds = getEntityIds("product");
        if (productEntityIds.length > 0) {
          const { error: prodError } = await supabase.from("products").delete().in("id", productEntityIds);
          if (prodError) {
            console.error("خطأ حذف المنتجات من Supabase:", prodError);
            throw new Error(`فشل الحذف من جدول المنتجات الأصلي: ${prodError.message} [Code: ${prodError.code}]`);
          }
        }

        // Suppliers
        const supplierEntityIds = getEntityIds("supplier");
        if (supplierEntityIds.length > 0) {
          const { error: supError } = await supabase.from("suppliers").delete().in("id", supplierEntityIds);
          if (supError) {
            console.error("خطأ حذف الموردين من Supabase:", supError);
            throw new Error(`فشل الحذف من جدول الموردين الأصلي: ${supError.message} [Code: ${supError.code}]`);
          }
        }

        // Categories
        const categoryEntityIds = getEntityIds("category");
        if (categoryEntityIds.length > 0) {
          const { error: catError } = await supabase.from("categories").delete().in("id", categoryEntityIds);
          if (catError) {
            console.error("خطأ حذف الأقسام من Supabase:", catError);
            throw new Error(`فشل الحذف من جدول الأقسام الأصلي: ${catError.message} [Code: ${catError.code}]`);
          }
        }

        // Customers
        const customerEntityIds = getEntityIds("customer");
        if (customerEntityIds.length > 0) {
          const { error: custError } = await supabase.from("customers").delete().in("id", customerEntityIds);
          if (custError) {
            console.error("خطأ حذف الزبائن من Supabase:", custError);
            throw new Error(`فشل الحذف من جدول الزبائن الأصلي: ${custError.message} [Code: ${custError.code}]`);
          }
        }

        // Orders
        const orderEntityIds = getEntityIds("order");
        if (orderEntityIds.length > 0) {
          const { error: ordError } = await supabase.from("orders").delete().in("id", orderEntityIds);
          if (ordError) {
            console.error("خطأ حذف الطلبات من Supabase:", ordError);
            throw new Error(`فشل الحذف من جدول الطلبات الأصلي: ${ordError.message} [Code: ${ordError.code}]`);
          }
        }

        // 3. Delete from trash table in Supabase
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

      // 4. Optimistic state update using O(1) Set lookup
      const idSet = new Set(ids);
      setItems((prev) => prev.filter((item) => !idSet.has(item.id)));

      // 5. 300ms propagation delay for Supabase DB commit completion
      await new Promise((resolve) => setTimeout(resolve, 300));

      // 6. Safety check for reloadTrash callback
      if (typeof reloadTrash === "function") {
        await reloadTrash();
      }
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

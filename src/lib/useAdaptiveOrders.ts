"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase-client";
import { Order, CartItem } from "@/lib/order-types";

interface UseAdaptiveOrdersOptions {
  searchQuery?: string;
  statusFilter?: string;
  startDate?: string;
  endDate?: string;
  batchSize?: number;
}

interface UseAdaptiveOrdersReturn {
  orders: Order[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  totalCount: number;
  metrics: {
    totalRevenue: number;
    pendingCount: number;
    deliveredCount: number;
    cancelledCount: number;
  };
  loadMore: () => Promise<void>;
  refetch: () => Promise<void>;
}

export function rowToOrder(r: Record<string, any>): Order {
  return {
    id: r.id,
    serialNumber: r.serial_number ? Number(r.serial_number) : undefined,
    invoiceSerial: r.invoice_serial || undefined,
    customerName: r.customer_name || "زبون",
    customerPhone: r.customer_phone || "",
    customerAddress: r.customer_address || "",
    items: (r.items as CartItem[]) || [],
    total: Number(r.total) || 0,
    deliveryFee: Number(r.delivery_fee) || 0,
    deliveryDuration: r.delivery_duration || "",
    status: (r.status as Order["status"]) || "pending",
    notes: r.notes || "",
    platform: r.platform || undefined,
    createdAt: r.created_at || new Date().toISOString(),
  };
}

export function useAdaptiveOrders({
  searchQuery = "",
  statusFilter = "all",
  startDate = "",
  endDate = "",
  batchSize = 20,
}: UseAdaptiveOrdersOptions = {}): UseAdaptiveOrdersReturn {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [metrics, setMetrics] = useState({
    totalRevenue: 0,
    pendingCount: 0,
    deliveredCount: 0,
    cancelledCount: 0,
  });

  const pageRef = useRef(0);
  const isFetchingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Separate non-blocking summary metrics query (Fast aggregation without returning full rows)
  const fetchSummaryMetrics = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("orders").select("total, status");
      if (error || !data) return;

      let totalRevenue = 0;
      let pendingCount = 0;
      let deliveredCount = 0;
      let cancelledCount = 0;

      data.forEach((item) => {
        const amt = Number(item.total) || 0;
        const st = item.status;
        if (st === "delivered") totalRevenue += amt;
        if (st === "pending") pendingCount++;
        if (st === "delivered") deliveredCount++;
        if (st === "cancelled") cancelledCount++;
      });

      setMetrics({
        totalRevenue,
        pendingCount,
        deliveredCount,
        cancelledCount,
      });
    } catch (err) {
      console.error("Error loading order metrics:", err);
    }
  }, []);

  useEffect(() => {
    fetchSummaryMetrics();
  }, [fetchSummaryMetrics]);

  // Main Range-paginated Fetching with AbortController for rapid input protection
  const fetchOrdersPage = useCallback(
    async (pageToFetch: number, isReset = false) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      if (isReset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      // Abort previous stale request if rapid filter/typing occurs
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const from = pageToFetch * batchSize;
        const to = from + batchSize - 1;

        let query = supabase
          .from("orders")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(from, to);

        // Apply Server-side filtering
        if (statusFilter && statusFilter !== "all") {
          query = query.eq("status", statusFilter);
        }

        if (searchQuery && searchQuery.trim()) {
          const q = searchQuery.trim();
          query = query.or(`customer_name.ilike.%${q}%,customer_phone.ilike.%${q}%,notes.ilike.%${q}%`);
        }

        if (startDate) {
          query = query.gte("created_at", new Date(startDate).toISOString());
        }

        if (endDate) {
          const endIso = new Date(endDate);
          endIso.setHours(23, 59, 59, 999);
          query = query.lte("created_at", endIso.toISOString());
        }

        const { data, count, error } = await query;

        if (controller.signal.aborted) {
          return;
        }

        if (error) {
          console.warn("Supabase range orders fetch warning:", error.message);
          setHasMore(false);
          return;
        }

        if (data) {
          const fetchedItems = data.map(rowToOrder);
          const countVal = count ?? fetchedItems.length;
          setTotalCount(countVal);

          if (isReset) {
            setOrders(fetchedItems);
          } else {
            setOrders((prev) => {
              const existingIds = new Set(prev.map((o) => o.id));
              const newItems = fetchedItems.filter((o) => !existingIds.has(o.id));
              return [...prev, ...newItems];
            });
          }

          const currentTotal = isReset ? fetchedItems.length : orders.length + fetchedItems.length;
          setHasMore(fetchedItems.length >= batchSize && currentTotal < countVal);
          pageRef.current = pageToFetch;
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.error("Adaptive orders fetch error:", err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setLoadingMore(false);
          isFetchingRef.current = false;
        }
      }
    },
    [batchSize, statusFilter, searchQuery, startDate, endDate, orders.length]
  );

  const loadMore = useCallback(async () => {
    if (!hasMore || loading || loadingMore || isFetchingRef.current) return;
    const nextPage = pageRef.current + 1;
    await fetchOrdersPage(nextPage, false);
  }, [hasMore, loading, loadingMore, fetchOrdersPage]);

  const refetch = useCallback(async () => {
    pageRef.current = 0;
    await Promise.all([fetchOrdersPage(0, true), fetchSummaryMetrics()]);
  }, [fetchOrdersPage, fetchSummaryMetrics]);

  useEffect(() => {
    pageRef.current = 0;
    fetchOrdersPage(0, true);
  }, [statusFilter, searchQuery, startDate, endDate]);

  return {
    orders,
    loading,
    loadingMore,
    hasMore,
    totalCount,
    metrics,
    loadMore,
    refetch,
  };
}

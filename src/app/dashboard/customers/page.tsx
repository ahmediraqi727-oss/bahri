"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase-client";
import { useSettings } from "@/lib/settings-context";
import { useSales } from "@/lib/sales-context";
import { useActivityLog } from "@/lib/activity-log";
import { CustomerRecord } from "@/lib/types";
import { rowToCustomer } from "@/lib/visitor-tracker";
import DataTableWrapper from "@/components/DataTableWrapper";

type FilterTab = "all" | "known" | "anonymous" | "registered" | "blocked" | "suspicious";
type SortOption = "latestActive" | "latestCreated" | "mostVisits" | "priority";

export default function CustomersPage() {
  const { settings } = useSettings();
  const { sales } = useSales();
  const { logActivity } = useActivityLog();

  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [sortBy, setSortBy] = useState<SortOption>("latestActive");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Detail Modal State
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Fetch Customers & Visitors from Supabase
  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("Supabase fetch customers warning:", error.message);
      }
      if (data) {
        setCustomers(data.map(rowToCustomer));
      }
    } catch (err) {
      console.error("Fetch customers exception:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();

    // Supabase Real-Time Listener
    const channel = supabase
      .channel("public:customers")
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, () => {
        fetchCustomers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Compute Sales & Purchases per customer
  const customerSalesStats = useMemo(() => {
    const map = new Map<string, { totalSpent: number; orderCount: number }>();
    sales.forEach((s) => {
      const key = (s.customerPhone || s.customerName || "").trim().toLowerCase();
      if (!key) return;
      const existing = map.get(key) || { totalSpent: 0, orderCount: 0 };
      map.set(key, {
        totalSpent: existing.totalSpent + (s.total || 0),
        orderCount: existing.orderCount + 1,
      });
    });
    return map;
  }, [sales]);

  // Sort & Filter Customers
  const processedCustomers = useMemo(() => {
    let list = [...customers];

    // 1. Filter by Tab
    if (activeTab === "known") {
      list = list.filter((c) => c.name && !c.name.startsWith("مجهول"));
    } else if (activeTab === "anonymous") {
      list = list.filter((c) => !c.name || c.name.startsWith("مجهول"));
    } else if (activeTab === "registered") {
      list = list.filter((c) => c.isRegistered || c.email);
    } else if (activeTab === "blocked") {
      list = list.filter((c) => c.isBlocked);
    } else if (activeTab === "suspicious") {
      list = list.filter((c) => c.isSuspicious);
    }

    // 2. Filter by Search Query
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((c) => {
        return (
          c.name.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          c.governorate.toLowerCase().includes(q) ||
          c.city.toLowerCase().includes(q) ||
          c.deviceType.toLowerCase().includes(q) ||
          c.visitorId.toLowerCase().includes(q)
        );
      });
    }

    // 3. Sorting Engine: "الأحدث" (Latest active), "الأحدث إنشاءً", "الأكثر زيارة", "الأولويات"
    return list.sort((a, b) => {
      if (sortBy === "latestActive") {
        const timeA = new Date(a.lastActiveAt || a.createdAt).getTime();
        const timeB = new Date(b.lastActiveAt || b.createdAt).getTime();
        return timeB - timeA;
      }
      if (sortBy === "latestCreated") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortBy === "mostVisits") {
        return (b.visitCount || 1) - (a.visitCount || 1);
      }
      if (sortBy === "priority") {
        if (a.isSuspicious && !b.isSuspicious) return -1;
        if (!a.isSuspicious && b.isSuspicious) return 1;

        const aIsAnon = a.name.startsWith("مجهول");
        const bIsAnon = b.name.startsWith("مجهول");

        if (!aIsAnon && bIsAnon) return -1;
        if (aIsAnon && !bIsAnon) return 1;

        if (a.isRegistered && !b.isRegistered) return -1;
        if (!a.isRegistered && b.isRegistered) return 1;

        return new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime();
      }
      return 0;
    });
  }, [customers, activeTab, search, sortBy]);

  // Analytics Stats Counts
  const totalCount = customers.length;
  const knownCount = customers.filter((c) => c.name && !c.name.startsWith("مجهول")).length;
  const anonCount = customers.filter((c) => !c.name || c.name.startsWith("مجهول")).length;
  const registeredCount = customers.filter((c) => c.isRegistered || c.email).length;
  const blockedCount = customers.filter((c) => c.isBlocked).length;
  const suspiciousCount = customers.filter((c) => c.isSuspicious).length;

  // Multi-Selection Logic
  const toggleSelectAll = () => {
    if (selectedIds.size === processedCustomers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(processedCustomers.map((c) => c.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Actions: Block / Unblock Single Customer
  const handleToggleBlock = async (c: CustomerRecord) => {
    const newStatus = !c.isBlocked;
    const { error } = await supabase
      .from("customers")
      .update({ is_blocked: newStatus, updated_at: new Date().toISOString() })
      .eq("id", c.id);

    if (error) {
      alert(`حدث خطأ أثناء تغيير حالة الحظر: ${error.message}`);
      return;
    }

    await logActivity({
      user: "manager",
      action: "update",
      entity: "الزبائن والزوار",
      entityId: c.id,
      details: `${newStatus ? "حظر" : "إلغاء حظر"} الزائر/الزبون "${c.name}"`,
    });

    setToastMsg(newStatus ? `🚫 تم حظر الزائر "${c.name}" بنجاح` : `🔓 تم إلغاء حظر الزائر "${c.name}"`);
    setTimeout(() => setToastMsg(null), 3000);
    fetchCustomers();
  };

  // Actions: Clear Suspicious Single Customer
  const handleClearSingleSuspicious = async (c: CustomerRecord) => {
    const { error } = await supabase
      .from("customers")
      .update({ is_suspicious: false, updated_at: new Date().toISOString() })
      .eq("id", c.id);

    if (error) {
      alert(`حدث خطأ أثناء إلغاء النشاط المشبوه: ${error.message}`);
      return;
    }

    await logActivity({
      user: "manager",
      action: "update",
      entity: "الزبائن والزوار",
      entityId: c.id,
      details: `مسح وتجاهل علم النشاط المشبوه للزائر "${c.name}"`,
    });

    setToastMsg(`🛡️ تم مسح النشاط المشبوه للزائر "${c.name}" وإعادته لحساب اعتيادي`);
    setTimeout(() => setToastMsg(null), 3000);
    fetchCustomers();
  };

  // Actions: Delete Single Customer
  const handleDeleteSingle = async (c: CustomerRecord) => {
    if (!confirm(`هل أنت تأكد من حذف بيانات الزائر/الزبون "${c.name}"؟`)) return;

    const { error } = await supabase.from("customers").delete().eq("id", c.id);
    if (error) {
      alert(`حدث خطأ أثناء الحذف: ${error.message}`);
      return;
    }

    await logActivity({
      user: "manager",
      action: "delete",
      entity: "الزبائن والزوار",
      entityId: c.id,
      details: `حذف بيانات الزائر/الزبون "${c.name}"`,
    });

    setToastMsg(`🗑️ تم حذف بيانات الزائر "${c.name}" بنجاح`);
    setTimeout(() => setToastMsg(null), 3000);
    fetchCustomers();
  };

  // =========================================================================
  // BULK ACTIONS (Delete, Ban, Ignore Suspicious)
  // =========================================================================

  // 1. Bulk Delete
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!confirm(`هل أنت تأكد من حذف ${count} زبون/زائر محدد نهائياً من قاعدة البيانات؟`)) return;

    const idsArray = Array.from(selectedIds);
    const { error } = await supabase.from("customers").delete().in("id", idsArray);

    if (error) {
      alert(`حدث خطأ أثناء الحذف الجماعي: ${error.message}`);
      return;
    }

    await logActivity({
      user: "manager",
      action: "delete",
      entity: "الزبائن والزوار",
      details: `حذف جماعي لـ ${count} زائر وزبون`,
    });

    setToastMsg(`🗑️ تم حذف ${count} حساب زائر/زبون بنجاح`);
    setTimeout(() => setToastMsg(null), 3000);
    setSelectedIds(new Set());
    fetchCustomers();
  };

  // 2. Bulk Ban
  const handleBatchBan = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!confirm(`هل أنت تأكد من حظر ${count} حساب زائر/زبون محدد ونقلهم إلى قائمة المحظورين؟`)) return;

    const idsArray = Array.from(selectedIds);
    const { error } = await supabase
      .from("customers")
      .update({ is_blocked: true, updated_at: new Date().toISOString() })
      .in("id", idsArray);

    if (error) {
      alert(`حدث خطأ أثناء الحظر الجماعي: ${error.message}`);
      return;
    }

    await logActivity({
      user: "manager",
      action: "update",
      entity: "الزبائن والزوار",
      details: `حظر جماعي لـ ${count} زائر وزبون`,
    });

    setToastMsg(`🚫 تم حظر ${count} حساب بنجاح ونقلهم إلى قائمة المحظورين`);
    setTimeout(() => setToastMsg(null), 3000);
    setSelectedIds(new Set());
    fetchCustomers();
  };

  // 3. Bulk Clear / Ignore Suspicious Activity
  const handleBatchClearSuspicious = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!confirm(`هل أنت تأكد من إلغاء وتجاهل علم النشاط المشبوه لـ ${count} حساب محدد وإعادتهم لحسابات اعتيادية؟`)) return;

    const idsArray = Array.from(selectedIds);
    const { error } = await supabase
      .from("customers")
      .update({ is_suspicious: false, updated_at: new Date().toISOString() })
      .in("id", idsArray);

    if (error) {
      alert(`حدث خطأ أثناء إلغاء النشاط المشبوه الجماعي: ${error.message}`);
      return;
    }

    await logActivity({
      user: "manager",
      action: "update",
      entity: "الزبائن والزوار",
      details: `تجاهل وتطهير النشاط المشبوه لـ ${count} حساب`,
    });

    setToastMsg(`🛡️ تم مسح وتجاهل النشاط المشبوه لـ ${count} حساب بنجاح`);
    setTimeout(() => setToastMsg(null), 3000);
    setSelectedIds(new Set());
    fetchCustomers();
  };

  return (
    <div className="space-y-6" dir="rtl">
      
      {/* Toast Notification Banner */}
      {toastMsg && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-blue-500/40 text-xs font-extrabold animate-bounce flex items-center gap-2">
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Header & Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
            <span>👥</span>
            <span>نظام تتبع الزوار والزبائن وإدارة الحسابات</span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            تتبع لحظي للضيوف غير المسجلين والزبائن المعرفين مع إمكانية الحظر والحذف وترقية الصلاحيات
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/accounts"
            className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold text-xs shadow-md transition-all flex items-center gap-1.5 hover:scale-[1.02]"
          >
            <span>🔐</span>
            <span>إدارة الحسابات والصلاحيات</span>
          </Link>
        </div>
      </div>

      {/* Analytics Counter Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm text-center">
          <span className="block text-xs font-bold text-gray-500 dark:text-gray-400">إجمالي الزوار</span>
          <span className="text-xl sm:text-2xl font-extrabold text-blue-600 dark:text-blue-400 mt-1 block">
            {totalCount}
          </span>
        </div>

        <div className="bg-emerald-50/60 dark:bg-emerald-950/30 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800 shadow-sm text-center">
          <span className="block text-xs font-bold text-emerald-700 dark:text-emerald-300">معروف بالاسم</span>
          <span className="text-xl sm:text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 block">
            {knownCount}
          </span>
        </div>

        <div className="bg-amber-50/60 dark:bg-amber-950/30 p-4 rounded-2xl border border-amber-200 dark:border-amber-800 shadow-sm text-center">
          <span className="block text-xs font-bold text-amber-700 dark:text-amber-300">ضيوف مجهول</span>
          <span className="text-xl sm:text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-1 block">
            {anonCount}
          </span>
        </div>

        <div className="bg-purple-50/60 dark:bg-purple-950/30 p-4 rounded-2xl border border-purple-200 dark:border-purple-800 shadow-sm text-center">
          <span className="block text-xs font-bold text-purple-700 dark:text-purple-300">مسجلين بريد</span>
          <span className="text-xl sm:text-2xl font-extrabold text-purple-600 dark:text-purple-400 mt-1 block">
            {registeredCount}
          </span>
        </div>

        <div className="bg-red-50/60 dark:bg-red-950/30 p-4 rounded-2xl border border-red-200 dark:border-red-800 shadow-sm text-center">
          <span className="block text-xs font-bold text-red-700 dark:text-red-300">محظورون</span>
          <span className="text-xl sm:text-2xl font-extrabold text-red-600 dark:text-red-400 mt-1 block">
            {blockedCount}
          </span>
        </div>

        <div className="bg-rose-500/10 dark:bg-rose-950/40 p-4 rounded-2xl border border-rose-300 dark:border-rose-800 shadow-sm text-center">
          <span className="block text-xs font-bold text-rose-700 dark:text-rose-300">نشاط مشبوه ⚠️</span>
          <span className="text-xl sm:text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-1 block">
            {suspiciousCount}
          </span>
        </div>
      </div>

      {/* Dynamic Multi-Selection Bulk Action Toolbar */}
      {selectedIds.size > 0 && (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-4 shadow-xl border border-blue-500/40 flex flex-wrap items-center justify-between gap-4 animate-slideDown">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-extrabold text-sm">
              ☑️
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base">
                تم تحديد {selectedIds.size} من إجمالي {processedCustomers.length} زائر/زبون
              </h3>
              <p className="text-[11px] text-blue-200">اختر أحد الإجراءات الجماعية أدناه للتطبيق الفوري</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            {/* 1. Delete Button */}
            <button
              onClick={handleBatchDelete}
              className="flex-1 sm:flex-initial px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
            >
              <span>🗑️</span>
              <span>حذف المحدد ({selectedIds.size})</span>
            </button>

            {/* 2. Ban Button */}
            <button
              onClick={handleBatchBan}
              className="flex-1 sm:flex-initial px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
            >
              <span>🚫</span>
              <span>حظر المحدد ({selectedIds.size})</span>
            </button>

            {/* 3. Clear/Ignore Suspicious Activity Button */}
            <button
              onClick={handleBatchClearSuspicious}
              className="flex-1 sm:flex-initial px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
            >
              <span>🛡️</span>
              <span>تجاهل النشاط المشبوه ({selectedIds.size})</span>
            </button>

            {/* Clear Selection */}
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition-all"
            >
              إلغاء التحديد
            </button>
          </div>
        </div>
      )}

      {/* Filter Tabs, Search Bar & Sorting Dropdown */}
      <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          
          {/* Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {(
              [
                { id: "all", label: `الكل (${totalCount})` },
                { id: "known", label: `معروف (${knownCount})` },
                { id: "anonymous", label: `مجهول (${anonCount})` },
                { id: "registered", label: `مسجل (${registeredCount})` },
                { id: "blocked", label: `محظور (${blockedCount})` },
                { id: "suspicious", label: `نشاط مشبوه ⚠️ (${suspiciousCount})` },
              ] as { id: FilterTab; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? "bg-blue-600 text-white shadow-md"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-col sm:flex-row">
            {/* Sorting Engine Dropdown */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 whitespace-nowrap">الفرز حسب:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer w-full sm:w-auto"
              >
                <option value="latestActive">⚡ الأحدث تصفحاً (افتراضي)</option>
                <option value="latestCreated">🆕 الأحدث إنشاءً وتجسيداً</option>
                <option value="mostVisits">📊 الأكثر زيارات</option>
                <option value="priority">⚠️ الأولويات والمشبوه أولاً</option>
              </select>
            </div>

            {/* Search Bar */}
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالاسم، الهاتف، المحافظة..."
                className="w-full px-4 py-2 pr-9 border border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="absolute left-3 top-2 text-gray-400">🔍</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Customers Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : processedCustomers.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-12 border border-gray-200 dark:border-gray-800 text-center">
          <span className="text-5xl block mb-3">👻</span>
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">لا يوجد زوار أو زبائن يطابقون الفلترة</h3>
          <p className="text-xs text-gray-400 mt-1">سيظهر الزوار والضيوف تلقائياً هنا بمجرد تصفح الموقع</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
          {/* Desktop Table View */}
          <div className="hidden md:block">
            <DataTableWrapper>
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-xs font-extrabold text-gray-500 dark:text-gray-400 uppercase">
                    <th className="p-4 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.size > 0 && selectedIds.size === processedCustomers.length}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                      />
                    </th>
                    <th className="p-4">الزائر / الزبون</th>
                    <th className="p-4">الهاتف والمحافظة</th>
                    <th className="p-4 text-center">الجهاز والزيارات</th>
                    <th className="p-4">آخر ظهور والتصفح</th>
                    <th className="p-4 text-center">الإجراءات والتحكم</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {processedCustomers.map((c) => {
                    const isAnon = c.name.startsWith("مجهول");
                    const isSelected = selectedIds.has(c.id);
                    const statsKey = (c.phone || c.name || "").trim().toLowerCase();
                    const salesInfo = customerSalesStats.get(statsKey);

                    return (
                      <tr
                        key={c.id}
                        className={`hover:bg-gray-50/80 dark:hover:bg-gray-800/60 transition-colors ${
                          isSelected ? "bg-blue-50/50 dark:bg-blue-950/20" : ""
                        } ${c.isBlocked ? "opacity-60 bg-red-50/30 dark:bg-red-950/20" : ""} ${
                          c.isSuspicious ? "bg-amber-50/30 dark:bg-amber-950/20" : ""
                        }`}
                      >
                        <td className="p-4 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(c.id)}
                            className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                          />
                        </td>

                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white text-sm font-bold shadow-sm ${
                                c.isSuspicious
                                  ? "bg-red-600 animate-pulse"
                                  : isAnon
                                  ? "bg-gray-500 dark:bg-gray-700"
                                  : c.isRegistered
                                  ? "bg-gradient-to-br from-purple-600 to-indigo-600"
                                  : "bg-gradient-to-br from-emerald-600 to-blue-600"
                              }`}
                            >
                              {c.isSuspicious ? "⚠️" : isAnon ? "👤" : c.name.charAt(0)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={`font-extrabold text-sm ${
                                    c.isSuspicious
                                      ? "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/60 px-2 py-0.5 rounded-lg border border-red-200 dark:border-red-800"
                                      : "text-gray-900 dark:text-white"
                                  }`}
                                >
                                  {c.name}
                                </span>

                                {c.isSuspicious && (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500 text-white rounded-md text-[10px] font-bold shadow-sm cursor-help"
                                    title="قام هذا الزائر بتغيير بياناته أكثر من 3 مرات"
                                  >
                                    <span>⚠️</span>
                                    <span>نشاط مشبوه</span>
                                  </span>
                                )}

                                {c.isBlocked && (
                                  <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300 rounded-md text-[10px] font-bold">
                                    محظور 🚫
                                  </span>
                                )}
                                {c.isRegistered && (
                                  <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 rounded-md text-[10px] font-bold">
                                    مسجل 👑
                                  </span>
                                )}
                              </div>

                              <p className="text-[11px] font-mono text-gray-400 dark:text-gray-500 mt-0.5">
                                ID: {c.visitorId.slice(0, 16)}...
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="p-4">
                          <p className="text-xs font-bold text-gray-900 dark:text-gray-100" dir="ltr">
                            {c.phone || "بدون رقم"}
                          </p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                            {c.governorate || c.city || "غير محدد"}
                          </p>
                        </td>

                        <td className="p-4 text-center">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-bold">
                            <span>{c.deviceType === "هاتف" ? "📱" : c.deviceType === "تابلت" ? "📟" : "💻"}</span>
                            <span>{c.deviceType}</span>
                          </span>
                          <span className="block text-[11px] font-bold text-blue-600 dark:text-blue-400 mt-1">
                            {c.visitCount} زيارة
                          </span>
                        </td>

                        <td className="p-4">
                          <p className="text-xs font-bold text-gray-700 dark:text-gray-300">
                            {new Date(c.lastActiveAt).toLocaleString("ar-EG", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                          {salesInfo && (
                            <p className="text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                              🛒 {salesInfo.orderCount} طلب ({salesInfo.totalSpent.toLocaleString()} د.ع)
                            </p>
                          )}
                        </td>

                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Detail Button */}
                            <button
                              onClick={() => {
                                setSelectedCustomer(c);
                                setShowDetailModal(true);
                              }}
                              className="p-2 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-300 rounded-xl transition-colors text-xs font-bold"
                              title="معاينة تفاصيل الزيارات"
                            >
                              👁️
                            </button>

                            {/* Clear Suspicious Button (Single) */}
                            {c.isSuspicious && (
                              <button
                                onClick={() => handleClearSingleSuspicious(c)}
                                className="p-2 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300 rounded-xl transition-colors text-xs font-bold"
                                title="مسح وتجاهل النشاط المشبوه"
                              >
                                🛡️
                              </button>
                            )}

                            {/* Block / Unblock Button */}
                            <button
                              onClick={() => handleToggleBlock(c)}
                              className={`p-2 rounded-xl transition-colors text-xs font-bold ${
                                c.isBlocked
                                  ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-100"
                                  : "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 hover:bg-amber-100"
                              }`}
                              title={c.isBlocked ? "إلغاء حظر الزائر" : "حظر الزائر"}
                            >
                              {c.isBlocked ? "🔓" : "🚫"}
                            </button>

                            {/* Delete Button */}
                            <button
                              onClick={() => handleDeleteSingle(c)}
                              className="p-2 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-600 dark:text-red-300 rounded-xl transition-colors text-xs font-bold"
                              title="حذف السجل"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </DataTableWrapper>
          </div>

          {/* Mobile Cards List View */}
          <div className="block md:hidden space-y-3.5 p-3">
            {processedCustomers.map((c) => {
              const isAnon = c.name.startsWith("مجهول");
              const isSelected = selectedIds.has(c.id);
              const statsKey = (c.phone || c.name || "").trim().toLowerCase();
              const salesInfo = customerSalesStats.get(statsKey);

              return (
                <div
                  key={c.id}
                  className={`bg-white dark:bg-gray-900 rounded-2xl border ${
                    isSelected
                      ? "border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20 dark:bg-blue-950/20"
                      : "border-gray-200 dark:border-gray-800"
                  } ${c.isBlocked ? "opacity-75 bg-red-50/30 dark:bg-red-950/20" : ""} ${
                    c.isSuspicious ? "bg-amber-50/30 dark:bg-amber-950/20" : ""
                  } p-4 shadow-sm space-y-3 transition-all`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2 border-b border-gray-100 dark:border-gray-800 pb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectOne(c.id)}
                        className="w-5 h-5 rounded text-blue-600 cursor-pointer flex-shrink-0"
                      />
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white text-base font-bold shadow-sm flex-shrink-0 ${
                          c.isSuspicious
                            ? "bg-red-600 animate-pulse"
                            : isAnon
                            ? "bg-gray-500 dark:bg-gray-700"
                            : c.isRegistered
                            ? "bg-gradient-to-br from-purple-600 to-indigo-600"
                            : "bg-gradient-to-br from-emerald-600 to-blue-600"
                        }`}
                      >
                        {c.isSuspicious ? "⚠️" : isAnon ? "👤" : c.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-gray-900 dark:text-white text-sm truncate">
                          {c.name}
                        </h3>
                        <p className="text-[11px] font-mono text-gray-400 dark:text-gray-500 truncate">
                          ID: {c.visitorId.slice(0, 16)}...
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {c.isSuspicious && (
                        <span className="px-2 py-0.5 bg-amber-500 text-white rounded-md text-[10px] font-bold shadow-sm">
                          ⚠️ مشبوه
                        </span>
                      )}
                      {c.isBlocked && (
                        <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300 rounded-md text-[10px] font-bold">
                          محظور 🚫
                        </span>
                      )}
                      {c.isRegistered && (
                        <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 rounded-md text-[10px] font-bold">
                          مسجل 👑
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 dark:bg-gray-800/60 p-3 rounded-xl border border-gray-100 dark:border-gray-800/80">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400 block text-[11px] font-medium">الهاتف</span>
                      <span className="font-bold text-gray-900 dark:text-white font-mono block truncate" dir="ltr">
                        {c.phone || "بدون رقم"}
                      </span>
                    </div>

                    <div>
                      <span className="text-gray-500 dark:text-gray-400 block text-[11px] font-medium">المحافظة / المدينة</span>
                      <span className="font-semibold text-gray-800 dark:text-gray-200 truncate block">
                        {c.governorate || c.city || "غير محدد"}
                      </span>
                    </div>

                    <div>
                      <span className="text-gray-500 dark:text-gray-400 block text-[11px] font-medium">نوع الجهاز</span>
                      <span className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-1">
                        <span>{c.deviceType === "هاتف" ? "📱" : c.deviceType === "تابلت" ? "📟" : "💻"}</span>
                        <span>{c.deviceType}</span>
                      </span>
                    </div>

                    <div>
                      <span className="text-gray-500 dark:text-gray-400 block text-[11px] font-medium">عدد الزيارات</span>
                      <span className="font-bold text-blue-600 dark:text-blue-400">
                        {c.visitCount} زيارة
                      </span>
                    </div>

                    <div className="col-span-2 pt-1 border-t border-gray-200/60 dark:border-gray-700/60 flex items-center justify-between">
                      <span className="text-gray-500 dark:text-gray-400 text-[11px]">آخر ظهور:</span>
                      <span className="font-semibold text-gray-700 dark:text-gray-300">
                        {new Date(c.lastActiveAt).toLocaleString("ar-EG", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    {salesInfo && (
                      <div className="col-span-2 bg-emerald-50 dark:bg-emerald-900/20 p-2 rounded-lg text-emerald-700 dark:text-emerald-300 font-bold flex justify-between">
                        <span>🛒 الطلبات: {salesInfo.orderCount}</span>
                        <span>{salesInfo.totalSpent.toLocaleString()} د.ع</span>
                      </div>
                    )}
                  </div>

                  {/* Footer Actions */}
                  <div className="flex items-center gap-2 pt-1 border-t border-gray-100 dark:border-gray-800">
                    <button
                      onClick={() => {
                        setSelectedCustomer(c);
                        setShowDetailModal(true);
                      }}
                      className="flex-1 py-2 px-3 text-xs font-bold text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-xl border border-blue-200 dark:border-blue-800 flex items-center justify-center gap-1.5 transition-all min-h-[40px] whitespace-nowrap shrink-0"
                    >
                      <span>👁️</span>
                      <span className="whitespace-nowrap">التفاصيل</span>
                    </button>

                    {c.isSuspicious && (
                      <button
                        onClick={() => handleClearSingleSuspicious(c)}
                        className="py-2 px-3 text-xs font-bold text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 rounded-xl border border-emerald-200 flex items-center justify-center gap-1.5 transition-all min-h-[40px] whitespace-nowrap shrink-0"
                        title="تجاهل النشاط المشبوه"
                      >
                        <span>🛡️</span>
                        <span>تجاهل المشبوه</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleToggleBlock(c)}
                      className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl border flex items-center justify-center gap-1.5 transition-all min-h-[40px] whitespace-nowrap shrink-0 ${
                        c.isBlocked
                          ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                          : "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                      }`}
                    >
                      <span>{c.isBlocked ? "🔓" : "🚫"}</span>
                      <span className="whitespace-nowrap">{c.isBlocked ? "إلغاء الحظر" : "حظر"}</span>
                    </button>

                    <button
                      onClick={() => handleDeleteSingle(c)}
                      className="p-2 text-xs font-bold text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/60 rounded-xl border border-red-200 dark:border-red-800 flex items-center justify-center transition-all min-h-[40px] w-10 whitespace-nowrap shrink-0"
                      title="حذف السجل"
                    >
                      <span>🗑️</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Detail Analytics Modal */}
      {showDetailModal && selectedCustomer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowDetailModal(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-3xl max-w-lg w-full p-6 border border-gray-200 dark:border-gray-800 shadow-2xl space-y-5 text-right relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-extrabold text-xl flex items-center justify-center">
                  {selectedCustomer.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-extrabold text-lg text-gray-900 dark:text-white">
                    {selectedCustomer.name}
                  </h3>
                  <p className="text-xs text-gray-400 font-mono">Visitor ID: {selectedCustomer.visitorId}</p>
                </div>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>

            {/* Suspicious Warning Alert Banner & Ignore Action */}
            {selectedCustomer.isSuspicious && (
              <div className="p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-2xl space-y-2">
                <div className="flex items-start gap-2.5">
                  <span className="text-xl">⚠️</span>
                  <div>
                    <h4 className="text-xs font-extrabold text-red-700 dark:text-red-300">
                      تنبيه أمني: تغيير البيانات المتكرر!
                    </h4>
                    <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">
                      قام هذا الزائر بتغيير اسمه أو هاتفه أو عنوانه {selectedCustomer.changeCount || selectedCustomer.nameHistory.length} مرات عبر الجلسات المتتابعة.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    handleClearSingleSuspicious(selectedCustomer);
                    setShowDetailModal(false);
                  }}
                  className="w-full py-2 bg-emerald-600 text-white font-extrabold text-xs rounded-xl hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <span>🛡️</span>
                  <span>تجاهل النشاط المشبوه وإعادته لحساب اعتيادي</span>
                </button>
              </div>
            )}

            {/* Historical Data Changes List */}
            {(selectedCustomer.nameHistory.length > 0 || selectedCustomer.phoneHistory.length > 0 || selectedCustomer.addressHistory.length > 0) && (
              <div className="p-3 bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl space-y-2 text-right">
                <h4 className="text-xs font-extrabold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                  <span>📜</span>
                  <span>سجل التغيرات والبيانات المستعملة:</span>
                </h4>
                {selectedCustomer.nameHistory.length > 0 && (
                  <p className="text-xs text-gray-700 dark:text-gray-300">
                    <span className="font-bold text-amber-700 dark:text-amber-400">الأسماء المستعملة:</span> {selectedCustomer.nameHistory.join(" ، ")}
                  </p>
                )}
                {selectedCustomer.phoneHistory.length > 0 && (
                  <p className="text-xs text-gray-700 dark:text-gray-300" dir="ltr">
                    <span className="font-bold text-amber-700 dark:text-amber-400" dir="rtl">الهواتف:</span> {selectedCustomer.phoneHistory.join(" ، ")}
                  </p>
                )}
                {selectedCustomer.addressHistory.length > 0 && (
                  <p className="text-xs text-gray-700 dark:text-gray-300">
                    <span className="font-bold text-amber-700 dark:text-amber-400">العناوين:</span> {selectedCustomer.addressHistory.join(" ، ")}
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <span className="block text-[11px] text-gray-400 font-bold">نوع الجهاز</span>
                <span className="text-sm font-extrabold text-gray-900 dark:text-white mt-0.5 block">
                  {selectedCustomer.deviceType}
                </span>
              </div>

              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <span className="block text-[11px] text-gray-400 font-bold">عدد الزيارات</span>
                <span className="text-sm font-extrabold text-blue-600 dark:text-blue-400 mt-0.5 block">
                  {selectedCustomer.visitCount} مرة
                </span>
              </div>

              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <span className="block text-[11px] text-gray-400 font-bold">رقم الهاتف</span>
                <span className="text-sm font-extrabold text-gray-900 dark:text-white mt-0.5 block" dir="ltr">
                  {selectedCustomer.phone || "غير مسجل"}
                </span>
              </div>

              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <span className="block text-[11px] text-gray-400 font-bold">المحافظة / المدينة</span>
                <span className="text-sm font-extrabold text-gray-900 dark:text-white mt-0.5 block">
                  {selectedCustomer.governorate || selectedCustomer.city || "غير مسجل"}
                </span>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">الصفحات المزارة:</h4>
              <div className="flex flex-wrap gap-1.5">
                {selectedCustomer.visitedPages.length > 0 ? (
                  selectedCustomer.visitedPages.map((page: string, idx: number) => (
                    <span key={idx} className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-bold">
                      {page}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-gray-400">الصفحة الرئيسية</span>
                )}
              </div>
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                onClick={() => handleToggleBlock(selectedCustomer)}
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-colors ${
                  selectedCustomer.isBlocked
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "bg-amber-600 text-white hover:bg-amber-700"
                }`}
              >
                {selectedCustomer.isBlocked ? "🔓 إلغاء الحظر" : "🚫 حظر الزائر"}
              </button>

              <button
                onClick={() => handleDeleteSingle(selectedCustomer)}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs transition-colors"
              >
                🗑️ حذف البيانات
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

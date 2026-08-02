"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useData } from "@/lib/data-context";
import { useSettings } from "@/lib/settings-context";
import { useActivityLog } from "@/lib/activity-log";
import { supabase } from "@/lib/supabase-client";
import { Order, CartItem } from "@/lib/order-types";
import PermissionGate from "@/components/PermissionGate";
import jsPDF from "jspdf";

const STATUS_LABELS: Record<Order["status"], string> = {
  pending: "قيد الانتظار",
  confirmed: "مؤكد",
  shipped: "قيد الشحن",
  delivered: "مكتمل (تم التوصيل)",
  cancelled: "ملغي",
};

const STATUS_COLORS: Record<Order["status"], { bg: string; text: string; border: string }> = {
  pending: { bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-700 dark:text-amber-400", border: "border-amber-200 dark:border-amber-800" },
  confirmed: { bg: "bg-blue-50 dark:bg-blue-950/30", text: "text-blue-700 dark:text-blue-400", border: "border-blue-200 dark:border-blue-800" },
  shipped: { bg: "bg-purple-50 dark:bg-purple-950/30", text: "text-purple-700 dark:text-purple-400", border: "border-purple-200 dark:border-purple-800" },
  delivered: { bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-800" },
  cancelled: { bg: "bg-red-50 dark:bg-red-950/30", text: "text-red-700 dark:text-red-400", border: "border-red-200 dark:border-red-800" },
};

function formatPlatformBadge(notes?: string) {
  if (!notes) return { label: "متجر مباشر", icon: "🏬" };
  if (notes.includes("واتساب")) return { label: "واتساب", icon: "💬" };
  if (notes.includes("تليجرام")) return { label: "تليجرام", icon: "✈️" };
  if (notes.includes("ماسنجر")) return { label: "ماسنجر", icon: "⚡" };
  if (notes.includes("اتصال")) return { label: "اتصال مباشر", icon: "📞" };
  return { label: "متجر مباشر", icon: "🏬" };
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}

export default function OrdersPage() {
  const { products } = useData();
  const { settings } = useSettings();
  const { logActivity } = useActivityLog();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Edit Invoice Modal Draft State
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editCustomerPhone, setEditCustomerPhone] = useState("");
  const [editCustomerAddress, setEditCustomerAddress] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState<Order["status"]>("pending");
  const [editItems, setEditItems] = useState<CartItem[]>([]);
  const [editDeliveryFee, setEditDeliveryFee] = useState<number>(5000);
  const [editDeliveryDuration, setEditDeliveryDuration] = useState<string>("2 - 3 أيام عمل");
  const [addingProductId, setAddingProductId] = useState("");
  const [savingOrder, setSavingOrder] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load Orders from Supabase
  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
      if (error) {
        console.error("Fetch orders error:", error.message);
        return;
      }
      if (data) {
        const mapped: Order[] = data.map((r) => ({
          id: r.id,
          customerName: r.customer_name || "زبون",
          customerPhone: r.customer_phone || "",
          customerAddress: r.customer_address || "",
          items: (r.items as CartItem[]) || [],
          total: Number(r.total) || 0,
          deliveryFee: Number(r.delivery_fee) || 0,
          deliveryDuration: r.delivery_duration || "",
          status: (r.status as Order["status"]) || "pending",
          notes: r.notes || "",
          createdAt: r.created_at || new Date().toISOString(),
        }));
        setOrders(mapped);
      }
    } catch (err) {
      console.error("Load orders exception:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();

    const channel = supabase
      .channel("public:orders_page")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        loadOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadOrders]);

  // Subtotal & Grand Total Calculation
  const productsSubtotal = useMemo(() => {
    return editItems.reduce((acc, item) => acc + item.retailPrice * item.quantity, 0);
  }, [editItems]);

  const grandTotal = useMemo(() => {
    return productsSubtotal + (Number(editDeliveryFee) || 0);
  }, [productsSubtotal, editDeliveryFee]);

  // Open Invoice Modal
  const openInvoiceModal = (order: Order) => {
    setSelectedOrder(order);
    setEditingOrder(order);
    setEditCustomerName(order.customerName);
    setEditCustomerPhone(order.customerPhone);
    setEditCustomerAddress(order.customerAddress);
    setEditNotes(order.notes);
    setEditStatus(order.status);
    setEditItems(JSON.parse(JSON.stringify(order.items)));
    setEditDeliveryFee(order.deliveryFee ?? settings.defaultDeliveryFee ?? 5000);
    setEditDeliveryDuration(order.deliveryDuration || settings.defaultDeliveryDuration || "2 - 3 أيام عمل");
    setSaveSuccess(false);
  };

  // Close Modal
  const closeModal = () => {
    setSelectedOrder(null);
    setEditingOrder(null);
  };

  // Save Order Changes to Supabase
  const handleSaveInvoice = async () => {
    if (!editingOrder) return;
    setSavingOrder(true);
    setSaveSuccess(false);

    try {
      const finalFee = Number(editDeliveryFee) || 0;
      const finalTotal = productsSubtotal + finalFee;

      const { error } = await supabase
        .from("orders")
        .update({
          customer_name: editCustomerName.trim(),
          customer_phone: editCustomerPhone.trim(),
          customer_address: editCustomerAddress.trim(),
          items: editItems,
          total: finalTotal,
          delivery_fee: finalFee,
          delivery_duration: editDeliveryDuration.trim(),
          status: editStatus,
          notes: editNotes.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingOrder.id);

      if (error) throw error;

      setSaveSuccess(true);
      await logActivity({
        user: "manager",
        action: "update",
        entity: "فاتورة طلب",
        entityId: editingOrder.id,
        details: `تحديث الفاتورة للزبون ${editCustomerName} - التوصيل: ${finalFee.toLocaleString()} د.ع - الإجمالي: ${finalTotal.toLocaleString()} د.ع`,
      });

      await loadOrders();
    } catch (err) {
      console.error("Save invoice error:", err);
      alert("حدث خطأ أثناء حفظ الفاتورة في قاعدة البيانات.");
    } finally {
      setSavingOrder(false);
    }
  };

  // Delete Order
  const handleDeleteOrder = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("هل أنت تأكد من رغبتك في حذف هذا الطلب نهائياً؟")) return;
    try {
      await supabase.from("orders").delete().eq("id", id);
      setOrders((prev) => prev.filter((o) => o.id !== id));
      if (selectedOrder?.id === id) closeModal();
      await logActivity({
        user: "manager",
        action: "delete",
        entity: "طلب",
        entityId: id,
        details: `حذف الطلب رقم ${id}`,
      });
    } catch (err) {
      console.error("Delete order error:", err);
    }
  };

  // Add Product to Invoice
  const handleAddProductToInvoice = () => {
    if (!addingProductId) return;
    const prod = products.find((p) => p.id === addingProductId);
    if (!prod) return;

    setEditItems((prev) => {
      const existing = prev.find((item) => item.productId === prod.id);
      if (existing) {
        return prev.map((item) =>
          item.productId === prod.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      } else {
        return [
          ...prev,
          {
            productId: prod.id,
            name: prod.name,
            image: prod.image || "",
            retailPrice: prod.retailPrice,
            quantity: 1,
          },
        ];
      }
    });

    setAddingProductId("");
  };

  // Print Invoice Window
  const printInvoiceWindow = () => {
    if (!editingOrder) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const dateStr = new Date(editingOrder.createdAt).toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    const rowsHtml = editItems
      .map(
        (item, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${item.name}</td>
          <td>${item.retailPrice.toLocaleString()} د.ع</td>
          <td>${item.quantity}</td>
          <td><strong>${(item.retailPrice * item.quantity).toLocaleString()} د.ع</strong></td>
        </tr>`
      )
      .join("");

    printWindow.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>فاتورة طلب - ${editCustomerName}</title>
  <style>
    body { font-family: 'Cairo', Arial, sans-serif; padding: 20px; background: #fff; color: #111; }
    .header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 15px; margin-bottom: 20px; }
    .header h1 { margin: 0; color: #2563eb; font-size: 22px; }
    .info { display: flex; justify-content: space-between; margin-bottom: 20px; background: #f8fafc; padding: 12px; border-radius: 8px; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: right; font-size: 13px; }
    th { background: #f1f5f9; }
    .summary-box { background: #f8fafc; border-radius: 8px; padding: 12px; margin-top: 15px; text-align: left; }
    .summary-line { font-size: 13px; margin: 4px 0; color: #475569; }
    .total-line { font-size: 18px; font-weight: bold; color: #2563eb; border-top: 2px solid #2563eb; padding-top: 8px; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${settings.siteName || "موقع أحمد بحري"} - فاتورة مبيعات</h1>
    <p>تاريخ الطلب: ${dateStr}</p>
  </div>
  <div class="info">
    <div><strong>الزبون:</strong> ${editCustomerName}<br/><strong>الهاتف:</strong> ${editCustomerPhone}</div>
    <div><strong>العنوان:</strong> ${editCustomerAddress}<br/><strong>مدة التوصيل:</strong> ${editDeliveryDuration || "افتراضية"}</div>
  </div>
  <table>
    <thead><tr><th>#</th><th>المنتج</th><th>السعر</th><th>الكمية</th><th>المجموع</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="summary-box">
    <div class="summary-line">مجموع المنتجات: ${productsSubtotal.toLocaleString()} د.ع</div>
    <div class="summary-line">تكلفة التوصيل والشحن: ${editDeliveryFee.toLocaleString()} د.ع</div>
    <div class="total-line">الإجمالي النهائي الكلي: ${grandTotal.toLocaleString()} د.ع</div>
  </div>
  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`);
    printWindow.document.close();
  };

  // Generate PDF
  const generatePDF = () => {
    if (!editingOrder) return;
    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFont("helvetica", "bold");

    doc.setFontSize(16);
    doc.text(settings.siteName || "Ahmed Bahri Store", pageWidth / 2, 20, { align: "center" });

    doc.setFontSize(12);
    doc.text(`Customer: ${editCustomerName}`, 15, 35);
    doc.text(`Phone: ${editCustomerPhone}`, 15, 42);
    doc.text(`Address: ${editCustomerAddress}`, 15, 49);
    doc.text(`Delivery Time: ${editDeliveryDuration || "Default"}`, 15, 56);

    let y = 68;
    doc.setFontSize(10);
    editItems.forEach((item, i) => {
      doc.text(`${i + 1}. ${item.name} x${item.quantity} = ${(item.retailPrice * item.quantity).toLocaleString()} IQD`, 15, y);
      y += 8;
    });

    y += 5;
    doc.text(`Products Subtotal: ${productsSubtotal.toLocaleString()} IQD`, 15, y);
    doc.text(`Shipping & Delivery: ${editDeliveryFee.toLocaleString()} IQD`, 15, y + 7);
    doc.setFontSize(13);
    doc.text(`Grand Total: ${grandTotal.toLocaleString()} IQD`, 15, y + 16);
    doc.save(`invoice-${editCustomerName}.pdf`);
  };

  // Share Invoice to Customer WhatsApp
  const shareToWhatsApp = () => {
    if (!editCustomerPhone) return;
    let msg = `📋 *فاتورة طلبك من متجر ${settings.siteName}*\n`;
    msg += `-------------------------------\n`;
    msg += `👤 *الزبون:* ${editCustomerName}\n`;
    msg += `📍 *العنوان:* ${editCustomerAddress}\n`;
    msg += `🚚 *مدة التوصيل المتوقعة:* ${editDeliveryDuration || "خلال أيام عمل"}\n`;
    msg += `📊 *حالة الطلب:* ${STATUS_LABELS[editStatus]}\n\n`;
    msg += `🛍️ *المنتجات:*\n`;
    editItems.forEach((it, idx) => {
      msg += `${idx + 1}. ${it.name} × ${it.quantity} = ${(it.retailPrice * it.quantity).toLocaleString()} د.ع\n`;
    });
    msg += `-------------------------------\n`;
    msg += `📦 *مجموع المنتجات:* ${productsSubtotal.toLocaleString()} د.ع\n`;
    msg += `🚚 *تكلفة التوصيل:* ${editDeliveryFee.toLocaleString()} د.ع\n`;
    msg += `💰 *الإجمالي النهائي الكلي:* ${grandTotal.toLocaleString()} د.ع\n`;
    msg += `-------------------------------\n`;
    msg += `شكراً لتسوقكم معنا! 🌹`;

    const cleanNum = editCustomerPhone.replace(/\D/g, "");
    window.open(`https://api.whatsapp.com/send?phone=${cleanNum}&text=${encodeURIComponent(msg)}`, "_blank");
  };

  // Filtered Orders List
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchStatus = statusFilter === "all" || o.status === statusFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.includes(q) ||
        o.customerAddress.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [orders, statusFilter, searchQuery]);

  // Analytics Stats Summary
  const stats = useMemo(() => {
    const totalCount = orders.length;
    const pendingCount = orders.filter((o) => o.status === "pending").length;
    const completedCount = orders.filter((o) => o.status === "delivered" || o.status === "confirmed").length;
    const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
    return { totalCount, pendingCount, completedCount, totalRevenue };
  }, [orders]);

  return (
    <PermissionGate permission="orders.view">
      <div className="space-y-6" dir="rtl">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <span>🛒</span>
              <span>إدارة الطلبات والجريدة اليومية</span>
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
              متابعة جميع طلبات الزبائن الواردة وتعديل الفواتير والتوصيل وإرسالها مباشرة
            </p>
          </div>

          <button
            onClick={loadOrders}
            className="px-4 py-2.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl font-bold text-xs hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors flex items-center gap-2 w-fit border border-blue-200 dark:border-blue-800"
          >
            <span>🔄 تحديث البيانات</span>
          </button>
        </div>

        {/* Analytics Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-200 dark:border-gray-800 shadow-sm">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>إجمالي الطلبات</span>
              <span className="text-xl">📊</span>
            </div>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{stats.totalCount}</p>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-amber-200 dark:border-amber-800/60 bg-amber-50/20 shadow-sm">
            <div className="flex items-center justify-between text-xs text-amber-600 dark:text-amber-400 mb-1">
              <span>طلب قيد الانتظار</span>
              <span className="text-xl">⚠️</span>
            </div>
            <p className="text-2xl font-extrabold text-amber-600 dark:text-amber-400">{stats.pendingCount}</p>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/20 shadow-sm">
            <div className="flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400 mb-1">
              <span>طلبات مكتملة / مؤكدة</span>
              <span className="text-xl">✅</span>
            </div>
            <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">{stats.completedCount}</p>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-blue-200 dark:border-blue-800/60 bg-blue-50/20 shadow-sm">
            <div className="flex items-center justify-between text-xs text-blue-600 dark:text-blue-400 mb-1">
              <span>قيمة الطلبات الكلية</span>
              <span className="text-xl">💰</span>
            </div>
            <p className="text-xl font-extrabold text-blue-600 dark:text-blue-400 truncate">
              {stats.totalRevenue.toLocaleString()} د.ع
            </p>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-200 dark:border-gray-800 shadow-sm space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <span className="absolute right-3.5 top-2.5 text-gray-400 text-base">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث باسم الزبون، رقم الهاتف، العنوان، أو رقم الطلب..."
                className="w-full pr-10 pl-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
              />
            </div>

            {/* Status Filter Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1">
              <button
                onClick={() => setStatusFilter("all")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  statusFilter === "all"
                    ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-sm"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200"
                }`}
              >
                الكل ({orders.length})
              </button>

              {(["pending", "confirmed", "shipped", "delivered", "cancelled"] as Order["status"][]).map((st) => {
                const count = orders.filter((o) => o.status === st).length;
                return (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      statusFilter === st
                        ? `${STATUS_COLORS[st].bg} ${STATUS_COLORS[st].text} border ${STATUS_COLORS[st].border} shadow-sm`
                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200"
                    }`}
                  >
                    {STATUS_LABELS[st]} ({count})
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Orders Grid / List */}
        {loading ? (
          <div className="p-16 text-center text-gray-400 animate-pulse">
            <span className="text-4xl block mb-2">🔄</span>
            <p>جاري تحميل قائمة الطلبات من قاعدة البيانات...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-16 text-center text-gray-400 space-y-3">
            <span className="text-5xl block">🛒</span>
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">لا توجد طلبات تطابق هذا البحث</h3>
            <p className="text-xs">عند إتمام الزبائن لعمليات الشراء، ستظهر طلباتهم وفواتيرهم هنا فوراً</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOrders.map((order) => {
              const platform = formatPlatformBadge(order.notes);
              const statusStyle = STATUS_COLORS[order.status];

              return (
                <div
                  key={order.id}
                  onClick={() => openInvoiceModal(order)}
                  className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 hover:shadow-xl transition-all cursor-pointer flex flex-col justify-between space-y-4 group relative overflow-hidden"
                >
                  <div className="space-y-3">
                    {/* Header: Platform & Status */}
                    <div className="flex items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-800 pb-3">
                      <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 py-1 px-2.5 rounded-lg text-xs font-bold text-gray-700 dark:text-gray-300">
                        <span>{platform.icon}</span>
                        <span>{platform.label}</span>
                      </div>

                      <span
                        className={`px-2.5 py-1 rounded-lg text-xs font-extrabold border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
                      >
                        {STATUS_LABELS[order.status]}
                      </span>
                    </div>

                    {/* Customer Info */}
                    <div className="space-y-1">
                      <h3 className="font-bold text-gray-900 dark:text-white text-base group-hover:text-blue-600 transition-colors flex items-center gap-2">
                        <span>👤</span>
                        <span>{order.customerName}</span>
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                        <span>📞</span>
                        <span dir="ltr" className="font-mono">{order.customerPhone}</span>
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                        <span>📍</span>
                        <span className="truncate">{order.customerAddress}</span>
                      </p>
                      {order.deliveryDuration && (
                        <p className="text-[11px] text-blue-600 dark:text-blue-400 font-bold flex items-center gap-1">
                          <span>🚚</span>
                          <span>التوصيل: {order.deliveryDuration} ({order.deliveryFee ? `${order.deliveryFee.toLocaleString()} د.ع` : "مجاني"})</span>
                        </p>
                      )}
                    </div>

                    {/* Products Summary */}
                    <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-3 space-y-1 text-xs">
                      <p className="font-bold text-gray-700 dark:text-gray-300 mb-1">📦 المنتجات ({order.items.length}):</p>
                      {order.items.slice(0, 3).map((item, idx) => (
                        <div key={idx} className="flex justify-between text-gray-600 dark:text-gray-400">
                          <span className="truncate max-w-[180px]">• {item.name}</span>
                          <span className="font-semibold">x{item.quantity}</span>
                        </div>
                      ))}
                      {order.items.length > 3 && (
                        <p className="text-[10px] text-blue-500 font-bold pt-0.5">+ {order.items.length - 3} منتجات أخرى...</p>
                      )}
                    </div>
                  </div>

                  {/* Footer: Date & Total */}
                  <div className="border-t border-gray-100 dark:border-gray-800 pt-3 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-gray-400">{timeAgo(order.createdAt)}</p>
                      <p className="text-base font-extrabold text-blue-600 dark:text-blue-400">
                        {order.total.toLocaleString()} د.ع
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => handleDeleteOrder(order.id, e)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors text-xs"
                        title="حذف الطلب"
                      >
                        🗑️
                      </button>
                      <span className="px-3 py-1.5 bg-blue-600 text-white rounded-lg font-bold text-xs shadow-sm group-hover:bg-blue-700 transition-colors">
                        👁️ التفاصيل
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ================= Editable Invoice Modal (نافذة تفاصيل وتعديل الفاتورة والتوصيل) ================= */}
        {editingOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn" dir="rtl">
            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden text-right">
              {/* Modal Header */}
              <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50/80 dark:bg-gray-800/80">
                <div className="flex items-center gap-3">
                  <span className="text-3xl p-2.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 rounded-2xl shadow-inner">📄</span>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <span>فاتورة طلب رقم:</span>
                      <span className="font-mono text-sm text-blue-600 dark:text-blue-400">#{editingOrder.id.substring(0, 8)}</span>
                    </h2>
                    <p className="text-xs text-gray-500">
                      تم إنشاء الطلب بتاريخ: {new Date(editingOrder.createdAt).toLocaleString("ar-EG")}
                    </p>
                  </div>
                </div>

                <button
                  onClick={closeModal}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors text-lg"
                >
                  ✕
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {saveSuccess && (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-bold flex items-center gap-2 animate-fadeIn">
                    <span>✅</span>
                    <span>تم حفظ كافة تعديلات الفاتورة والتوصيل وتحديث قاعدة البيانات بنجاح!</span>
                  </div>
                )}

                {/* Section 1: Customer Details & Order Status */}
                <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-4">
                  <h3 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                    <span>👤</span>
                    <span>بيانات الزبون وحالة الطلب:</span>
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 block mb-1">اسم الزبون</label>
                      <input
                        type="text"
                        value={editCustomerName}
                        onChange={(e) => setEditCustomerName(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 block mb-1">رقم الهاتف</label>
                      <input
                        type="text"
                        value={editCustomerPhone}
                        onChange={(e) => setEditCustomerPhone(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 block mb-1">حالة الطلب</label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as Order["status"])}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl text-xs font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        <option value="pending">⚠️ قيد الانتظار</option>
                        <option value="confirmed">✓ مؤكد</option>
                        <option value="shipped">🚚 قيد الشحن</option>
                        <option value="delivered">✅ مكتمل (تم التوصيل)</option>
                        <option value="cancelled">❌ ملغي</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 block mb-1">المحافظة والعنوان الكامل</label>
                    <input
                      type="text"
                      value={editCustomerAddress}
                      onChange={(e) => setEditCustomerAddress(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>

                {/* Section 2: Delivery & Shipping Settings for this Order */}
                <div className="bg-blue-50/50 dark:bg-blue-950/30 p-4 rounded-2xl border border-blue-200 dark:border-blue-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-blue-900 dark:text-blue-200 text-sm flex items-center gap-2">
                      <span>🚚</span>
                      <span>إضافة / تعديل التوصيل والشحن لهذه الفاتورة:</span>
                    </h3>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setEditDeliveryFee(0)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                          editDeliveryFee === 0
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        توصيل مجاني (0 د.ع)
                      </button>

                      <button
                        onClick={() => setEditDeliveryFee(settings.defaultDeliveryFee ?? 5000)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                          editDeliveryFee === (settings.defaultDeliveryFee ?? 5000)
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        افتراضي ({settings.defaultDeliveryFee?.toLocaleString() ?? "5,000"} د.ع)
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1">
                        تكلفة التوصيل (د.ع)
                      </label>
                      <input
                        type="number"
                        value={editDeliveryFee}
                        onChange={(e) => setEditDeliveryFee(Number(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl text-xs font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="5000"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1">
                        مدة التوصيل المتوقعة
                      </label>
                      <input
                        type="text"
                        value={editDeliveryDuration}
                        onChange={(e) => setEditDeliveryDuration(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl text-xs font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="مثال: توصيل سريع / خلال 24 ساعة"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 3: Products Table & Item Controls */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                      <span>📦</span>
                      <span>جدول المنتجات في الفاتورة:</span>
                    </h3>

                    {/* Add Product Dropdown */}
                    <div className="flex items-center gap-2">
                      <select
                        value={addingProductId}
                        onChange={(e) => setAddingProductId(e.target.value)}
                        className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-xs text-gray-900 dark:text-white outline-none max-w-[200px]"
                      >
                        <option value="">+ اختر منتجاً لإضافته للفاتورة...</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.retailPrice.toLocaleString()} د.ع)
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={handleAddProductToInvoice}
                        disabled={!addingProductId}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 disabled:opacity-40 transition-all shadow-sm"
                      >
                        إضافة
                      </button>
                    </div>
                  </div>

                  <div className="border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden bg-white dark:bg-gray-900">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className="p-3">#</th>
                          <th className="p-3">المنتج</th>
                          <th className="p-3 text-center">السعر الفردي</th>
                          <th className="p-3 text-center">الكمية</th>
                          <th className="p-3 text-left">الإجمالي</th>
                          <th className="p-3 text-center">إجراء</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {editItems.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-6 text-center text-gray-400">
                              لا توجد منتجات في الفاتورة
                            </td>
                          </tr>
                        ) : (
                          editItems.map((item, idx) => (
                            <tr key={idx} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                              <td className="p-3 text-gray-400 font-bold">{idx + 1}</td>
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  {item.image ? (
                                    <img src={item.image} alt="" className="w-8 h-8 rounded-lg object-cover" />
                                  ) : (
                                    <span className="text-base">📦</span>
                                  )}
                                  <span className="font-semibold text-gray-900 dark:text-white max-w-[200px] truncate">{item.name}</span>
                                </div>
                              </td>

                              <td className="p-3 text-center">
                                <input
                                  type="number"
                                  value={item.retailPrice}
                                  onChange={(e) => {
                                    const val = Number(e.target.value) || 0;
                                    setEditItems((prev) =>
                                      prev.map((it, i) => (i === idx ? { ...it, retailPrice: val } : it))
                                    );
                                  }}
                                  className="w-24 px-2 py-1 text-center bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-bold text-gray-900 dark:text-white"
                                />
                              </td>

                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => {
                                      if (item.quantity > 1) {
                                        setEditItems((prev) =>
                                          prev.map((it, i) => (i === idx ? { ...it, quantity: it.quantity - 1 } : it))
                                        );
                                      }
                                    }}
                                    className="w-6 h-6 rounded bg-gray-200 dark:bg-gray-700 font-bold text-xs"
                                  >
                                    -
                                  </button>
                                  <span className="w-8 text-center font-extrabold text-gray-900 dark:text-white">{item.quantity}</span>
                                  <button
                                    onClick={() => {
                                      setEditItems((prev) =>
                                        prev.map((it, i) => (i === idx ? { ...it, quantity: it.quantity + 1 } : it))
                                      );
                                    }}
                                    className="w-6 h-6 rounded bg-blue-600 text-white font-bold text-xs"
                                  >
                                    +
                                  </button>
                                </div>
                              </td>

                              <td className="p-3 text-left font-bold text-blue-600 dark:text-blue-400">
                                {(item.retailPrice * item.quantity).toLocaleString()} د.ع
                              </td>

                              <td className="p-3 text-center">
                                <button
                                  onClick={() => setEditItems((prev) => prev.filter((_, i) => i !== idx))}
                                  className="text-red-400 hover:text-red-600 text-xs p-1"
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Section 4: Breakdown Summary Total */}
                <div className="bg-gray-50 dark:bg-gray-800/80 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-2 text-xs">
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>مجموع المنتجات:</span>
                    <span className="font-bold text-gray-900 dark:text-white">{productsSubtotal.toLocaleString()} د.ع</span>
                  </div>

                  <div className="flex justify-between text-blue-600 dark:text-blue-400 font-semibold">
                    <span>تكلفة التوصيل للشحن ({editDeliveryDuration || "بدون مدة"}):</span>
                    <span>{editDeliveryFee ? `${editDeliveryFee.toLocaleString()} د.ع` : "مجاني (0 د.ع)"}</span>
                  </div>

                  <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex items-center justify-between text-sm font-extrabold text-gray-900 dark:text-white">
                    <span>الإجمالي النهائـي الكلي للفاتورة:</span>
                    <span className="text-2xl font-black text-blue-600 dark:text-blue-400">
                      {grandTotal.toLocaleString()} د.ع
                    </span>
                  </div>
                </div>
              </div>

              {/* Modal Footer Controls */}
              <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/80 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={printInvoiceWindow}
                    className="px-3.5 py-2 bg-gray-700 text-white rounded-xl font-bold text-xs hover:bg-gray-800 transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    <span>🖨️</span>
                    <span>طباعة</span>
                  </button>

                  <button
                    onClick={generatePDF}
                    className="px-3.5 py-2 bg-gray-700 text-white rounded-xl font-bold text-xs hover:bg-gray-800 transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    <span>📄</span>
                    <span>تحميل PDF</span>
                  </button>

                  <button
                    onClick={shareToWhatsApp}
                    className="px-3.5 py-2 bg-[#25D366] text-white rounded-xl font-bold text-xs hover:bg-[#20BD5A] transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    <span>💬</span>
                    <span>إرسال للواتساب</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-xs hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    إغلاق
                  </button>

                  <button
                    onClick={handleSaveInvoice}
                    disabled={savingOrder}
                    className="px-6 py-2 bg-emerald-600 text-white rounded-xl font-extrabold text-xs hover:bg-emerald-700 shadow-md transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {savingOrder ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>جاري الحفظ...</span>
                      </>
                    ) : (
                      <>
                        <span>💾 حفظ التعديلات وقاعدة البيانات</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PermissionGate>
  );
}

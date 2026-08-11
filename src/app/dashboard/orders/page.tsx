"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useData } from "@/lib/data-context";
import { useSettings } from "@/lib/settings-context";
import { useActivityLog } from "@/lib/activity-log";
import { supabase } from "@/lib/supabase-client";
import { Order, CartItem, formatInvoiceSerial } from "@/lib/order-types";
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
          serialNumber: r.serial_number ? Number(r.serial_number) : undefined,
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
      const serialStr = formatInvoiceSerial(editingOrder);

      const updateData: Record<string, unknown> = {
        customer_name: editCustomerName.trim(),
        customer_phone: editCustomerPhone.trim(),
        customer_address: editCustomerAddress.trim(),
        items: editItems,
        total: finalTotal,
        delivery_fee: finalFee,
        delivery_duration: editDeliveryDuration.trim(),
        delivery_time: editDeliveryDuration.trim(),
        invoice_serial: serialStr,
        status: editStatus,
        notes: editNotes.trim(),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("orders")
        .update(updateData)
        .eq("id", editingOrder.id);

      if (error) {
        console.error("Supabase direct update invoice error:", error);
        // Fallback to API route /api/orders/[id]
        const apiRes = await fetch(`/api/orders/${editingOrder.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updateData),
        });
        if (!apiRes.ok) {
          const errBody = await apiRes.json();
          console.error("API route update invoice error:", errBody);
          throw new Error(errBody.error || error.message || "خطأ أثناء تحديث الفاتورة");
        }
      }

      setSaveSuccess(true);
      await logActivity({
        user: "manager",
        action: "update",
        entity: "فاتورة طلب",
        entityId: editingOrder.id,
        details: `تحديث الفاتورة ${serialStr} للزبون ${editCustomerName} - التوصيل: ${finalFee.toLocaleString()} د.ع - الإجمالي: ${finalTotal.toLocaleString()} د.ع`,
      });

      await loadOrders();
    } catch (err: unknown) {
      console.error("Save invoice exception caught:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      alert(`حدث خطأ أثناء حفظ الفاتورة في قاعدة البيانات: ${errMsg}`);
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
            appliedTierPrice: prod.retailPrice,
            appliedTierLabel: "مفرد",
          },
        ];
      }
    });

    setAddingProductId("");
  };

  // Print Official Invoice Window with Watermark & Logo Layout
  const printInvoiceWindow = () => {
    if (!editingOrder) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const dateStr = new Date(editingOrder.createdAt).toLocaleString("ar-EG", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const serialStr = formatInvoiceSerial(editingOrder);
    const logoUrl = settings.logo || "/logo.jpg";

    const rowsHtml = editItems
      .map(
        (item, i) => `
        <tr>
          <td style="text-align:center; font-weight:bold;">${i + 1}</td>
          <td style="text-align:center;">
            ${item.image ? `<img src="${item.image}" style="width:36px; height:36px; object-fit:cover; border-radius:6px;" />` : "📦"}
          </td>
          <td><strong>${item.name}</strong></td>
          <td style="text-align:center;">${item.retailPrice.toLocaleString()} د.ع</td>
          <td style="text-align:center;">${item.quantity}</td>
          <td style="text-align:left; font-weight:bold; color:#2563eb;">${(item.retailPrice * item.quantity).toLocaleString()} د.ع</td>
        </tr>`
      )
      .join("");

    printWindow.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>فاتورة رسمية - ${serialStr}</title>
  <style>
    body { font-family: 'Cairo', Arial, sans-serif; padding: 24px; background: #fff; color: #0f172a; position: relative; }
    
    /* Watermark Background Logo */
    .watermark {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 320px;
      height: 320px;
      opacity: 0.08;
      pointer-events: none;
      z-index: 0;
    }
    
    .invoice-container { position: relative; z-index: 1; }

    /* Header Layout: Logo Right | Serial & Date Left */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid #2563eb;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .header-brand { display: flex; items-center: center; gap: 12px; }
    .header-logo { width: 64px; height: 64px; border-radius: 12px; object-fit: cover; }
    .header-title h1 { margin: 0; font-size: 20px; color: #2563eb; font-weight: 800; }
    .header-title p { margin: 2px 0 0 0; font-size: 12px; color: #64748b; }
    
    .header-meta { text-align: left; }
    .serial-badge { font-family: monospace; font-size: 16px; font-weight: bold; background: #eff6ff; color: #1d4ed8; padding: 6px 12px; border-radius: 8px; border: 1px solid #bfdbfe; display: inline-block; }
    .date-text { font-size: 11px; color: #64748b; margin-top: 4px; }

    .customer-box {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      background: #f8fafc;
      padding: 14px 18px;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      margin-bottom: 20px;
      font-size: 13px;
    }

    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
    th, td { border: 1px solid #cbd5e1; padding: 10px 12px; text-align: right; }
    th { background: #f1f5f9; color: #334155; font-weight: bold; }
    
    .summary-box {
      background: #f8fafc;
      border-radius: 12px;
      padding: 16px;
      border: 1px solid #e2e8f0;
      width: 280px;
      margin-right: auto;
      font-size: 13px;
    }
    .summary-line { display: flex; justify-content: space-between; margin-bottom: 6px; color: #475569; }
    .grand-total { display: flex; justify-content: space-between; font-size: 17px; font-weight: 900; color: #2563eb; border-top: 2px solid #2563eb; padding-top: 10px; margin-top: 10px; }
    
    .footer-note { text-align: center; margin-top: 30px; font-size: 12px; color: #94a3b8; border-top: 1px dashed #cbd5e1; padding-top: 12px; }
  </style>
</head>
<body>
  <!-- Centered Watermark Logo -->
  <img src="${logoUrl}" class="watermark" alt="" />

  <div class="invoice-container">
    <!-- Header Layout -->
    <div class="header">
      <div class="header-brand">
        <img src="${logoUrl}" class="header-logo" alt="Logo" />
        <div class="header-title">
          <h1>${settings.siteName || "موقع أحمد بحري"}</h1>
          <p>فاتورة مبيعات رسمية وموثقة</p>
        </div>
      </div>
      <div class="header-meta">
        <div class="serial-badge">${serialStr}</div>
        <div class="date-text">تاريخ الإصدار: ${dateStr}</div>
      </div>
    </div>

    <!-- Customer & Order Info -->
    <div class="customer-box">
      <div>
        <strong>👤 اسم الزبون:</strong> ${editCustomerName}<br/>
        <strong>📞 رقم الهاتف:</strong> <span dir="ltr">${editCustomerPhone}</span>
      </div>
      <div>
        <strong>📍 المحافظة والعنوان:</strong> ${editCustomerAddress}<br/>
        <strong>🚚 مدة التوصيل المتوقعة:</strong> ${editDeliveryDuration || "حسب المحافظة"}
      </div>
    </div>

    <!-- Products Table -->
    <table>
      <thead>
        <tr>
          <th style="width: 40px; text-align:center;">رقم</th>
          <th style="width: 50px; text-align:center;">الصورة</th>
          <th>اسم المنتج</th>
          <th style="width: 110px; text-align:center;">السعر الفردي</th>
          <th style="width: 60px; text-align:center;">الكمية</th>
          <th style="width: 120px; text-align:left;">الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <!-- Breakdown Summary -->
    <div class="summary-box">
      <div class="summary-line">
        <span>مجموع المنتجات:</span>
        <span><strong>${productsSubtotal.toLocaleString()} د.ع</strong></span>
      </div>
      <div class="summary-line">
        <span>التوصيل والشحن (${editDeliveryDuration || "افتراضي"}):</span>
        <span>${editDeliveryFee ? `${editDeliveryFee.toLocaleString()} د.ع` : "مجاني"}</span>
      </div>
      <div class="grand-total">
        <span>الإجمالي الكلي:</span>
        <span>${grandTotal.toLocaleString()} د.ع</span>
      </div>
    </div>

    <div class="footer-note">
      شكراً لتسوقكم معنا! 🌹 - جميع الحقوق محفوظة © ${new Date().getFullYear()} ${settings.siteName}
    </div>
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
    const serialStr = formatInvoiceSerial(editingOrder);

    doc.setFont("helvetica", "bold");
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageWidth, 35, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text(settings.siteName || "Ahmed Bahri Store", 15, 18);
    doc.setFontSize(12);
    doc.text(`Official Invoice: ${serialStr}`, pageWidth - 15, 18, { align: "right" });
    doc.setFontSize(9);
    doc.text(`Date: ${new Date(editingOrder.createdAt).toLocaleDateString("ar-EG")}`, pageWidth - 15, 26, { align: "right" });

    doc.setTextColor(50, 50, 50);
    doc.setFontSize(11);
    let y = 48;
    doc.text(`Customer: ${editCustomerName}`, 15, y);
    doc.text(`Phone: ${editCustomerPhone}`, 15, y + 6);
    doc.text(`Address: ${editCustomerAddress}`, 15, y + 12);
    doc.text(`Delivery: ${editDeliveryDuration || "Default"}`, 15, y + 18);

    y += 28;
    doc.setDrawColor(220, 220, 220);
    doc.line(15, y, pageWidth - 15, y);
    y += 8;

    doc.setFontSize(10);
    editItems.forEach((item, i) => {
      doc.text(`${i + 1}. ${item.name} x${item.quantity} = ${(item.retailPrice * item.quantity).toLocaleString()} IQD`, 15, y);
      y += 7;
    });

    y += 6;
    doc.line(15, y, pageWidth - 15, y);
    y += 8;
    doc.text(`Products Subtotal: ${productsSubtotal.toLocaleString()} IQD`, 15, y);
    doc.text(`Shipping Fee: ${editDeliveryFee.toLocaleString()} IQD`, 15, y + 6);
    doc.setFontSize(13);
    doc.text(`Grand Total: ${grandTotal.toLocaleString()} IQD`, 15, y + 15);

    doc.save(`Invoice-${serialStr}-${editCustomerName}.pdf`);
  };

  // Share Invoice to Customer WhatsApp
  const shareToWhatsApp = () => {
    if (!editCustomerPhone || !editingOrder) return;
    const serialStr = formatInvoiceSerial(editingOrder);

    let msg = `📋 *الفاتورة الرسمية رقم: (${serialStr})*\n`;
    msg += `-----------------------------------\n`;
    msg += `👤 *الزبون:* ${editCustomerName}\n`;
    msg += `📍 *العنوان:* ${editCustomerAddress}\n`;
    msg += `🚚 *مدة التوصيل المتوقعة:* ${editDeliveryDuration || "خلال أيام عمل"}\n`;
    msg += `📊 *حالة الطلب:* ${STATUS_LABELS[editStatus]}\n\n`;
    msg += `🛍️ *المنتجات:*\n`;
    editItems.forEach((it, idx) => {
      msg += `${idx + 1}. ${it.name} × ${it.quantity} = ${(it.retailPrice * it.quantity).toLocaleString()} د.ع\n`;
    });
    msg += `-----------------------------------\n`;
    msg += `📦 *مجموع المنتجات:* ${productsSubtotal.toLocaleString()} د.ع\n`;
    msg += `🚚 *تكلفة التوصيل:* ${editDeliveryFee.toLocaleString()} د.ع\n`;
    msg += `💰 *الإجمالي النهائي الكلي:* ${grandTotal.toLocaleString()} د.ع\n`;
    msg += `-----------------------------------\n`;
    msg += `شكراً لتسوقكم معنا! 🌹`;

    const cleanNum = editCustomerPhone.replace(/\D/g, "");
    window.open(`https://api.whatsapp.com/send?phone=${cleanNum}&text=${encodeURIComponent(msg)}`, "_blank");
  };

  // Filtered Orders List
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchStatus = statusFilter === "all" || o.status === statusFilter;
      const q = searchQuery.toLowerCase().trim();
      const serialStr = formatInvoiceSerial(o).toLowerCase();
      const matchSearch =
        !q ||
        serialStr.includes(q) ||
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
      <div className="space-y-6 w-full max-w-full" dir="rtl">
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
                placeholder="ابحث بالرقم التسلسلي (INV-2026-001)، اسم الزبون، الهاتف، أو العنوان..."
                className="w-full pr-10 pl-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white font-bold"
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
              const serialStr = formatInvoiceSerial(order);

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
                        <span className="font-mono text-[10px] text-blue-600 dark:text-blue-400 border-r pr-1.5 border-gray-300 dark:border-gray-700">{serialStr}</span>
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
                        👁️ التفاصيل والطباعة
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
                  <img src={settings.logo || "/logo.jpg"} alt="" className="w-10 h-10 rounded-xl object-cover shadow-sm" />
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <span>فاتورة طلب رقم:</span>
                      <span className="font-mono text-sm text-blue-600 dark:text-blue-400">{formatInvoiceSerial(editingOrder)}</span>
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
                        className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 block mb-1">رقم الهاتف</label>
                      <input
                        type="text"
                        value={editCustomerPhone}
                        onChange={(e) => setEditCustomerPhone(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-bold"
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
                    {/* Desktop Table View */}
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold border-b border-gray-200 dark:border-gray-700">
                          <tr>
                            <th className="p-3 text-center">رقم</th>
                            <th className="p-3 text-center">صورة المنتج</th>
                            <th className="p-3">اسم المنتج</th>
                            <th className="p-3 text-center">السعر الفردي</th>
                            <th className="p-3 text-center">الكمية</th>
                            <th className="p-3 text-left">الإجمالي</th>
                            <th className="p-3 text-center">حذف</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {editItems.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="p-6 text-center text-gray-400">
                                لا توجد منتجات في الفاتورة
                              </td>
                            </tr>
                          ) : (
                            editItems.map((item, idx) => (
                              <tr key={idx} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                                <td className="p-3 text-center font-bold text-gray-400">{idx + 1}</td>
                                <td className="p-3 text-center">
                                  {item.image ? (
                                    <img src={item.image} alt="" className="w-8 h-8 rounded-lg object-cover mx-auto border border-gray-200 dark:border-gray-700" />
                                  ) : (
                                    <span className="text-base">📦</span>
                                  )}
                                </td>
                                <td className="p-3 font-semibold text-gray-900 dark:text-white max-w-[200px] truncate">{item.name}</td>

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

                    {/* Mobile Items Cards View */}
                    <div className="block sm:hidden space-y-2.5 p-2.5">
                      {editItems.length === 0 ? (
                        <p className="text-center text-xs text-gray-400 py-4">لا توجد منتجات في الفاتورة</p>
                      ) : (
                        editItems.map((item, idx) => (
                          <div
                            key={idx}
                            className="bg-gray-50 dark:bg-gray-800/80 p-3 rounded-xl border border-gray-200/80 dark:border-gray-700/80 space-y-2 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2 border-b border-gray-200/60 dark:border-gray-700/60 pb-2">
                              <div className="flex items-center gap-2 min-w-0">
                                {item.image ? (
                                  <img src={item.image} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0 border border-gray-200 dark:border-gray-700" />
                                ) : (
                                  <span className="text-base flex-shrink-0">📦</span>
                                )}
                                <span className="font-bold text-gray-900 dark:text-white truncate">{item.name}</span>
                              </div>
                              <button
                                onClick={() => setEditItems((prev) => prev.filter((_, i) => i !== idx))}
                                className="w-7 h-7 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-bold text-xs flex items-center justify-center flex-shrink-0"
                              >
                                ✕
                              </button>
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-0.5">
                              <div>
                                <span className="text-[10px] text-gray-500 block">السعر الفردي:</span>
                                <input
                                  type="number"
                                  value={item.retailPrice}
                                  onChange={(e) => {
                                    const val = Number(e.target.value) || 0;
                                    setEditItems((prev) =>
                                      prev.map((it, i) => (i === idx ? { ...it, retailPrice: val } : it))
                                    );
                                  }}
                                  className="w-20 px-2 py-1 text-center bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md text-xs font-bold text-gray-900 dark:text-white"
                                />
                              </div>

                              <div>
                                <span className="text-[10px] text-gray-500 block text-center">الكمية:</span>
                                <div className="flex items-center gap-1">
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
                                  <span className="w-6 text-center font-extrabold text-gray-900 dark:text-white">{item.quantity}</span>
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
                              </div>

                              <div className="text-left">
                                <span className="text-[10px] text-gray-500 block">الإجمالي:</span>
                                <span className="font-extrabold text-blue-600 dark:text-blue-400">
                                  {(item.retailPrice * item.quantity).toLocaleString()} د.ع
                                </span>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
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
                    className="px-3.5 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs hover:bg-blue-700 transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    <span>🖨️</span>
                    <span>طباعة الفاتورة الرسمية</span>
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

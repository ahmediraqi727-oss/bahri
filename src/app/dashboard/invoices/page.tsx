"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useData } from "@/lib/data-context";
import { useSettings } from "@/lib/settings-context";
import { useActivityLog } from "@/lib/activity-log";
import { supabase } from "@/lib/supabase-client";
import { Order, CartItem, formatInvoiceSerial } from "@/lib/order-types";
import PermissionGate from "@/components/PermissionGate";
import { useAuth } from "@/lib/auth-context";
import jsPDF from "jspdf";
import DataTableWrapper from "@/components/DataTableWrapper";

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

export default function InvoicesPage() {
  const { products } = useData();
  const { settings } = useSettings();
  const { logActivity } = useActivityLog();
  const { user } = useAuth();

  const isCustomer = Boolean(user && user.role === "customer" && !user.isGuest && !user.id.startsWith("guest-"));

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filtering State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");

  // Selected Order for Invoice Viewing / Editing
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

  // Load Invoices / Orders from Supabase
  const loadInvoices = useCallback(async () => {
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
    loadInvoices();

    const channel = supabase
      .channel("public:invoices_page")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        loadInvoices();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadInvoices]);

  // Subtotal & Grand Total Calculation
  const productsSubtotal = useMemo(() => {
    return editItems.reduce((acc, item) => acc + item.retailPrice * item.quantity, 0);
  }, [editItems]);

  const grandTotal = useMemo(() => {
    return productsSubtotal + (Number(editDeliveryFee) || 0);
  }, [productsSubtotal, editDeliveryFee]);

  // Open Invoice Viewer Modal
  const openInvoiceModal = (order: Order) => {
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
        details: `تحديث الفاتورة ${serialStr} - الإجمالي: ${finalTotal.toLocaleString()} د.ع`,
      });

      await loadInvoices();
    } catch (err: unknown) {
      console.error("Save invoice exception caught:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      alert(`حدث خطأ أثناء حفظ الفاتورة في قاعدة البيانات: ${errMsg}`);
    } finally {
      setSavingOrder(false);
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

  // Generate PDF Export
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

    let msg = `🧾 *الفاتورة الرسمية رقم: (${serialStr})*\n`;
    msg += `-----------------------------------\n`;
    msg += `🏢 *المتجر:* ${settings.siteName}\n`;
    msg += `👤 *الزبون:* ${editCustomerName}\n`;
    msg += `📍 *العنوان:* ${editCustomerAddress}\n`;
    msg += `🚚 *مدة التوصيل:* ${editDeliveryDuration || "خلال أيام عمل"}\n`;
    msg += `📊 *الحالة:* ${STATUS_LABELS[editStatus]}\n\n`;
    msg += `🛍️ *المنتجات المشتراة:*\n`;
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

  // Filtered Invoices Search Engine Logic
  const filteredInvoices = useMemo(() => {
    return orders.filter((o) => {
      // 0. Customer Role Filter: Only show invoices belonging to this registered customer
      if (isCustomer && user) {
        const matchName = user.fullName && o.customerName.toLowerCase().includes(user.fullName.toLowerCase());
        const matchEmail = user.email && o.notes && o.notes.toLowerCase().includes(user.email.toLowerCase());
        const userPhone = (user as unknown as { phone?: string }).phone;
        const matchPhone = userPhone && o.customerPhone && o.customerPhone.includes(userPhone);
        if (!matchName && !matchPhone && !matchEmail) return false;
      }

      // 1. Status Filter
      const matchStatus = statusFilter === "all" || o.status === statusFilter;

      // 2. Date Filter
      let matchDate = true;
      if (dateFilter !== "all") {
        const orderDate = new Date(o.createdAt);
        const now = new Date();
        if (dateFilter === "today") {
          matchDate = orderDate.toDateString() === now.toDateString();
        } else if (dateFilter === "week") {
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          matchDate = orderDate >= weekAgo;
        } else if (dateFilter === "month") {
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          matchDate = orderDate >= monthAgo;
        }
      }

      // 3. Smart Search Query Engine (Serial Number, Name, Phone, Address, Date)
      const q = searchQuery.toLowerCase().trim();
      const serialStr = formatInvoiceSerial(o).toLowerCase();
      const rawSerialNum = o.serialNumber ? String(o.serialNumber) : "";

      const matchSearch =
        !q ||
        serialStr.includes(q) ||
        rawSerialNum.includes(q) ||
        o.id.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.includes(q) ||
        o.customerAddress.toLowerCase().includes(q) ||
        o.createdAt.includes(q);

      return matchStatus && matchDate && matchSearch;
    });
  }, [orders, statusFilter, dateFilter, searchQuery]);

  // Analytics Stats Summary
  const stats = useMemo(() => {
    const totalCount = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
    const completedCount = orders.filter((o) => o.status === "delivered" || o.status === "confirmed").length;
    const pendingCount = orders.filter((o) => o.status === "pending").length;
    return { totalCount, totalRevenue, completedCount, pendingCount };
  }, [orders]);

  return (
    <PermissionGate permission="orders.view">
      <div className="space-y-6" dir="rtl">
        {/* Top Title Bar */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <span>🧾</span>
              <span>نظام الفواتير والأرشيف التسلسلي الرسمـي</span>
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
              محرك بحث متطور ومؤرشف للفواتير بالرقم التسلسلي والتاريخ والهاتف والطباعة بالهوية الرسمية
            </p>
          </div>

          <button
            onClick={loadInvoices}
            className="px-4 py-2.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl font-bold text-xs hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors flex items-center gap-2 w-fit border border-blue-200 dark:border-blue-800 shadow-sm"
          >
            <span>🔄 تحديث الأرشيف</span>
          </button>
        </div>

        {/* Analytics Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-200 dark:border-gray-800 shadow-sm">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>إجمالي الفواتير المؤرشفة</span>
              <span className="text-xl">📄</span>
            </div>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{stats.totalCount}</p>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-blue-200 dark:border-blue-800/60 bg-blue-50/20 shadow-sm">
            <div className="flex items-center justify-between text-xs text-blue-600 dark:text-blue-400 mb-1">
              <span>مجموع مبالغ الفواتير</span>
              <span className="text-xl">💰</span>
            </div>
            <p className="text-xl font-extrabold text-blue-600 dark:text-blue-400 truncate">
              {stats.totalRevenue.toLocaleString()} د.ع
            </p>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/20 shadow-sm">
            <div className="flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400 mb-1">
              <span>فواتير مكتملة / مفرغة</span>
              <span className="text-xl">✅</span>
            </div>
            <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">{stats.completedCount}</p>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-amber-200 dark:border-amber-800/60 bg-amber-50/20 shadow-sm">
            <div className="flex items-center justify-between text-xs text-amber-600 dark:text-amber-400 mb-1">
              <span>فواتير قيد الانتظار</span>
              <span className="text-xl">⏳</span>
            </div>
            <p className="text-2xl font-extrabold text-amber-600 dark:text-amber-400">{stats.pendingCount}</p>
          </div>
        </div>

        {/* Advanced Search Engine & Filter Bar */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-3">
            <span className="text-lg">🔍</span>
            <h2 className="font-bold text-sm text-gray-900 dark:text-white">محرك البحث الذكي في الفواتير:</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {/* Search Query Input */}
            <div className="md:col-span-2 relative">
              <span className="absolute right-3.5 top-2.5 text-gray-400 text-base">🔎</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث بالرقم التسلسلي (INV-2026-001)، اسم الزبون، الهاتف، أو المحافظة..."
                className="w-full pr-10 pl-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Date Filter */}
            <div>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="all">📅 كل التواريخ والأرشيف</option>
                <option value="today">اليوم</option>
                <option value="week">آخر 7 أيام</option>
                <option value="month">آخر 30 يوم</option>
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="all">جميع الحالات</option>
                <option value="pending">⚠️ قيد الانتظار</option>
                <option value="confirmed">✓ مؤكد</option>
                <option value="shipped">🚚 قيد الشحن</option>
                <option value="delivered">✅ مكتمل</option>
                <option value="cancelled">❌ ملغي</option>
              </select>
            </div>
          </div>
        </div>

        {/* Invoices List / Table */}
        {loading ? (
          <div className="p-16 text-center text-gray-400 animate-pulse">
            <span className="text-4xl block mb-2">🔄</span>
            <p>جاري استرجاع الفواتير الموثقة من الأرشيف...</p>
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-16 text-center text-gray-400 space-y-3">
            <span className="text-5xl block">📑</span>
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">لا توجد فواتير تطابق شروط البحث</h3>
            <p className="text-xs">تأكد من كتابة الرقم التسلسلي أو جزء من اسم الزبون أو الهاتف بشكل صحيح</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
            <DataTableWrapper>
              <table className="w-full text-right text-xs min-w-[850px]">
                <thead className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="p-3.5 text-center sticky right-0 z-20 bg-gray-100 dark:bg-gray-800 shadow-sm">الرقم التسلسلي</th>
                    <th className="p-3.5">الزبون والهاتف</th>
                    <th className="p-3.5">المحافظة والعنوان</th>
                    <th className="p-3.5 text-center">عدد المنتجات</th>
                    <th className="p-3.5 text-center">تكلفة التوصيل</th>
                    <th className="p-3.5 text-left">الإجمالي النهائي</th>
                    <th className="p-3.5 text-center">حالة الفاتورة</th>
                    <th className="p-3.5 text-center">تاريخ الإصدار</th>
                    <th className="p-3.5 text-center sticky left-0 z-20 bg-gray-100 dark:bg-gray-800 shadow-md border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">الإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredInvoices.map((inv) => {
                    const serialStr = formatInvoiceSerial(inv);
                    const statusStyle = STATUS_COLORS[inv.status];

                    return (
                      <tr
                        key={inv.id}
                        onClick={() => openInvoiceModal(inv)}
                        className="group hover:bg-blue-50/40 dark:hover:bg-gray-800/60 transition-colors cursor-pointer"
                      >
                        <td className="p-3.5 text-center font-mono font-bold text-blue-600 dark:text-blue-400 sticky right-0 z-10 bg-white dark:bg-gray-900 group-hover:bg-blue-50/90 dark:group-hover:bg-gray-800/90 transition-colors shadow-sm">
                          {serialStr}
                        </td>

                        <td className="p-3.5">
                          <p className="font-bold text-gray-900 dark:text-white">{inv.customerName}</p>
                          <p className="text-[11px] text-gray-500 font-mono" dir="ltr">{inv.customerPhone}</p>
                        </td>

                        <td className="p-3.5 text-gray-700 dark:text-gray-300 max-w-[180px] truncate">
                          {inv.customerAddress}
                        </td>

                        <td className="p-3.5 text-center font-semibold">
                          {inv.items.length} منتجات
                        </td>

                        <td className="p-3.5 text-center text-blue-600 dark:text-blue-400 font-semibold">
                          {inv.deliveryFee ? `${inv.deliveryFee.toLocaleString()} د.ع` : "مجاني"}
                        </td>

                        <td className="p-3.5 text-left font-black text-emerald-600 dark:text-emerald-400 text-sm">
                          {inv.total.toLocaleString()} د.ع
                        </td>

                        <td className="p-3.5 text-center">
                          <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
                            {STATUS_LABELS[inv.status]}
                          </span>
                        </td>

                        <td className="p-3.5 text-center text-gray-500 text-[11px]">
                          {new Date(inv.createdAt).toLocaleDateString("ar-EG")}
                        </td>

                        <td className="p-3.5 text-center sticky left-0 z-10 bg-white dark:bg-gray-900 group-hover:bg-blue-50/90 dark:group-hover:bg-gray-800/90 transition-colors shadow-md border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openInvoiceModal(inv);
                            }}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg font-bold text-[11px] hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap shrink-0"
                          >
                            👁️ معاينة وطباعة
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </DataTableWrapper>
          </div>
        )}

        {/* ================= Official Invoice Preview Modal ================= */}
        {editingOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn" dir="rtl">
            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden text-right">
              {/* Header */}
              <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50/80 dark:bg-gray-800/80">
                <div className="flex items-center gap-3">
                  <img src={settings.logo || "/logo.jpg"} alt="" className="w-10 h-10 rounded-xl object-cover shadow-sm" />
                  <div>
                    <h2 className="text-base font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                      <span>الفاتورة الرسمية:</span>
                      <span className="font-mono text-blue-600 dark:text-blue-400">{formatInvoiceSerial(editingOrder)}</span>
                    </h2>
                    <p className="text-xs text-gray-500">
                      تاريخ التوثيق: {new Date(editingOrder.createdAt).toLocaleString("ar-EG")}
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

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {saveSuccess && (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-bold flex items-center gap-2 animate-fadeIn">
                    <span>✅</span>
                    <span>تم تحديث كافة بيانات الفاتورة في قاعدة البيانات بنجاح!</span>
                  </div>
                )}

                {/* Customer Details Form */}
                <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-3">
                  <h3 className="font-bold text-gray-900 dark:text-white text-xs flex items-center gap-2">
                    <span>👤</span>
                    <span>معلومات الزبون والشحن:</span>
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 block mb-1">اسم الزبون</label>
                      <input
                        type="text"
                        value={editCustomerName}
                        onChange={(e) => setEditCustomerName(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl text-xs font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 block mb-1">رقم الهاتف</label>
                      <input
                        type="text"
                        value={editCustomerPhone}
                        onChange={(e) => setEditCustomerPhone(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl text-xs font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 block mb-1">حالة الطلب</label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as Order["status"])}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl text-xs font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="pending">⚠️ قيد الانتظار</option>
                        <option value="confirmed">✓ مؤكد</option>
                        <option value="shipped">🚚 قيد الشحن</option>
                        <option value="delivered">✅ مكتمل</option>
                        <option value="cancelled">❌ ملغي</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 block mb-1">المحافظة والعنوان الكامل</label>
                    <input
                      type="text"
                      value={editCustomerAddress}
                      onChange={(e) => setEditCustomerAddress(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl text-xs text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Delivery Settings */}
                <div className="bg-blue-50/50 dark:bg-blue-950/30 p-4 rounded-2xl border border-blue-200 dark:border-blue-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-blue-900 dark:text-blue-200 text-xs flex items-center gap-2">
                      <span>🚚</span>
                      <span>رسوم وتفاصيل التوصيل للفاتورة:</span>
                    </h3>

                    <button
                      onClick={() => setEditDeliveryFee(0)}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white dark:bg-gray-800 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700"
                    >
                      توصيل مجاني (0 د.ع)
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 block mb-1">تكلفة التوصيل (د.ع)</label>
                      <input
                        type="number"
                        value={editDeliveryFee}
                        onChange={(e) => setEditDeliveryFee(Number(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl text-xs font-bold text-gray-900 dark:text-white outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 block mb-1">مدة التوصيل</label>
                      <input
                        type="text"
                        value={editDeliveryDuration}
                        onChange={(e) => setEditDeliveryDuration(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl text-xs font-bold text-gray-900 dark:text-white outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Items Table with Product Thumbnails */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-gray-900 dark:text-white text-xs flex items-center gap-2">
                      <span>📦</span>
                      <span>جدول منتجات الفاتورة:</span>
                    </h3>

                    <div className="flex items-center gap-2">
                      <select
                        value={addingProductId}
                        onChange={(e) => setAddingProductId(e.target.value)}
                        className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-xs text-gray-900 dark:text-white outline-none max-w-[200px]"
                      >
                        <option value="">+ إضافة منتج...</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.retailPrice.toLocaleString()} د.ع)
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={handleAddProductToInvoice}
                        disabled={!addingProductId}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 disabled:opacity-40"
                      >
                        إضافة
                      </button>
                    </div>
                  </div>

                  <div className="border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden bg-white dark:bg-gray-900">
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
                        {editItems.map((item, idx) => (
                          <tr key={idx} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                            <td className="p-3 text-center font-bold text-gray-400">{idx + 1}</td>
                            <td className="p-3 text-center">
                              {item.image ? (
                                <img src={item.image} alt="" className="w-9 h-9 rounded-lg object-cover mx-auto border border-gray-200 dark:border-gray-700" />
                              ) : (
                                <span className="text-lg">📦</span>
                              )}
                            </td>
                            <td className="p-3 font-semibold text-gray-900 dark:text-white max-w-[200px] truncate">{item.name}</td>
                            <td className="p-3 text-center font-bold">
                              <input
                                type="number"
                                value={item.retailPrice}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 0;
                                  setEditItems((prev) =>
                                    prev.map((it, i) => (i === idx ? { ...it, retailPrice: val } : it))
                                  );
                                }}
                                className="w-20 px-2 py-1 text-center bg-gray-50 dark:bg-gray-800 border rounded text-xs font-bold"
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
                                  className="w-5 h-5 rounded bg-gray-200 dark:bg-gray-700 text-xs font-bold"
                                >
                                  -
                                </button>
                                <span className="w-6 text-center font-bold">{item.quantity}</span>
                                <button
                                  onClick={() => {
                                    setEditItems((prev) =>
                                      prev.map((it, i) => (i === idx ? { ...it, quantity: it.quantity + 1 } : it))
                                    );
                                  }}
                                  className="w-5 h-5 rounded bg-blue-600 text-white text-xs font-bold"
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
                                className="text-red-400 hover:text-red-600 text-xs"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Breakdown Summary */}
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

              {/* Actions Footer */}
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
                    <span>تصدير PDF</span>
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
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-xs hover:bg-gray-100"
                  >
                    إغلاق
                  </button>

                  <button
                    onClick={handleSaveInvoice}
                    disabled={savingOrder}
                    className="px-6 py-2 bg-emerald-600 text-white rounded-xl font-extrabold text-xs hover:bg-emerald-700 disabled:opacity-50 shadow-md flex items-center gap-1.5"
                  >
                    {savingOrder ? "جاري الحفظ..." : "💾 حفظ الفاتورة وقاعدة البيانات"}
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

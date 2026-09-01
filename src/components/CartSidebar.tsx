"use client";

import { useState, useEffect } from "react";
import { useCart } from "@/lib/cart-context";
import { useSettings } from "@/lib/settings-context";
import { useNotifications } from "@/lib/notifications";
import { useActivityLog } from "@/lib/activity-log";
import { useData } from "@/lib/data-context";
import { useSales } from "@/lib/sales-context";
import { useAuth } from "@/lib/auth-context";
import { Order } from "@/lib/order-types";
import { createOrderAndNotify } from "@/lib/order-helpers";
import jsPDF from "jspdf";

interface CartSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CartSidebar({ isOpen, onClose }: CartSidebarProps) {
  const { items, removeItem, updateQuantity, clearCart, total, itemCount } = useCart();
  const { settings } = useSettings();
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const { logActivity } = useActivityLog();
  const { products } = useData();
  const { addSale } = useSales();
  const theme = settings.roleThemes.customer;

  const isManagerOrAdmin = user?.role === "manager" || user?.role === "admin" || settings.currentRole === "manager" || settings.currentRole === "admin";

  const [step, setStep] = useState<"cart" | "checkout" | "done">("cart");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [cartDeliveryFee, setCartDeliveryFee] = useState<number>(settings.defaultDeliveryFee ?? 5000);
  const [cartDeliveryDuration, setCartDeliveryDuration] = useState<string>(settings.defaultDeliveryDuration || "2 - 3 أيام عمل");

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (settings.defaultDeliveryFee !== undefined) {
      setCartDeliveryFee(settings.defaultDeliveryFee);
    }
    if (settings.defaultDeliveryDuration) {
      setCartDeliveryDuration(settings.defaultDeliveryDuration);
    }
  }, [settings.defaultDeliveryFee, settings.defaultDeliveryDuration]);

  // Auto-Fill Profile on Load
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedProfile = localStorage.getItem("customer_profile");
    if (savedProfile) {
      try {
        const { name: sName, phone: sPhone, address: sAddress } = JSON.parse(savedProfile);
        if (sName && !name) setName(sName);
        if (sPhone && !phone) setPhone(sPhone);
        if (sAddress && !address) setAddress(sAddress);
      } catch {}
    }
  }, []);

  const grandTotal = total + (Number(cartDeliveryFee) || 0);

  const [lastCreatedOrder, setLastCreatedOrder] = useState<Order | null>(null);

  const handleOrder = async () => {
    if (!name.trim() || !phone.trim() || !address.trim()) return;
    setSubmitting(true);

    try {
      const createdOrder = await createOrderAndNotify({
        customerName: name,
        customerPhone: phone,
        customerAddress: address,
        items: [...items],
        total: grandTotal,
        deliveryFee: cartDeliveryFee,
        deliveryDuration: cartDeliveryDuration,
        notes,
        platform: "تأكيد مباشر",
      });

      setLastCreatedOrder(createdOrder);

      if (typeof window !== "undefined" && createdOrder?.id) {
        localStorage.setItem("customer_profile", JSON.stringify({ name: name.trim(), phone: phone.trim(), address: address.trim() }));
        localStorage.setItem("customer_profile_phone", phone.trim());
        const localOrders: string[] = JSON.parse(localStorage.getItem("my_local_orders") || "[]");
        if (!localOrders.includes(createdOrder.id)) {
          localOrders.push(createdOrder.id);
          localStorage.setItem("my_local_orders", JSON.stringify(localOrders));
        }
      }

      const saleItems = items.map((item) => {
        const product = products.find((p) => p.id === item.productId);
        return {
          productId: item.productId,
          productName: item.name,
          costPrice: product?.costPrice || 0,
          retailPrice: item.retailPrice,
          quantity: item.quantity,
        };
      });
      const saleCost = saleItems.reduce((s, i) => s + i.costPrice * i.quantity, 0);

      try {
        await addSale({
          customerName: name,
          customerPhone: phone,
          items: saleItems,
          total,
          cost: saleCost,
          profit: total - saleCost,
        });
      } catch (e) {
        console.warn("addSale error:", e);
      }

      try {
        await logActivity({
          user: "customer",
          action: "create",
          entity: "طلب",
          entityId: createdOrder.id,
          details: `طلب جديد من ${name} (${phone}) - العنوان: ${address} - الإجمالي: ${grandTotal.toLocaleString()} د.ع`,
        });
      } catch (e) {
        console.warn("logActivity error:", e);
      }
    } catch (err) {
      console.error("handleOrder error:", err);
    } finally {
      setSubmitting(false);
      setStep("done");
    }
  };

  const generateWhatsAppMessage = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://ahmed-bahri.com";
    const invoiceParam = lastCreatedOrder?.serialNumber ? String(lastCreatedOrder.serialNumber) : (lastCreatedOrder?.id || "latest");
    const invoiceUrl = `${origin}/invoice/${invoiceParam}`;

    let msg = `🧾 *طلب جديد وتوثيق فاتورة - ${settings.siteName || "متجر أحمد بحري"}*\n\n`;
    msg += `👤 *الزبون:* ${name}\n`;
    msg += `📞 *الهاتف:* ${phone}\n`;
    msg += `📍 *العنوان:* ${address}\n\n`;
    msg += `📦 *المنتجات المطلوبة:*\n`;
    items.forEach((item, i) => {
      msg += `${i + 1}. ${item.name} × ${item.quantity} = ${(item.retailPrice * item.quantity).toLocaleString()} د.ع\n`;
    });
    msg += `\n💰 *المجموع الكلي:* ${grandTotal.toLocaleString()} د.ع\n`;
    if (notes) msg += `📝 *ملاحظات:* ${notes}\n`;
    msg += `\n📄 *معاينة وتوثيق الفاتورة الرسمية:*\n${invoiceUrl}\n`;
    return msg;
  };

  const shareInvoiceToCustomerWhatsApp = () => {
    const msg = generateWhatsAppMessage();
    const cleanPhone = phone.replace(/\D/g, "");
    const formattedPhone = cleanPhone.startsWith("0") ? "964" + cleanPhone.slice(1) : cleanPhone;
    if (formattedPhone) {
      window.open(`https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(msg)}`, "_blank");
    } else {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, "_blank");
    }
  };

  const shareInvoiceToCustomerTelegram = () => {
    const msg = generateWhatsAppMessage();
    const cleanPhone = phone.replace(/\D/g, "");
    const formattedPhone = cleanPhone.startsWith("0") ? "964" + cleanPhone.slice(1) : cleanPhone;
    if (formattedPhone) {
      window.open(`https://t.me/+${formattedPhone}?text=${encodeURIComponent(msg)}`, "_blank");
    } else {
      window.open(`https://t.me/share/url?url=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}&text=${encodeURIComponent(msg)}`, "_blank");
    }
  };

  const printInvoiceWindow = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const invNum = `INV-${Date.now().toString().slice(-6)}`;
    const dateStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
    const logoUrl = settings.logo || "/logo.jpg";

    const rowsHtml = items
      .map(
        (item) => `
        <tr>
          <td>
            <div class="product-cell">
              ${item.image ? `<img src="${item.image}" alt="" class="product-img" />` : '<div class="product-img" style="display:flex;align-items:center;justify-content:center;background:#f1f5f9;font-size:20px;">📦</div>'}
              <span>${item.name}</span>
            </div>
          </td>
          <td>${item.quantity}</td>
          <td>${item.retailPrice.toLocaleString()} د.ع</td>
          <td>${(item.retailPrice * item.quantity).toLocaleString()} د.ع</td>
        </tr>`
      )
      .join("");

    printWindow.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>فاتورة مبيعات - ${name}</title>
  <style>
    :root {
      --primary-color: #1e293b;
      --accent-color: #2563eb;
      --border-color: #e2e8f0;
      --bg-light: #f8fafc;
      --text-main: #0f172a;
      --text-muted: #64748b;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Cairo', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }

    body {
      background-color: #f1f5f9;
      padding: 30px 15px;
      color: var(--text-main);
    }

    .invoice-card {
      position: relative;
      max-width: 850px;
      margin: 0 auto;
      background: #ffffff;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
      overflow: hidden;
    }

    .watermark {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 380px;
      opacity: 0.05;
      pointer-events: none;
      z-index: 1;
    }

    .invoice-content {
      position: relative;
      z-index: 2;
    }

    .invoice-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 24px;
      border-bottom: 2px solid var(--border-color);
    }

    .brand-logo {
      max-width: 120px;
      height: 120px;
      object-fit: cover;
      border-radius: 16px;
    }

    .invoice-title {
      text-align: left;
    }

    .invoice-title h1 {
      font-size: 26px;
      color: var(--accent-color);
      letter-spacing: -0.5px;
    }

    .invoice-title p {
      font-size: 14px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    .invoice-details {
      display: flex;
      justify-content: space-between;
      margin: 28px 0;
      background: var(--bg-light);
      padding: 20px;
      border-radius: 8px;
      flex-wrap: wrap;
      gap: 15px;
    }

    .info-block h4 {
      font-size: 12px;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: 6px;
    }

    .info-block p {
      font-size: 15px;
      font-weight: 600;
      color: var(--primary-color);
    }

    .invoice-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }

    .invoice-table th {
      background-color: var(--bg-light);
      color: var(--text-muted);
      font-size: 13px;
      font-weight: 700;
      text-align: right;
      padding: 12px 16px;
      border-bottom: 2px solid var(--border-color);
    }

    .invoice-table td {
      padding: 14px 16px;
      border-bottom: 1px solid var(--border-color);
      vertical-align: middle;
      font-size: 14px;
    }

    .product-cell {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .product-img {
      width: 48px;
      height: 48px;
      object-fit: cover;
      border-radius: 6px;
      border: 1px solid var(--border-color);
    }

    .invoice-summary {
      margin-top: 24px;
      display: flex;
      justify-content: flex-end;
    }

    .summary-box {
      width: 280px;
    }

    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 14px;
    }

    .summary-row.total {
      border-top: 2px solid var(--primary-color);
      font-size: 18px;
      font-weight: bold;
      color: var(--accent-color);
      padding-top: 12px;
      margin-top: 6px;
    }

    .invoice-footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px dashed var(--border-color);
      text-align: center;
      color: var(--text-muted);
      font-size: 13px;
    }

    @media print {
      body {
        background: none;
        padding: 0;
      }

      .invoice-card {
        box-shadow: none;
        border-radius: 0;
        max-width: 100%;
      }

      .watermark {
        opacity: 0.08 !important;
        -webkit-print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>

  <div class="invoice-card">
    <img src="${logoUrl}" alt="شعار خفي" class="watermark" />

    <div class="invoice-content">
      <header class="invoice-header">
        <img src="${logoUrl}" alt="${settings.siteName}" class="brand-logo" />
        <div class="invoice-title">
          <h1>فاتورة مبيعات</h1>
          <p>رقم الفاتورة: #${invNum}</p>
          <p>التاريخ: ${dateStr}</p>
        </div>
      </header>

      <section class="invoice-details">
        <div class="info-block">
          <h4>مُصدرة إلى:</h4>
          <p>${name}</p>
          <span style="font-size: 13px; color: var(--text-muted);">${address} | ${phone}</span>
        </div>
        <div class="info-block">
          <h4>حالة الدفع:</h4>
          <p style="color: #10b981;">مدفوع / مؤكد</p>
        </div>
        <div class="info-block">
          <h4>طريقة الدفع:</h4>
          <p>الدفع عند الاستلام</p>
        </div>
      </section>

      <table class="invoice-table">
        <thead>
          <tr>
            <th>المنتج</th>
            <th>الكمية</th>
            <th>سعر الوحدة</th>
            <th>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <section class="invoice-summary">
        <div class="summary-box">
          <div class="summary-row total">
            <span>الإجمالي النهائي:</span>
            <span>${total.toLocaleString()} د.ع</span>
          </div>
        </div>
      </section>

      <footer class="invoice-footer">
        <p>شكراً لتسوقكم من <strong>${settings.siteName}</strong>!</p>
        ${notes ? `<p style="margin-top:4px;">ملاحظات: ${notes}</p>` : ''}
      </footer>
    </div>
  </div>

  <script>
    window.onload = function() { window.print(); };
  </script>
</body>
</html>`);
    printWindow.document.close();
  };

  const sendViaWhatsApp = async () => {
    try {
      await createOrderAndNotify({
        customerName: name,
        customerPhone: phone,
        customerAddress: address,
        items: [...items],
        total,
        notes,
        platform: "واتساب",
      });
    } catch (e) {
      console.warn("createOrderAndNotify error:", e);
    }
    const msg = generateWhatsAppMessage();
    const wa = settings.whatsappLink?.trim();
    if (wa) {
      if (wa.startsWith("http")) {
        const sep = wa.includes("?") ? "&" : "?";
        window.open(`${wa}${sep}text=${encodeURIComponent(msg)}`, "_blank");
      } else {
        const cleanNumber = wa.replace(/\D/g, "");
        window.open(`https://api.whatsapp.com/send?phone=${cleanNumber}&text=${encodeURIComponent(msg)}`, "_blank");
      }
    } else {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, "_blank");
    }
  };

  const sendViaTelegram = async () => {
    try {
      await createOrderAndNotify({
        customerName: name,
        customerPhone: phone,
        customerAddress: address,
        items: [...items],
        total,
        notes,
        platform: "تليجرام",
      });
    } catch (e) {
      console.warn("createOrderAndNotify error:", e);
    }
    const msg = generateWhatsAppMessage();
    const tg = settings.telegramLink?.trim();
    if (tg) {
      if (tg.startsWith("http")) {
        const sep = tg.includes("?") ? "&" : "?";
        window.open(`${tg}${sep}text=${encodeURIComponent(msg)}`, "_blank");
      } else if (tg.startsWith("@")) {
        window.open(`https://t.me/${tg.replace("@", "")}`, "_blank");
      } else {
        window.open(`https://t.me/${tg}`, "_blank");
      }
    } else {
      window.open(`https://t.me/share/url?url=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}&text=${encodeURIComponent(msg)}`, "_blank");
    }
  };

  const sendViaMessenger = async () => {
    try {
      await createOrderAndNotify({
        customerName: name,
        customerPhone: phone,
        customerAddress: address,
        items: [...items],
        total,
        notes,
        platform: "ماسنجر",
      });
    } catch (e) {
      console.warn("createOrderAndNotify error:", e);
    }
    const ms = settings.messengerLink?.trim();
    if (ms) {
      if (ms.startsWith("http")) {
        window.open(ms, "_blank");
      } else {
        window.open(`https://m.me/${ms}`, "_blank");
      }
    } else {
      window.open("https://m.me/", "_blank");
    }
  };

  const generatePDF = () => {
    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageWidth, 40, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text(settings.siteName, pageWidth / 2, 18, { align: "center" });
    doc.setFontSize(10);
    doc.text("فاتورة طلب", pageWidth / 2, 26, { align: "center" });
    doc.text(new Date().toLocaleDateString("ar-EG"), pageWidth / 2, 33, { align: "center" });

    doc.setTextColor(50, 50, 50);
    doc.setFontSize(11);
    let y = 50;
    doc.text(`الاسم: ${name}`, 15, y);
    doc.text(`الهاتف: ${phone}`, 15, y + 6);
    doc.text(`العنوان: ${address}`, 15, y + 12);
    y += 22;

    doc.setDrawColor(200, 200, 200);
    doc.line(15, y, pageWidth - 15, y);
    y += 3;

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text("#", 15, y);
    doc.text("المنتج", 25, y);
    doc.text("السعر", 110, y);
    doc.text("الكمية", 140, y);
    doc.text("المجموع", 160, y);
    y += 7;

    doc.setTextColor(50, 50, 50);
    items.forEach((item, i) => {
      doc.text(`${i + 1}`, 15, y);
      doc.text(item.name.substring(0, 25), 25, y);
      doc.text(`${item.retailPrice.toLocaleString()}`, 110, y);
      doc.text(`${item.quantity}`, 140, y);
      doc.text(`${(item.retailPrice * item.quantity).toLocaleString()}`, 160, y);
      y += 7;
    });

    y += 3;
    doc.setDrawColor(37, 99, 235);
    doc.setLineWidth(0.5);
    doc.line(110, y, pageWidth - 15, y);
    y += 7;

    doc.setFontSize(13);
    doc.setTextColor(37, 99, 235);
    doc.text(`المجموع: ${total.toLocaleString()} د.ع`, pageWidth - 15, y, { align: "right" });

    y += 15;
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text("شكراً لطلبك!", pageWidth / 2, y, { align: "center" });

    doc.save(`invoice-${name}-${Date.now()}.pdf`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" dir="rtl">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl flex flex-col animate-slide-in">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between" style={{ backgroundColor: `${theme.primary}10` }}>
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">
              {step === "cart" ? `🛒 السلة (${itemCount})` : step === "checkout" ? "📝 تأكيد الطلب" : "✅ تم إكمال الطلب"}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {step === "cart" && (
            <>
              {items.length === 0 ? (
                <div className="p-12 text-center text-gray-400">
                  <span className="text-5xl block mb-3">🛒</span>
                  <p>السلة فارغة</p>
                  <p className="text-sm mt-1">أضف منتجات للسلة للبدء</p>
                </div>
              ) : (
                <div className="p-4 space-y-3">
                  {items.map((item) => (
                    <div key={item.productId} className="flex gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                      {item.image ? (
                        <img src={item.image} alt="" className="w-16 h-16 rounded-lg object-cover" />
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-2xl">📦</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{item.name}</p>
                        <p className="text-xs text-gray-500">{item.retailPrice.toLocaleString()} د.ع × {item.quantity}</p>
                        <p className="text-sm font-bold mt-1" style={{ color: theme.primary }}>{(item.retailPrice * item.quantity).toLocaleString()} د.ع</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <button onClick={() => removeItem(item.productId)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                        <div className="flex items-center gap-1">
                          <button onClick={() => updateQuantity(item.productId, item.quantity - 1)} className="w-6 h-6 rounded bg-gray-200 dark:bg-gray-700 text-sm flex items-center justify-center">-</button>
                          <span className="w-6 text-center text-sm font-bold text-gray-900 dark:text-white">{item.quantity}</span>
                          <button
                            onClick={() => {
                              const product = products.find((p) => p.id === item.productId);
                              const maxStock = product?.stock ?? 999;
                              if (item.quantity < maxStock) updateQuantity(item.productId, item.quantity + 1);
                            }}
                            disabled={(() => { const p = products.find((pr) => pr.id === item.productId); return p ? item.quantity >= p.stock : false; })()}
                            className="w-6 h-6 rounded text-white text-sm flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ backgroundColor: theme.primary }}
                          >+</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {step === "checkout" && (
            <div className="p-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">اسم الزبون *</label>
                <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none text-sm" placeholder="الاسم الكامل" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">رقم الهاتف *</label>
                <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none text-sm" placeholder="07XX XXX XXXX" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">العنوان / المحافظة *</label>
                <input type="text" required value={address} onChange={(e) => setAddress(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none text-sm" placeholder="المحافظة / المدينة / المنطقة" />
              </div>

              {/* Delivery Settings Card */}
              <div className="bg-blue-50/60 dark:bg-blue-950/40 p-3.5 rounded-xl border border-blue-200 dark:border-blue-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                    <span>🚚</span>
                    <span>التوصيل والشحن</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setCartDeliveryFee(0)}
                    className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-white dark:bg-gray-800 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-700"
                  >
                    توصيل مجاني
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 block mb-0.5">تكلفة التوصيل (د.ع)</label>
                    <input
                      type="number"
                      value={cartDeliveryFee}
                      onChange={(e) => setCartDeliveryFee(Number(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 block mb-0.5">مدة التوصيل</label>
                    <input
                      type="text"
                      value={cartDeliveryDuration}
                      onChange={(e) => setCartDeliveryDuration(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs font-bold"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">ملاحظات إضافية</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none resize-none text-sm" placeholder="ملاحظات حول وقت التوصيل أو تفاصيل أخرى..." />
              </div>

              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-2">
                {items.map((item) => (
                  <div key={item.productId} className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">{item.name} × {item.quantity}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{(item.retailPrice * item.quantity).toLocaleString()} د.ع</span>
                  </div>
                ))}
                <div className="flex justify-between text-xs text-blue-600 dark:text-blue-400 pt-1">
                  <span>تكلفة التوصيل ({cartDeliveryDuration}):</span>
                  <span>{cartDeliveryFee ? `${cartDeliveryFee.toLocaleString()} د.ع` : "مجاني"}</span>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between font-bold">
                  <span className="text-gray-900 dark:text-white">الإجمالي الكلي النهائي</span>
                  <span style={{ color: theme.primary }}>{grandTotal.toLocaleString()} د.ع</span>
                </div>
              </div>
            </div>
          )}

          {step === "done" && (
            <div className="p-5 text-center space-y-5">
              <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center text-3xl mx-auto shadow-inner">
                ✓
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">تم تأكيد طلبك بنجاح!</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">جميع البيانات تم تسجيلها ويمكنك التواصل المباشر عبر الخيارات التالية:</p>
              </div>

              {/* Card with summary details */}
              <div className="bg-gray-50 dark:bg-gray-800/80 rounded-2xl p-4 text-right space-y-2.5 border border-gray-200 dark:border-gray-700 text-xs">
                <div className="border-b border-gray-200 dark:border-gray-700 pb-2 flex justify-between items-center">
                  <span className="font-bold text-gray-900 dark:text-white text-sm">📋 ملخص معلومات الطلب:</span>
                  <span className="text-[10px] text-gray-400">{new Date().toLocaleTimeString("ar-EG", { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="space-y-1 text-gray-700 dark:text-gray-300">
                  <p>👤 <b>الاسم:</b> {name}</p>
                  <p>📞 <b>رقم الهاتف:</b> {phone}</p>
                  <p>📍 <b>العنوان / المحافظة:</b> {address}</p>
                  {notes && <p>📝 <b>الملاحظات:</b> {notes}</p>}
                </div>
                <div className="border-t border-gray-200 dark:border-gray-700 pt-2 space-y-1">
                  <p className="font-semibold text-gray-800 dark:text-gray-200">📦 المنتجات ({items.length}):</p>
                  {items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>• {item.name} ({item.quantity} قطعة)</span>
                      <span className="font-medium text-gray-800 dark:text-gray-200">{(item.retailPrice * item.quantity).toLocaleString()} د.ع</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between font-extrabold text-sm text-gray-900 dark:text-white">
                  <span>المجموع النهائي:</span>
                  <span style={{ color: theme.primary }}>{total.toLocaleString()} د.ع</span>
                </div>
              </div>

              {/* Action Buttons: Manager/Admin vs Customer */}
              {isManagerOrAdmin ? (
                <div className="space-y-2.5 pt-1">
                  <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 py-1.5 px-3 rounded-lg text-xs font-bold text-center border border-blue-200 dark:border-blue-800">
                    👑 خيارات الإدارة والمدير:
                  </div>

                  <button onClick={printInvoiceWindow} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-md text-sm">
                    🖨️ طباعة الفاتورة (مباشر)
                  </button>

                  <button onClick={shareInvoiceToCustomerWhatsApp} className="w-full py-3 bg-[#25D366] text-white rounded-xl font-bold hover:bg-[#20BD5A] transition-colors flex items-center justify-center gap-2 shadow-md text-sm">
                    💬 إرسال الفاتورة إلى واتساب الزبون ({phone})
                  </button>

                  <button onClick={shareInvoiceToCustomerTelegram} className="w-full py-3 bg-[#0088cc] text-white rounded-xl font-bold hover:bg-[#006da3] transition-colors flex items-center justify-center gap-2 shadow-md text-sm">
                    ✈️ إرسال الفاتورة إلى تليجرام الزبون ({phone})
                  </button>

                  <button onClick={generatePDF} className="w-full py-2.5 bg-gray-700 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 shadow-sm text-xs">
                    📄 تحميل الفاتورة PDF
                  </button>
                </div>
              ) : (
                <div className="space-y-2 pt-1">
                  <button onClick={sendViaWhatsApp} className="w-full py-3 bg-[#25D366] text-white rounded-xl font-bold hover:bg-[#20BD5A] transition-colors flex items-center justify-center gap-2 shadow-sm text-sm">
                    💬 إرسال الطلب عبر واتساب
                  </button>
                  <button onClick={sendViaTelegram} className="w-full py-3 bg-[#0088cc] text-white rounded-xl font-bold hover:bg-[#006da3] transition-colors flex items-center justify-center gap-2 shadow-sm text-sm">
                    ✈️ إرسال الطلب عبر تليجرام
                  </button>
                  {settings.messengerLink && (
                    <button onClick={sendViaMessenger} className="w-full py-3 bg-[#0084FF] text-white rounded-xl font-bold hover:bg-[#0073E6] transition-colors flex items-center justify-center gap-2 shadow-sm text-sm">
                      ⚡ إرسال الطلب عبر ماسنجر
                    </button>
                  )}
                  <a href={`tel:${settings.phoneLink || "07800000000"}`} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 shadow-sm text-sm block text-center">
                    📞 اتصال مباشر للإدارة ({settings.phoneLink || "07800000000"})
                  </a>
                  <button onClick={generatePDF} className="w-full py-2.5 bg-gray-700 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 shadow-sm text-xs">
                    📄 تحميل الفاتورة PDF
                  </button>
                </div>
              )}

              <button onClick={() => { clearCart(); setStep("cart"); setName(""); setPhone(""); setAddress(""); setNotes(""); onClose(); }} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline block mx-auto pt-1">
                إغلاق والعودة للمتجر
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === "cart" && items.length > 0 && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
            <div className="flex justify-between font-bold text-lg">
              <span className="text-gray-900 dark:text-white">الإجمالي</span>
              <span style={{ color: theme.primary }}>{total.toLocaleString()} د.ع</span>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (confirm("هل أنت تأكد من رغبتك في تفريغ ومسح كافة المنتجات من السلة؟")) {
                    clearCart();
                  }
                }}
                className="px-3.5 py-3 rounded-xl border-2 border-red-200 dark:border-red-800/80 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-sm"
                title="تفريغ السلة بالكامل"
              >
                <span className="text-base">🗑️</span>
                <span>تفريغ السلة</span>
              </button>

              <button
                onClick={() => setStep("checkout")}
                className="flex-1 py-3 text-white rounded-xl font-bold text-sm hover:opacity-90 transition-opacity shadow-md"
                style={{ backgroundColor: theme.primary }}
              >
                متابعة للطلب ➔
              </button>
            </div>
          </div>
        )}

        {step === "checkout" && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
            <button
              onClick={handleOrder}
              disabled={submitting || !name.trim() || !phone.trim() || !address.trim()}
              className="w-full py-3 text-white rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ backgroundColor: theme.primary }}
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  جاري تأكيد الطلب...
                </>
              ) : (
                "تأكيد الطلب"
              )}
            </button>
            <button onClick={() => setStep("cart")} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              العودة للسلة
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart-context";
import { useSettings } from "@/lib/settings-context";
import { useAuth } from "@/lib/auth-context";
import { useNotifications } from "@/lib/notifications";
import { useActivityLog } from "@/lib/activity-log";
import { updateGuestIdentity } from "@/lib/visitor-tracker";
import { Order, formatInvoiceSerial } from "@/lib/order-types";
import { createOrderAndNotify } from "@/lib/order-helpers";
import { supabase } from "@/lib/supabase-client";

interface CustomerCartSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CustomerCartSidebar({ isOpen, onClose }: CustomerCartSidebarProps) {
  const router = useRouter();
  const { items, removeItem, updateQuantity, clearCart, total, itemCount } = useCart();
  const { settings } = useSettings();
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const { logActivity } = useActivityLog();
  const theme = settings.roleThemes.customer;

  const isManager = settings.currentRole === "manager" || settings.currentRole === "admin" || user?.role === "manager" || user?.role === "admin";

  const [step, setStep] = useState<"cart" | "checkout" | "confirm" | "completed" | "store_order_completed">("cart");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState(false);

  const [storeCompletedOrder, setStoreCompletedOrder] = useState<Order | null>(null);

  const deliveryFee = settings.defaultDeliveryFee ?? 5000;
  const deliveryDuration = settings.defaultDeliveryDuration || "2 - 3 أيام عمل";
  const grandTotal = total + deliveryFee;

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

  if (!isOpen) return null;

  // Helper to persist customer identity and local order IDs
  const persistCustomerOrder = (createdOrderId: string, cName: string, cPhone: string, cAddress: string) => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("customer_profile", JSON.stringify({ name: cName, phone: cPhone, address: cAddress }));
      localStorage.setItem("customer_profile_phone", cPhone.trim());

      const localOrders: string[] = JSON.parse(localStorage.getItem("my_local_orders") || "[]");
      if (!localOrders.includes(createdOrderId)) {
        localOrders.push(createdOrderId);
        localStorage.setItem("my_local_orders", JSON.stringify(localOrders));
      }
    } catch (e) {
      console.warn("Error persisting customer profile to localStorage:", e);
    }
  };

  // Direct In-Store POS Order Handler ("طلب محل") Exclusively for Managers / Admins
  const handleDirectStoreOrder = async () => {
    setSubmitting(true);
    try {
      const invSerial = `INV-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const cName = name.trim() || "زبون محل مباشر";
      const cPhone = phone.trim() || "07700000000";
      const cAddress = address.trim() || "استلام مباشر من المعرض";

      const orderId = crypto.randomUUID();
      const createdAt = new Date().toISOString();

      const { data: insertedRow, error } = await supabase.from("orders").insert({
        id: orderId,
        invoice_serial: invSerial,
        customer_name: cName,
        customer_phone: cPhone,
        customer_address: cAddress,
        governorate: "كركوك - المحل",
        items: items.map((it) => ({
          productId: it.productId,
          name: it.name,
          image: it.image || "",
          quantity: it.quantity,
          retailPrice: it.appliedTierPrice ?? it.retailPrice,
        })),
        total,
        delivery_fee: 0,
        delivery_duration: "مباشر (المحل)",
        status: "delivered",
        notes: notes.trim() ? `${notes.trim()} | طلب محل مباشر` : "طلب محل مباشر",
        platform: "طلب محل",
        created_at: createdAt,
      }).select().maybeSingle();

      if (error) {
        alert("تعذر تسجيل طلب المحل: " + error.message);
        setSubmitting(false);
        return;
      }

      const finalSerial = insertedRow?.invoice_serial || (insertedRow?.serial_number ? `INV-2026-${String(insertedRow.serial_number).padStart(4, "0")}` : invSerial);

      const createdOrderObj: Order = {
        id: insertedRow?.id || orderId,
        serialNumber: insertedRow?.serial_number ? Number(insertedRow.serial_number) : undefined,
        invoiceSerial: finalSerial,
        customerName: cName,
        customerPhone: cPhone,
        customerAddress: cAddress,
        items: [...items],
        total,
        deliveryFee: 0,
        deliveryDuration: "مباشر (المحل)",
        status: "delivered",
        notes: notes.trim(),
        platform: "طلب محل",
        createdAt: insertedRow?.created_at || createdAt,
      };

      setStoreCompletedOrder(createdOrderObj);

      // Notify Admin Bell & Activity Log
      await supabase.from("notifications").insert({
        id: crypto.randomUUID(),
        type: "order",
        title: `🏪 طلب محل جديد #${finalSerial}`,
        message: `تم تسجيل طلب محل مباشر بقيمة ${total.toLocaleString()} د.ع بواسطة الإدارة`,
        product_id: createdOrderObj.id,
        is_broadcast: true,
        read: false,
        created_at: createdAt,
      });

      await logActivity({
        user: "manager",
        action: "create",
        entity: "طلب محل",
        entityId: createdOrderObj.id,
        details: `تسجيل طلب محل مباشر بقيمة ${total.toLocaleString()} د.ع`,
      });

      clearCart();
      setStep("store_order_completed");
    } catch (err: any) {
      alert("حدث خطأ أثناء تسجيل طلب المحل: " + (err.message || String(err)));
    } finally {
      setSubmitting(false);
    }
  };

  // Auto-formatted Order Message with Direct Web Invoice Link (No Base64 or Image Strings)
  const generateOrderMessage = (invoiceSerial: string, invoiceUrl: string) => {
    let msg = `🧾 *فاتورة طلب شراء رسمية - ${settings.siteName || "متجر أحمد بحري"}*\n`;
    msg += `🔖 *رقم الفاتورة:* ${invoiceSerial}\n`;
    msg += `📅 *التاريخ:* ${new Date().toLocaleDateString("ar-IQ")}\n`;
    msg += `-------------------------------------------\n`;
    msg += `👤 *معلومات الزبون والشحن:*\n`;
    msg += `• الاسم: ${name.trim()}\n`;
    msg += `• رقم الهاتف: ${phone.trim()}\n`;
    msg += `• المحافظة والعنوان: ${address.trim()}\n`;
    if (notes.trim()) msg += `• ملاحظات: ${notes.trim()}\n`;
    msg += `-------------------------------------------\n`;
    msg += `🛍️ *قائمة المنتجات المطلوبة:*\n`;

    items.forEach((item, index) => {
      const unitPrice = item.appliedTierPrice ?? item.retailPrice;
      msg += `${index + 1}. *${item.name}*\n`;
      msg += `   • الكمية: ${item.quantity} قطعة\n`;
      msg += `   • السعر الفردي: ${unitPrice.toLocaleString()} د.ع\n`;
      msg += `   • الإجمالي: ${(unitPrice * item.quantity).toLocaleString()} د.ع\n`;
    });

    msg += `-------------------------------------------\n`;
    msg += `📦 مجموع المنتجات: ${total.toLocaleString()} د.ع\n`;
    msg += `🚚 تكلفة التوصيل (${deliveryDuration}): ${deliveryFee ? `${deliveryFee.toLocaleString()} د.ع` : "مجاني"}\n`;
    msg += `💰 *الإجمالي النهائي الكلي:* *${grandTotal.toLocaleString()} د.ع*\n`;
    msg += `-------------------------------------------\n`;
    msg += `📄 *رابط الفاتورة الرسمية للطباعة والمعاينة:*\n`;
    msg += `${invoiceUrl}\n`;
    msg += `-------------------------------------------\n`;
    msg += `🙏 شكراً لتسوقكم معنا! يرجى تأكيد استلام الطلب لتجهيز الشحن فوراً.`;
    return msg;
  };

  // Helper to record order in Supabase and trigger Admin Real-Time Notification
  const recordOrderAndNotify = async (contactMethod: string): Promise<{ createdOrder: Order; invoiceSerial: string; invoiceUrl: string } | null> => {
    setSubmitting(true);
    try {
      await updateGuestIdentity({
        name: name.trim(),
        phone: phone.trim(),
        governorate: address.trim(),
        address: address.trim(),
      });

      const createdOrder = await createOrderAndNotify({
        customerName: name,
        customerPhone: phone,
        customerAddress: address,
        items: [...items],
        total: grandTotal,
        deliveryFee,
        deliveryDuration,
        notes,
        platform: contactMethod,
      });

      const serialStr = createdOrder.invoiceSerial || (createdOrder.serialNumber
        ? `INV-2026-${String(createdOrder.serialNumber).padStart(4, "0")}`
        : formatInvoiceSerial(createdOrder));

      const origin = typeof window !== "undefined" ? window.location.origin : "https://ahmed-bahri.com";
      const invoiceUrl = `${origin}/invoice/${serialStr}`;

      persistCustomerOrder(createdOrder.id, name.trim(), phone.trim(), address.trim());

      await logActivity({
        user: "customer",
        action: "create",
        entity: "طلب زبون",
        entityId: createdOrder.id,
        details: `طلب من ${name} عبر ${contactMethod} - الرقم الفردي: ${serialStr} - الهاتف: ${phone} - الإجمالي: ${grandTotal.toLocaleString()} د.ع`,
      });

      return { createdOrder, invoiceSerial: serialStr, invoiceUrl };
    } catch (err) {
      console.warn("Order recording background error:", err);
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  // Helper to format phone number to international Iraqi format (e.g. 0780... -> 964780...)
  const formatAdminPhone = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("0")) return "964" + digits.slice(1);
    if (digits.startsWith("7")) return "964" + digits;
    return digits;
  };

  // Deep Link Launchers
  const handleWhatsApp = async () => {
    if (!name.trim() || !phone.trim() || !address.trim()) {
      alert("يرجى ملء جميع البيانات الأساسية (الاسم، الهاتف، والعنوان)");
      return;
    }

    setSubmitting(true);

    const invSerial = `INV-2026-${Date.now().toString().slice(-4)}`;
    const origin = typeof window !== "undefined" ? window.location.origin : "https://ahmed-bahri.com";
    const invoiceUrl = `${origin}/invoice/${invSerial}`;

    const { data: insertedOrder, error } = await supabase.from("orders").insert({
      invoice_serial: invSerial,
      customer_name: name.trim(),
      customer_phone: phone.trim(),
      customer_address: address.trim(),
      governorate: address.trim(),
      items: items.map((it) => ({
        productId: it.productId,
        name: it.name,
        image: it.image || "",
        quantity: it.quantity,
        retailPrice: it.appliedTierPrice ?? it.retailPrice,
      })),
      total: grandTotal,
      delivery_fee: deliveryFee,
      delivery_duration: deliveryDuration,
      status: "pending",
      notes: notes.trim(),
      platform: "واتساب",
    }).select().maybeSingle();

    if (error) {
      setSubmitting(false);
      alert("تعذر حفظ الطلب في قاعدة البيانات: " + error.message);
      return;
    }

    if (insertedOrder) {
      persistCustomerOrder(insertedOrder.id, name.trim(), phone.trim(), address.trim());
    }

    const serialNumberPadded = insertedOrder && insertedOrder.serial_number
      ? String(insertedOrder.serial_number).padStart(4, "0")
      : "";
    const finalSerial = insertedOrder?.invoice_serial || (serialNumberPadded ? `INV-2026-${serialNumberPadded}` : invSerial);
    const finalInvoiceUrl = `${origin}/invoice/${finalSerial}`;

    // Success: Generate clean message with invoice link and open WhatsApp
    const msg = generateOrderMessage(finalSerial, finalInvoiceUrl);
    let adminPhone = "9647800000000";
    if (settings.whatsappLink) adminPhone = settings.whatsappLink.replace(/\D/g, "");
    else if (settings.phoneLink) adminPhone = settings.phoneLink.replace(/\D/g, "");
    if (adminPhone.startsWith("0")) adminPhone = "964" + adminPhone.slice(1);

    window.open(`https://api.whatsapp.com/send?phone=${adminPhone}&text=${encodeURIComponent(msg)}`, "_blank");

    clearCart();
    setStep("completed");
    setSubmitting(false);
  };

  const handleTelegram = async () => {
    const res = await recordOrderAndNotify("تليجرام");
    const serial = res?.invoiceSerial || `INV-2026-${Date.now().toString().slice(-4)}`;
    const origin = typeof window !== "undefined" ? window.location.origin : "https://ahmed-bahri.com";
    const invoiceUrl = res?.invoiceUrl || `${origin}/invoice/${serial}`;

    const msg = generateOrderMessage(serial, invoiceUrl);
    let target = settings.telegramLink?.trim() || "";
    let url = "";

    if (target.startsWith("http")) {
      url = `${target}${target.includes("?") ? "&" : "?"}text=${encodeURIComponent(msg)}`;
    } else if (target.startsWith("@")) {
      url = `https://t.me/${target.slice(1)}?text=${encodeURIComponent(msg)}`;
    } else if (target) {
      const clean = target.replace(/\D/g, "");
      if (clean && clean.length >= 8) {
        const phoneFormatted = formatAdminPhone(target);
        url = `https://t.me/+${phoneFormatted}?text=${encodeURIComponent(msg)}`;
      } else {
        url = `https://t.me/${target}?text=${encodeURIComponent(msg)}`;
      }
    } else {
      url = `https://t.me/share/url?url=${encodeURIComponent(typeof window !== "undefined" ? window.location.origin : "")}&text=${encodeURIComponent(msg)}`;
    }

    window.open(url, "_blank");
    setStep("completed");
    clearCart();
  };

  const handleMessenger = async () => {
    const res = await recordOrderAndNotify("ماسنجر");
    const serial = res?.invoiceSerial || `INV-2026-${Date.now().toString().slice(-4)}`;
    const origin = typeof window !== "undefined" ? window.location.origin : "https://ahmed-bahri.com";
    const invoiceUrl = res?.invoiceUrl || `${origin}/invoice/${serial}`;

    const msg = generateOrderMessage(serial, invoiceUrl);
    let target = settings.messengerLink?.trim() || "";
    let url = "";

    if (target.startsWith("http")) {
      url = target;
    } else if (target) {
      url = `https://m.me/${target.replace("@", "")}`;
    } else {
      url = `https://m.me`;
    }

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(msg);
        setCopiedNotice(true);
        setTimeout(() => setCopiedNotice(false), 4000);
      } catch { /* ignore */ }
    }

    window.open(url, "_blank");
    setStep("completed");
    clearCart();
  };

  const handlePhoneCall = async () => {
    let adminPhone = settings.phoneLink?.trim() || settings.whatsappLink?.trim() || "07800000000";
    await recordOrderAndNotify("اتصال مباشر");
    window.location.href = `tel:${adminPhone}`;
    setStep("completed");
    clearCart();
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-hidden" dir="rtl">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="absolute inset-y-0 left-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white dark:bg-gray-900 shadow-2xl flex flex-col border-r border-gray-200 dark:border-gray-800">
          
          {/* Header */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50/80 dark:bg-gray-800/80">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🛒</span>
              <h2 className="font-bold text-lg text-gray-900 dark:text-white">
                {step === "cart" && `سلة مشتريات الزبون (${itemCount})`}
                {step === "checkout" && "معلومات بيانات الزبون"}
                {step === "confirm" && "طرق التواصل والطلب المباشر"}
                {step === "completed" && "تم إرسال الطلب بنجاح"}
                {step === "store_order_completed" && "تم تسجيل طلب المحل"}
              </h2>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl cursor-pointer">
              ✕
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            
            {/* STEP 1: CART ITEMS */}
            {step === "cart" && (
              <>
                {items.length === 0 ? (
                  <div className="text-center py-16 space-y-4">
                    <span className="text-6xl block">🛒</span>
                    <p className="text-gray-500 dark:text-gray-400 font-bold">سلة المشتريات فارغة حالياً</p>
                    <button onClick={onClose} className="px-6 py-2.5 rounded-xl text-white text-sm font-bold shadow-md cursor-pointer" style={{ backgroundColor: theme.primary }}>
                      تصفح المنتجات وأضف للسلة
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {items.map((item) => (
                      <div key={item.productId} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700">
                        <img src={item.image || "/placeholder.jpg"} alt={item.name} className="w-14 h-14 object-cover rounded-xl border border-gray-200 dark:border-gray-700" />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-xs text-gray-900 dark:text-white truncate">{item.name}</h4>
                          <p className="text-xs text-blue-600 dark:text-blue-400 font-extrabold mt-0.5">
                            {(item.appliedTierPrice ?? item.retailPrice).toLocaleString()} د.ع
                          </p>
                        </div>

                        <div className="flex items-center gap-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-1">
                          <button onClick={() => updateQuantity(item.productId, item.quantity - 1)} className="w-6 h-6 flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold text-xs hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                            -
                          </button>
                          <span className="w-6 text-center font-extrabold text-xs text-gray-900 dark:text-white">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.productId, item.quantity + 1)} className="w-6 h-6 flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold text-xs hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                            +
                          </button>
                        </div>

                        <button onClick={() => removeItem(item.productId)} className="text-red-500 hover:text-red-700 p-1 text-sm">
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* STEP 2: CHECKOUT FORM */}
            {step === "checkout" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-extrabold text-gray-700 dark:text-gray-300 mb-1">الاسم الكامل:</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: أحمد علي"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-gray-700 dark:text-gray-300 mb-1">رقم الهاتف التواصل (واتساب):</label>
                  <input
                    type="tel"
                    required
                    placeholder="مثال: 07706166725"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-gray-700 dark:text-gray-300 mb-1">المحافظة والعنوان الكامل:</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: بغداد - الكرادة"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-gray-700 dark:text-gray-300 mb-1">ملاحظات إضافية (اختياري):</label>
                  <textarea
                    rows={2}
                    placeholder="أي تعليمات خاصة بالطلب أو الشحن..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
              </div>
            )}

            {/* STEP 3: CONTACT & CONFIRMATION */}
            {step === "confirm" && (
              <div className="space-y-5">
                <div className="bg-gray-50 dark:bg-gray-800/80 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-2 text-xs">
                  <div className="flex justify-between items-center font-bold text-sm text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
                    <span>ملخص الطلب والتوصيل</span>
                    <span className="text-blue-600 dark:text-blue-400 font-extrabold text-base">{grandTotal.toLocaleString()} د.ع</span>
                  </div>
                  <p className="text-gray-700 dark:text-gray-300"><b>الاسم:</b> {name || "لم يحدد"}</p>
                  <p className="text-gray-700 dark:text-gray-300"><b>الهاتف:</b> {phone || "لم يحدد"}</p>
                  <p className="text-gray-700 dark:text-gray-300"><b>العنوان:</b> {address || "لم يحدد"}</p>
                  <p className="text-gray-700 dark:text-gray-300"><b>عدد المنتجات:</b> {items.length} منتج</p>
                </div>

                {/* Exclusively Render POS In-Store Order Button for Managers / Admins */}
                {isManager && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/50 rounded-2xl space-y-2">
                    <p className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                      <span>👑</span>
                      <span>خاص بمدير النظام والإدارة (نظام POS المباشر):</span>
                    </p>
                    <button
                      type="button"
                      onClick={handleDirectStoreOrder}
                      disabled={submitting || items.length === 0}
                      className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-2xl font-black text-sm shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      <span>🏪</span>
                      <span>تسجيل كـ (طلب محل / مباشر)</span>
                    </button>
                  </div>
                )}

                <div>
                  <h3 className="font-bold text-sm text-gray-900 dark:text-white mb-3">اختر طريقة الطلب والتواصل المباشر:</h3>
                  
                  <div className="grid grid-cols-1 gap-3">
                    <button
                      onClick={handleWhatsApp}
                      disabled={submitting}
                      className="w-full flex items-center justify-between p-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl shadow-md transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">💬</span>
                        <div className="text-right">
                          <p className="font-bold text-sm">إرسال الطلب عبر الواتساب (WhatsApp)</p>
                          <p className="text-[11px] text-emerald-100">فتح الواتساب وتجهيز نص الطلب تلقائياً</p>
                        </div>
                      </div>
                      <span className="text-xl">➔</span>
                    </button>

                    <button
                      onClick={handleTelegram}
                      disabled={submitting}
                      className="w-full flex items-center justify-between p-3.5 bg-sky-500 hover:bg-sky-600 text-white rounded-2xl shadow-md transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">✈️</span>
                        <div className="text-right">
                          <p className="font-bold text-sm">إرسال الطلب عبر التليجرام (Telegram)</p>
                          <p className="text-[11px] text-sky-100">فتح التليجرام وتحويل القائمة بالكامل</p>
                        </div>
                      </div>
                      <span className="text-xl">➔</span>
                    </button>

                    <button
                      onClick={handleMessenger}
                      disabled={submitting}
                      className="w-full flex items-center justify-between p-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-md transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">⚡</span>
                        <div className="text-right">
                          <p className="font-bold text-sm">إرسال عبر الماسنجر (Messenger)</p>
                          <p className="text-[11px] text-blue-100">التواصل المباشر عبر صفحة الفيسبوك</p>
                        </div>
                      </div>
                      <span className="text-xl">➔</span>
                    </button>

                    <button
                      onClick={handlePhoneCall}
                      disabled={submitting}
                      className="w-full flex items-center justify-between p-3.5 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl shadow-md transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">📞</span>
                        <div className="text-right">
                          <p className="font-bold text-sm">الاتصال الفوري الهاتفي (Direct Call)</p>
                          <p className="text-[11px] text-purple-100">الاتصال المباشر برقم إدارة المتجر</p>
                        </div>
                      </div>
                      <span className="text-xl">➔</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: COMPLETED */}
            {step === "completed" && (
              <div className="text-center py-12 space-y-4">
                <span className="text-6xl block animate-bounce">🎉</span>
                <h3 className="font-extrabold text-xl text-gray-900 dark:text-white">شكراً لك! تم إرسال طلبك بنجاح</h3>
                <p className="text-xs text-gray-500 leading-relaxed max-w-xs mx-auto">
                  تم توجيهك إلى منصة التواصل المختارة. ستقوم إدارة المتجر بتجهيز طلبك وتأكيده معك فوراً.
                </p>
                <button
                  onClick={() => {
                    setStep("cart");
                    onClose();
                  }}
                  className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold text-xs shadow-md transition-all cursor-pointer"
                >
                  إغلاق ومتابعة التسوق
                </button>
              </div>
            )}

            {/* STEP 5: STORE ORDER POS COMPLETED (POS Immediate Action Bar) */}
            {step === "store_order_completed" && storeCompletedOrder && (
              <div className="text-center py-6 space-y-5">
                <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 text-3xl flex items-center justify-center mx-auto shadow-md animate-bounce">
                  🏪
                </div>
                <div>
                  <h3 className="font-black text-lg text-gray-900 dark:text-white">تم تسجيل (طلب المحل المباشر) بنجاح!</h3>
                  <p className="text-xs text-gray-400 mt-1">
                    رقم الفاتورة: <span className="font-mono font-bold text-violet-600">{storeCompletedOrder.invoiceSerial || formatInvoiceSerial(storeCompletedOrder)}</span> | الإجمالي: <span className="font-bold text-emerald-600">{storeCompletedOrder.total.toLocaleString()} د.ع</span>
                  </p>
                </div>

                <div className="space-y-2.5 pt-3 border-t border-gray-100 dark:border-gray-800">
                  {/* Action 1: Print Invoice */}
                  <button
                    onClick={() => {
                      const origin = typeof window !== "undefined" ? window.location.origin : "";
                      window.open(`${origin}/invoice/${storeCompletedOrder.invoiceSerial || storeCompletedOrder.id}`, "_blank");
                    }}
                    className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-2xl font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>🖨️</span>
                    <span>طباعة الفاتورة فوراً</span>
                  </button>

                  {/* Action 2: Edit Invoice */}
                  <button
                    onClick={() => {
                      onClose();
                      router.push(`/dashboard/invoices?search=${storeCompletedOrder.invoiceSerial || storeCompletedOrder.id}`);
                    }}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>✏️</span>
                    <span>تعديل الفاتورة في السجل</span>
                  </button>

                  {/* Action 3: Cancel / Delete Invoice */}
                  <button
                    onClick={async () => {
                      if (!confirm("هل أنت تأكد من إالغاء وحذف هذا الطلب من السجل؟")) return;
                      await supabase.from("orders").delete().eq("id", storeCompletedOrder.id);
                      alert("تم إلغاء الطلب بنجاح.");
                      setStep("cart");
                      setStoreCompletedOrder(null);
                    }}
                    className="w-full py-3 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-2xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>❌</span>
                    <span>إلغاء / حذف الطلب من السجل</span>
                  </button>

                  {/* Action 4: Next POS Order */}
                  <button
                    onClick={() => {
                      setStep("cart");
                      setName("");
                      setPhone("");
                      setAddress("");
                      setNotes("");
                      setStoreCompletedOrder(null);
                    }}
                    className="w-full py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-800 dark:text-gray-200 rounded-2xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>➕</span>
                    <span>تسجيل طلب محل جديد</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer Controls */}
          {step !== "completed" && step !== "store_order_completed" && items.length > 0 && (
            <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/80 space-y-3">
              <div className="flex justify-between items-center text-sm font-extrabold text-gray-900 dark:text-white">
                <span>الإجمالي الكلي (شامل الشحن):</span>
                <span className="text-blue-600 dark:text-blue-400 text-base">{grandTotal.toLocaleString()} د.ع</span>
              </div>

              <div className="flex gap-2">
                {step === "cart" && (
                  <button
                    onClick={() => setStep("checkout")}
                    className="w-full py-3 rounded-xl text-white font-extrabold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                    style={{ backgroundColor: theme.primary }}
                  >
                    <span>متابعة الشحن والتسليم</span>
                    <span>➔</span>
                  </button>
                )}

                {step === "checkout" && (
                  <>
                    <button onClick={() => setStep("cart")} className="px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-bold text-xs">
                      السابق
                    </button>
                    <button
                      onClick={() => {
                        if (!name.trim() || !phone.trim() || !address.trim()) {
                          alert("يرجى إكمال الاسم، الهاتف، والعنوان أولاً");
                          return;
                        }
                        setStep("confirm");
                      }}
                      className="flex-1 py-3 rounded-xl text-white font-extrabold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                      style={{ backgroundColor: theme.primary }}
                    >
                      <span>تأكيد وطرق التواصل</span>
                      <span>➔</span>
                    </button>
                  </>
                )}

                {step === "confirm" && (
                  <button onClick={() => setStep("checkout")} className="w-full py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-bold text-xs">
                    رجوع وتعديل البيانات
                  </button>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

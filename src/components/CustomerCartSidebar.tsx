"use client";

import { useState } from "react";
import { useCart } from "@/lib/cart-context";
import { useSettings } from "@/lib/settings-context";
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
  const { items, removeItem, updateQuantity, clearCart, total, itemCount } = useCart();
  const { settings } = useSettings();
  const { addNotification } = useNotifications();
  const { logActivity } = useActivityLog();
  const theme = settings.roleThemes.customer;

  const [step, setStep] = useState<"cart" | "checkout" | "confirm" | "completed">("cart");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState(false);

  const deliveryFee = settings.defaultDeliveryFee ?? 5000;
  const deliveryDuration = settings.defaultDeliveryDuration || "2 - 3 أيام عمل";
  const grandTotal = total + deliveryFee;

  if (!isOpen) return null;

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
      // Automatically upgrade Anonymous guest ("مجهول X") to identified customer in database
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

      const serialStr = createdOrder.serialNumber
        ? formatInvoiceSerial(createdOrder)
        : `INV-2026-${createdOrder.id.substring(0, 4).toUpperCase()}`;

      const origin = typeof window !== "undefined" ? window.location.origin : "https://ahmed-bahri.com";
      const invoiceParam = createdOrder.serialNumber ? String(createdOrder.serialNumber) : createdOrder.id;
      const invoiceUrl = `${origin}/invoice/${invoiceParam}`;

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

  // Deep Link Launchers (STRICTLY TOWARDS STORE MANAGER / ADMIN RECIPIENTS)
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

    const finalSerial = insertedOrder && insertedOrder.serial_number
      ? `INV-2026-${String(insertedOrder.serial_number).padStart(4, "0")}`
      : invSerial;
    const finalInvoiceUrl = insertedOrder && insertedOrder.serial_number
      ? `${origin}/invoice/${insertedOrder.serial_number}`
      : invoiceUrl;

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
              </h2>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl">
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
                    <button onClick={onClose} className="px-6 py-2.5 rounded-xl text-white text-sm font-bold shadow-md" style={{ backgroundColor: theme.primary }}>
                      تصفح المنتجات وأضف للسلة
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {items.map((item) => (
                      <div key={item.productId} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700">
                        {item.image ? (
                          <img src={item.image} alt={item.name} className="w-16 h-16 rounded-xl object-cover border border-gray-200 dark:border-gray-700" />
                        ) : (
                          <div className="w-16 h-16 rounded-xl bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-2xl">📦</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-900 dark:text-white text-sm truncate">{item.name}</p>
                          {/* Tier label badge */}
                          {item.appliedTierLabel && item.appliedTierLabel !== "مفرد" && (
                            <span className="inline-block px-1.5 py-0.5 rounded-md text-[10px] font-extrabold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 mb-0.5">
                              🏷️ {item.appliedTierLabel}
                            </span>
                          )}
                          <div className="flex items-center gap-1">
                            {(item.appliedTierPrice && item.appliedTierPrice < item.retailPrice) && (
                              <span className="text-xs text-gray-400 line-through">
                                {item.retailPrice.toLocaleString()}
                              </span>
                            )}
                            <p className="text-xs font-extrabold mt-0.5" style={{ color: item.appliedTierPrice < item.retailPrice ? "#dc2626" : theme.primary }}>
                              {(item.appliedTierPrice ?? item.retailPrice).toLocaleString()} د.ع
                            </p>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 font-bold">
                            الإجمالي: {((item.appliedTierPrice ?? item.retailPrice) * item.quantity).toLocaleString()} د.ع
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                              className="w-6 h-6 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center font-bold text-xs hover:bg-gray-300"
                            >
                              -
                            </button>
                            <span className="text-xs font-bold text-gray-900 dark:text-white px-2">{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                              className="w-6 h-6 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center font-bold text-xs hover:bg-gray-300"
                            >
                              +
                            </button>
                          </div>
                        </div>
                        <button onClick={() => removeItem(item.productId)} className="text-red-500 hover:text-red-700 text-sm p-2" title="حذف">
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* STEP 2: CHECKOUT CUSTOMER DETAILS */}
            {step === "checkout" && (
              <div className="space-y-4">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl text-xs text-blue-800 dark:text-blue-300">
                  💡 يرجى ملء بياناتك أدناه لمتابعة اختيار طريقة التواصل وإرسال الطلب مباشرة.
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">الاسم الكامل: *</label>
                  <input
                    type="text"
                    required
                    placeholder="أدخل اسمك الكامل..."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">رقم الهاتف (للتواصل والشحن): *</label>
                  <input
                    type="tel"
                    required
                    placeholder="مثال: 07800000000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">المحافظة والعنوان التفصيلي: *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: بغداد - الكرادة - قرب المتنزه..."
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">ملاحظات إضافية (اختياري):</label>
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

            {/* STEP 3: CONTACT & CONFIRMATION MODAL */}
            {step === "confirm" && (
              <div className="space-y-5">
                {/* Order Details Summary Card */}
                <div className="bg-gray-50 dark:bg-gray-800/80 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-2 text-xs">
                  <div className="flex justify-between items-center font-bold text-sm text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
                    <span>ملخص الطلب والتوصيل</span>
                    <span className="text-blue-600 dark:text-blue-400 font-extrabold text-base">{grandTotal.toLocaleString()} د.ع</span>
                  </div>
                  <p className="text-gray-700 dark:text-gray-300"><b>الاسم:</b> {name}</p>
                  <p className="text-gray-700 dark:text-gray-300"><b>الهاتف:</b> {phone}</p>
                  <p className="text-gray-700 dark:text-gray-300"><b>العنوان:</b> {address}</p>
                  <p className="text-gray-700 dark:text-gray-300"><b>عدد المنتجات:</b> {items.length} منتج</p>
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-2 space-y-1">
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>مجموع المنتجات:</span>
                      <span className="font-bold">{total.toLocaleString()} د.ع</span>
                    </div>
                    <div className="flex justify-between text-blue-600 dark:text-blue-400 font-semibold">
                      <span>التوصيل والشحن ({deliveryDuration}):</span>
                      <span>{deliveryFee ? `${deliveryFee.toLocaleString()} د.ع` : "مجاني"}</span>
                    </div>
                  </div>
                </div>

                {copiedNotice && (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 animate-fadeIn">
                    📋 تم نسخ تفاصيل الطلب تلقائياً للحافظة! يمكنك لصقها مباشرة عند فتح المحادثة.
                  </div>
                )}

                <div>
                  <h3 className="font-bold text-sm text-gray-900 dark:text-white mb-3">اختر طريقة الطلب والتواصل المباشر:</h3>
                  
                  <div className="grid grid-cols-1 gap-3">
                    {/* WhatsApp Button */}
                    <button
                      onClick={handleWhatsApp}
                      disabled={submitting}
                      className="w-full flex items-center justify-between p-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl shadow-md transition-all hover:scale-[1.01] active:scale-[0.99]"
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

                    {/* Telegram Button */}
                    <button
                      onClick={handleTelegram}
                      disabled={submitting}
                      className="w-full flex items-center justify-between p-3.5 bg-sky-500 hover:bg-sky-600 text-white rounded-2xl shadow-md transition-all hover:scale-[1.01] active:scale-[0.99]"
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

                    {/* Messenger Button */}
                    <button
                      onClick={handleMessenger}
                      disabled={submitting}
                      className="w-full flex items-center justify-between p-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-md transition-all hover:scale-[1.01] active:scale-[0.99]"
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

                    {/* Direct Call Button */}
                    <button
                      onClick={handlePhoneCall}
                      disabled={submitting}
                      className="w-full flex items-center justify-between p-3.5 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl shadow-md transition-all hover:scale-[1.01] active:scale-[0.99]"
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

                <p className="text-[11px] text-gray-400 text-center pt-2">
                  ⚙️ تتم إدارة جميع روابط وأرقام التواصل ديناميكياً عبر لوحة الإدارة.
                </p>
              </div>
            )}

            {/* STEP 4: COMPLETED */}
            {step === "completed" && (
              <div className="text-center py-12 space-y-4">
                <span className="text-6xl block animate-bounce">🎉</span>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">تم تحويل الطلب بنجاح!</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
                  تم تسجيل طلبك في الإشعارات وإرسال التفاصيل مباشرة إلى إدارة المتجر. سنقوم بالتواصل معك قريباً لشحن الطلب.
                </p>
                <button
                  onClick={() => { setStep("cart"); onClose(); }}
                  className="px-6 py-2.5 rounded-xl text-white text-sm font-bold shadow-lg"
                  style={{ backgroundColor: theme.primary }}
                >
                  العودة للمتجر
                </button>
              </div>
            )}

          </div>

          {/* Footer Actions */}
          {items.length > 0 && step !== "completed" && (
            <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/80 space-y-3">
              <div className="flex justify-between items-center text-sm font-bold text-gray-900 dark:text-white">
                <span>الإجمالي الكلي:</span>
                <span className="text-lg text-blue-600 dark:text-blue-400">{total.toLocaleString()} د.ع</span>
              </div>

              {step === "cart" && (
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
                    className="flex-1 py-3 rounded-xl text-white font-bold text-sm shadow-lg hover:opacity-95 transition-opacity"
                    style={{ backgroundColor: theme.primary }}
                  >
                    إتمام الطلب (متابعة البيانات) ➔
                  </button>
                </div>
              )}

              {step === "checkout" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setStep("cart")}
                    className="px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300"
                  >
                    رجوع للسلة
                  </button>
                  <button
                    onClick={() => {
                      if (!name.trim() || !phone.trim() || !address.trim()) {
                        alert("يرجى ملء جميع الحقول المطلوبة (الاسم، الهاتف، العنوان)");
                        return;
                      }
                      setStep("confirm");
                    }}
                    className="flex-1 py-2.5 rounded-xl text-white font-bold text-xs shadow-lg hover:opacity-95 transition-opacity"
                    style={{ backgroundColor: theme.primary }}
                  >
                    متابعة اختيار طريقة الطلب ➔
                  </button>
                </div>
              )}

              {step === "confirm" && (
                <button
                  onClick={() => setStep("checkout")}
                  className="w-full py-2.5 border border-gray-300 dark:border-gray-700 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300"
                >
                  تعديل معلومات بيانات الزبون
                </button>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

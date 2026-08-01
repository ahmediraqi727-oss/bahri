"use client";

import { useState } from "react";
import { useCart } from "@/lib/cart-context";
import { useSettings } from "@/lib/settings-context";
import { useNotifications } from "@/lib/notifications";
import { useActivityLog } from "@/lib/activity-log";
import { Order } from "@/lib/order-types";
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

  if (!isOpen) return null;

  // Auto-formatted Order Message for Customer Communication
  const generateOrderMessage = () => {
    let msg = `📦 *طلب شراء جديد من متجر ${settings.siteName || "أحمد بحري"}*\n`;
    msg += `-------------------------------------------\n`;
    msg += `👤 *معلومات الزبون:*\n`;
    msg += `• الاسم: ${name.trim()}\n`;
    msg += `• رقم الهاتف: ${phone.trim()}\n`;
    msg += `• المحافظة والعنوان: ${address.trim()}\n`;
    if (notes.trim()) msg += `• ملاحظات إضافية: ${notes.trim()}\n`;
    msg += `\n🛍️ *تفاصيل المنتجات المطلوبة:*\n`;

    items.forEach((item, index) => {
      msg += `${index + 1}. *${item.name}*\n`;
      msg += `   • الكمية: ${item.quantity}\n`;
      msg += `   • السعر الفردي: ${item.retailPrice.toLocaleString()} د.ع\n`;
      msg += `   • الإجمالي: ${(item.retailPrice * item.quantity).toLocaleString()} د.ع\n`;
      if (item.image) msg += `   • رابط الصورة: ${item.image}\n`;
    });

    msg += `-------------------------------------------\n`;
    msg += `💰 *الإجمالي الكلي للطلب:* ${total.toLocaleString()} د.ع\n`;
    msg += `-------------------------------------------\n`;
    msg += `شكراً لكم! أتطلع لتأكيد الطلب والشحن.`;
    return msg;
  };

  // Helper to record order in Supabase and trigger Admin Real-Time Notification
  const recordOrderAndNotify = async (contactMethod: string) => {
    setSubmitting(true);
    try {
      const orderId = crypto.randomUUID();
      const orderData: Order = {
        id: orderId,
        customerName: name,
        customerPhone: phone,
        customerAddress: address,
        items: [...items],
        total,
        status: "pending",
        notes,
        createdAt: new Date().toISOString(),
      };

      // 1. Insert order into Supabase database
      await supabase.from("orders").insert({
        id: orderData.id,
        customer_name: orderData.customerName,
        customer_phone: orderData.customerPhone,
        customer_address: orderData.customerAddress,
        items: orderData.items,
        total: orderData.total,
        status: orderData.status,
        notes: orderData.notes,
        created_at: orderData.createdAt,
      });

      // 2. Real-time notification for Admin / Manager
      await addNotification({
        type: "info",
        title: `🛒 طلب جديد عبر (${contactMethod})`,
        message: `طلب من ${name} | الهاتف: ${phone} | المحافظة والعنوان: ${address} | عدد المنتجات: ${items.length} | الإجمالي: ${total.toLocaleString()} د.ع`,
        productId: orderId,
      });

      // 3. Log Activity
      await logActivity({
        user: "customer",
        action: "create",
        entity: "طلب زبون",
        entityId: orderId,
        details: `طلب من ${name} عبر ${contactMethod} - الهاتف: ${phone} - الإجمالي: ${total.toLocaleString()} د.ع`,
      });
    } catch (err) {
      console.warn("Order recording background error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  // Deep Link Launchers
  const handleWhatsApp = async () => {
    const msg = generateOrderMessage();
    let target = settings.whatsappLink?.trim() || "";
    let cleanPhone = target ? target.replace(/\D/g, "") : "";

    if (!cleanPhone && phone) {
      const p = phone.replace(/\D/g, "");
      cleanPhone = p.startsWith("0") ? "964" + p.slice(1) : p;
    }

    let url = "";
    if (target && target.startsWith("http")) {
      url = `${target}${target.includes("?") ? "&" : "?"}text=${encodeURIComponent(msg)}`;
    } else if (cleanPhone) {
      url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`;
    } else {
      url = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    }

    await recordOrderAndNotify("واتساب");
    window.open(url, "_blank");
    setStep("completed");
    clearCart();
  };

  const handleTelegram = async () => {
    const msg = generateOrderMessage();
    let target = settings.telegramLink?.trim() || "";
    let url = "";

    if (target && target.startsWith("http")) {
      url = `${target}${target.includes("?") ? "&" : "?"}text=${encodeURIComponent(msg)}`;
    } else if (target && target.startsWith("@")) {
      url = `https://t.me/${target.replace("@", "")}?text=${encodeURIComponent(msg)}`;
    } else if (target) {
      url = `https://t.me/${target}?text=${encodeURIComponent(msg)}`;
    } else {
      url = `https://t.me/share/url?url=${encodeURIComponent(typeof window !== "undefined" ? window.location.origin : "")}&text=${encodeURIComponent(msg)}`;
    }

    await recordOrderAndNotify("تليجرام");
    window.open(url, "_blank");
    setStep("completed");
    clearCart();
  };

  const handleMessenger = async () => {
    const msg = generateOrderMessage();
    let target = settings.messengerLink?.trim() || "";
    let url = "";

    if (target && target.startsWith("http")) {
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

    await recordOrderAndNotify("ماسنجر");
    window.open(url, "_blank");
    setStep("completed");
    clearCart();
  };

  const handlePhoneCall = async () => {
    let target = settings.phoneLink?.trim() || "07800000000";
    await recordOrderAndNotify("اتصال مباشر");
    window.location.href = `tel:${target}`;
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
                          <p className="text-xs text-blue-600 dark:text-blue-400 font-extrabold mt-0.5">
                            {item.retailPrice.toLocaleString()} د.ع
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
                    <span>ملخص الطلب</span>
                    <span className="text-blue-600 dark:text-blue-400">{total.toLocaleString()} د.ع</span>
                  </div>
                  <p className="text-gray-700 dark:text-gray-300"><b>الاسم:</b> {name}</p>
                  <p className="text-gray-700 dark:text-gray-300"><b>الهاتف:</b> {phone}</p>
                  <p className="text-gray-700 dark:text-gray-300"><b>العنوان:</b> {address}</p>
                  <p className="text-gray-700 dark:text-gray-300"><b>عدد المنتجات:</b> {items.length} منتج</p>
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
                <button
                  onClick={() => setStep("checkout")}
                  className="w-full py-3 rounded-xl text-white font-bold text-sm shadow-lg hover:opacity-95 transition-opacity"
                  style={{ backgroundColor: theme.primary }}
                >
                  إتمام الطلب (متابعة البيانات) ➔
                </button>
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

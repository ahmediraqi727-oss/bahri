"use client";

import { useState } from "react";
import { useCart } from "@/lib/cart-context";
import { useSettings } from "@/lib/settings-context";
import { useNotifications } from "@/lib/notifications";
import { useActivityLog } from "@/lib/activity-log";
import { useData } from "@/lib/data-context";
import { useSales } from "@/lib/sales-context";
import { Order } from "@/lib/order-types";
import jsPDF from "jspdf";

interface CartSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CartSidebar({ isOpen, onClose }: CartSidebarProps) {
  const { items, removeItem, updateQuantity, clearCart, total, itemCount } = useCart();
  const { settings } = useSettings();
  const { addNotification } = useNotifications();
  const { logActivity } = useActivityLog();
  const { products } = useData();
  const { addSale } = useSales();
  const theme = settings.roleThemes.customer;

  const [step, setStep] = useState<"cart" | "checkout" | "done">("cart");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const handleOrder = async () => {
    const order: Order = {
      id: crypto.randomUUID(),
      customerName: name,
      customerPhone: phone,
      customerAddress: address,
      items: [...items],
      total,
      status: "pending",
      notes,
      createdAt: new Date().toISOString(),
    };

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
    await addSale({
      customerName: name,
      customerPhone: phone,
      items: saleItems,
      total,
      cost: saleCost,
      profit: total - saleCost,
    });

    await addNotification({
      type: "info",
      title: "طلب جديد! 🛒",
      message: `طلب من ${name} - ${items.length} منتج - ${total.toLocaleString()} د.ع`,
      productId: order.id,
    });

    await logActivity({
      user: "customer",
      action: "create",
      entity: "طلب",
      entityId: order.id,
      details: `طلب جديد من ${name} (${phone}) - الإجمالي: ${total.toLocaleString()} د.ع`,
    });

    setStep("done");
  };

  const generateWhatsAppMessage = () => {
    let msg = `🛒 *طلب جديد - ${settings.siteName}*\n\n`;
    msg += `👤 *الزبون:* ${name}\n`;
    msg += `📞 *الهاتف:* ${phone}\n`;
    msg += `📍 *العنوان:* ${address}\n\n`;
    msg += `📦 *المنتجات:*\n`;
    items.forEach((item, i) => {
      msg += `${i + 1}. ${item.name} × ${item.quantity} = ${(item.retailPrice * item.quantity).toLocaleString()} د.ع\n`;
    });
    msg += `\n💰 *الإجمالي:* ${total.toLocaleString()} د.ع\n`;
    if (notes) msg += `\n📝 *ملاحظات:* ${notes}\n`;
    return msg;
  };

  const sendViaWhatsApp = () => {
    const msg = generateWhatsAppMessage();
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const sendViaTelegram = () => {
    const msg = generateWhatsAppMessage();
    window.open(`https://t.me/share/url?url=${encodeURIComponent(settings.siteName)}&text=${encodeURIComponent(msg)}`, "_blank");
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
    doc.text("فاتورة", pageWidth / 2, 26, { align: "center" });
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
              {step === "cart" ? `🛒 السلة (${itemCount})` : step === "checkout" ? "📝 تأكيد الطلب" : "✅ تم الطلب"}
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
                <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none" placeholder="الاسم الكامل" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">رقم الهاتف *</label>
                <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none" placeholder="07XX XXX XXXX" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">العنوان *</label>
                <input type="text" required value={address} onChange={(e) => setAddress(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none" placeholder="المدينة / الحي / الشارع" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">ملاحظات</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none resize-none" placeholder="ملاحظات إضافية..." />
              </div>

              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-2">
                {items.map((item) => (
                  <div key={item.productId} className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">{item.name} × {item.quantity}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{(item.retailPrice * item.quantity).toLocaleString()} د.ع</span>
                  </div>
                ))}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between font-bold">
                  <span className="text-gray-900 dark:text-white">الإجمالي</span>
                  <span style={{ color: theme.primary }}>{total.toLocaleString()} د.ع</span>
                </div>
              </div>
            </div>
          )}

          {step === "done" && (
            <div className="p-6 text-center space-y-6">
              <div className="text-6xl">✅</div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">تم استلام طلبك بنجاح!</h3>
              <p className="text-gray-500 dark:text-gray-400">سنتواصل معك قريباً لتأكيد الطلب</p>

              <div className="space-y-3">
                <button onClick={sendViaWhatsApp} className="w-full py-3 bg-[#25D366] text-white rounded-xl font-medium hover:bg-[#20BD5A] transition-colors flex items-center justify-center gap-2">
                  💬 إرسال عبر واتساب
                </button>
                <button onClick={sendViaTelegram} className="w-full py-3 bg-[#0088cc] text-white rounded-xl font-medium hover:bg-[#006da3] transition-colors flex items-center justify-center gap-2">
                  ✈️ إرسال عبر تليجرام
                </button>
                <button onClick={generatePDF} className="w-full py-3 bg-gray-700 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors flex items-center justify-center gap-2">
                  📄 تحميل الفاتورة PDF
                </button>
              </div>

              <button onClick={() => { clearCart(); setStep("cart"); setName(""); setPhone(""); setAddress(""); setNotes(""); onClose(); }} className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline">
                العودة للمتجر
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
            <button onClick={() => setStep("checkout")} className="w-full py-3 text-white rounded-xl font-medium hover:opacity-90 transition-opacity" style={{ backgroundColor: theme.primary }}>
              متابعة للطلب
            </button>
            <button onClick={clearCart} className="w-full py-2 text-sm text-red-500 hover:text-red-600 transition-colors">
              تفريغ السلة
            </button>
          </div>
        )}

        {step === "checkout" && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
            <button
              onClick={handleOrder}
              disabled={!name.trim() || !phone.trim() || !address.trim()}
              className="w-full py-3 text-white rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: theme.primary }}
            >
              تأكيد الطلب
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

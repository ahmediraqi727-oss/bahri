"use client";

import { useState } from "react";
import { Supplier } from "@/lib/types";

interface SupplierContactModalProps {
  supplier: Supplier;
  productName: string;
  currentStock: number;
  isOpen: boolean;
  onClose: () => void;
}

const CONTACT_METHODS = [
  {
    id: "whatsapp",
    label: "واتساب",
    icon: "💬",
    color: "#25D366",
    getUrl: (phone: string, msg: string) =>
      `https://wa.me/${phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(msg)}`,
  },
  {
    id: "telegram",
    label: "تليجرام",
    icon: "✈️",
    color: "#0088cc",
    getUrl: (phone: string, msg: string) =>
      `https://t.me/+${phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(msg)}`,
  },
  {
    id: "messenger",
    label: "ماسنجر",
    icon: "🔵",
    color: "#0078FF",
    getUrl: () => `https://m.me/`,
  },
  {
    id: "sms",
    label: "رسالة SMS",
    icon: "📱",
    color: "#6366f1",
    getUrl: (phone: string, msg: string) =>
      `sms:${phone}?body=${encodeURIComponent(msg)}`,
  },
  {
    id: "call",
    label: "اتصال مباشر",
    icon: "📞",
    color: "#ef4444",
    getUrl: (phone: string) => `tel:${phone}`,
  },
];

export default function SupplierContactModal({ supplier, productName, currentStock, isOpen, onClose }: SupplierContactModalProps) {
  const [quantity, setQuantity] = useState("10");
  const [customMessage, setCustomMessage] = useState("");

  if (!isOpen) return null;

  const defaultMessage = customMessage || `مرحباً ${supplier.name}،\n\nأحتاج توصيل طلب شحن:\n- المنتج: ${productName}\n- الكمية المطلوبة: ${quantity}\n\nفي انتظار تأكيدكم. شكرًا`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-md w-full border border-gray-200 dark:border-gray-700 shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">مراسلة المورد</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{supplier.name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Product Info */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-amber-600 dark:text-amber-400 font-medium text-sm">⚠️ منتج بكمية منخفضة</span>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <strong>{productName}</strong> - الكمية الحالية: <strong className="text-red-600">{currentStock}</strong>
            </p>
          </div>

          {/* Quantity */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">الكمية المطلوبة</label>
            <input
              type="number" min="1" value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none"
            />
          </div>

          {/* Custom Message */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">الرسالة (اختياري)</label>
            <textarea
              value={customMessage} onChange={(e) => setCustomMessage(e.target.value)} rows={4}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none resize-none text-sm"
              placeholder="اتركه فارغاً للرسالة الافتراضية"
            />
          </div>

          {/* Contact Methods */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">اختر طريقة التواصل</label>
            <div className="grid grid-cols-2 gap-2">
              {CONTACT_METHODS.map((method) => {
                const url = method.getUrl(supplier.phone, defaultMessage);
                const needsPhone = !supplier.phone && method.id !== "messenger";
                return (
                  <a
                    key={method.id}
                    href={needsPhone ? "#" : url}
                    target={method.id === "messenger" ? "_blank" : (method.id === "call" ? undefined : "_blank")}
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      if (needsPhone) {
                        e.preventDefault();
                        alert("رقم الهاتف غير مسجل لهذا المورد");
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all text-sm font-medium"
                    style={{ "--hover-bg": `${method.color}10` } as React.CSSProperties}
                  >
                    <span className="text-lg">{method.icon}</span>
                    <span className="text-gray-700 dark:text-gray-300">{method.label}</span>
                  </a>
                );
              })}
            </div>
          </div>

          {supplier.phone && (
            <p className="text-xs text-gray-400 text-center">
              📞 {supplier.phone}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase-client";
import { useSettings } from "@/lib/settings-context";
import { Order, CartItem, formatInvoiceSerial } from "@/lib/order-types";

export default function PublicInvoicePage() {
  const params = useParams();
  const rawId = (params?.id as string) || "";
  const { settings } = useSettings();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!rawId) return;

    async function fetchOrder() {
      setLoading(true);
      try {
        let query = supabase.from("orders").select("*");

        const numericVal = parseInt(rawId.replace(/\D/g, ""), 10);

        if (!isNaN(numericVal) && (rawId.startsWith("INV-") || !isNaN(Number(rawId)))) {
          query = query.or(`serial_number.eq.${numericVal},id.eq.${rawId},invoice_serial.eq.${rawId}`);
        } else {
          query = query.or(`id.eq.${rawId},invoice_serial.eq.${rawId}`);
        }

        const { data, error } = await query.maybeSingle();

        if (error || !data) {
          // Retry search with ilike id fallback
          const { data: retryData } = await supabase
            .from("orders")
            .select("*")
            .ilike("id", `${rawId}%`)
            .maybeSingle();

          if (retryData) {
            mapAndSetOrder(retryData);
          } else {
            setNotFound(true);
          }
        } else {
          mapAndSetOrder(data);
        }
      } catch (err) {
        console.error("Invoice fetch exception:", err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }

    function mapAndSetOrder(r: any) {
      setOrder({
        id: r.id,
        serialNumber: r.serial_number ? Number(r.serial_number) : undefined,
        customerName: r.customer_name || "زبون",
        customerPhone: r.customer_phone || "",
        customerAddress: r.customer_address || "",
        items: (r.items as CartItem[]) || [],
        total: Number(r.total) || 0,
        deliveryFee: Number(r.delivery_fee) || 0,
        deliveryDuration: r.delivery_duration || "",
        status: r.status || "pending",
        notes: r.notes || "",
        createdAt: r.created_at || new Date().toISOString(),
      });
    }

    fetchOrder();
  }, [rawId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4 font-sans" dir="rtl">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-200 text-center space-y-4 max-w-sm w-full">
          <div className="w-12 h-12 border-4 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <h2 className="font-extrabold text-gray-800 text-base">جارٍ تحميل الفاتورة الرسمية...</h2>
          <p className="text-xs text-gray-400">الرجاء الانتظار لحين جلب البيانات من السجل</p>
        </div>
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4 font-sans" dir="rtl">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-200 text-center space-y-4 max-w-md w-full">
          <span className="text-6xl block">📄🚫</span>
          <h2 className="font-extrabold text-gray-900 text-lg">لم يتم العثور على الفاتورة</h2>
          <p className="text-xs text-gray-500 leading-relaxed">
            عذراً، الفاتورة المطلوبة برقم <code className="bg-gray-100 px-2 py-0.5 rounded text-violet-700 font-mono">{rawId}</code> غير مسجلة للنظام أو تم حذفها.
          </p>
          <Link
            href="/"
            className="inline-block px-6 py-2.5 rounded-xl bg-violet-600 text-white text-xs font-bold shadow-md hover:bg-violet-700 transition-all"
          >
            🏠 العودة للرئيسية
          </Link>
        </div>
      </div>
    );
  }

  const invoiceSerialStr = formatInvoiceSerial(order);
  const itemsSubtotal = order.items.reduce(
    (sum, item) => sum + (item.appliedTierPrice ?? item.retailPrice) * item.quantity,
    0
  );
  const formattedDate = new Date(order.createdAt).toLocaleDateString("ar-IQ", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const pageUrl = typeof window !== "undefined" ? window.location.href : "";
  const shareText = `🧾 فاتورة مبيعات رسمية - متجر ${settings.siteName || "أحمد بحري"}\nرقم الفاتورة: ${invoiceSerialStr}\nالإجمالي: ${order.total.toLocaleString()} د.ع\nمعاينة الفاتورة: ${pageUrl}`;

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 py-6 sm:py-10 px-3 sm:px-6 font-sans text-gray-900" dir="rtl">
      {/* Floating Action Bar (Non-Printable) */}
      <div className="no-print max-w-4xl mx-auto mb-6 bg-white dark:bg-gray-900 p-3 sm:p-4 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🧾</span>
          <div>
            <h1 className="font-extrabold text-sm sm:text-base text-gray-900 dark:text-white">معاينة الفاتورة الرسمية</h1>
            <p className="text-[11px] text-gray-400">رقم الفاتورة: <span className="font-mono font-bold text-violet-600">{invoiceSerialStr}</span></p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => window.print()}
            className="px-4 py-2 rounded-xl bg-violet-600 text-white font-extrabold text-xs shadow-md hover:bg-violet-700 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span>🖨️</span>
            <span>طباعة الفاتورة</span>
          </button>
          <a
            href={`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-extrabold text-xs shadow-md hover:bg-emerald-700 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span>💬</span>
            <span>مشاركة عبر الواتساب</span>
          </a>
          <Link
            href="/"
            className="px-4 py-2 rounded-xl bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold text-xs hover:bg-gray-300 transition-all flex items-center gap-1.5"
          >
            <span>🏠</span>
            <span>العودة للمتجر</span>
          </Link>
        </div>
      </div>

      {/* A4 Sheet Container */}
      <div className="print-shadow-none max-w-[800px] mx-auto bg-white text-gray-900 shadow-2xl rounded-3xl border border-gray-200 p-6 sm:p-10 relative overflow-hidden">
        {/* Background Watermark Logo */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-[0.04] z-0 select-none">
          {settings.logo ? (
            <img
              src={settings.logo}
              alt="Watermark"
              className="w-[450px] h-[450px] object-contain grayscale"
            />
          ) : (
            <span className="text-[240px]">🧾</span>
          )}
        </div>

        <div className="relative z-10 space-y-6">
          {/* Header Layout */}
          <div className="flex items-start justify-between border-b-2 border-gray-100 pb-6 gap-4">
            {/* Right: Store Branding */}
            <div className="flex items-center gap-3.5">
              {settings.logo ? (
                <img
                  src={settings.logo}
                  alt={settings.siteName || "الشعار"}
                  className="w-16 h-16 rounded-2xl object-cover border border-violet-100 shadow-sm flex-shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white text-3xl font-extrabold flex items-center justify-center shadow-md flex-shrink-0">
                  🛍️
                </div>
              )}
              <div>
                <h2 className="text-lg sm:text-xl font-black text-gray-900">
                  {settings.siteName || settings.storeName || "متجر أحمد بحري"}
                </h2>
                <p className="text-xs font-bold text-violet-700 mt-0.5">فاتورة مبيعات رسمية وموثقة</p>
                <p className="text-[11px] text-gray-500 mt-1">
                  📍 {settings.storeAddress || "العراق - كركوك - احمد اغا - قرب الدفاع المدنى رابع متجر"}
                </p>
                <p className="text-[11px] text-gray-500">
                  📞 الهاتف: <span className="font-mono">{settings.phonePrimary || "07706166725"}</span>
                </p>
              </div>
            </div>

            {/* Left: Invoice Serial & Date Badge */}
            <div className="text-left space-y-1.5 flex-shrink-0">
              <div className="inline-block px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-mono font-extrabold text-xs sm:text-sm shadow-sm">
                {invoiceSerialStr}
              </div>
              <p className="text-[11px] text-gray-400 font-medium">تاريخ الإصدار:</p>
              <p className="text-xs font-bold text-gray-700 dir-ltr">{formattedDate}</p>
            </div>
          </div>

          {/* Customer Information Grid Box */}
          <div className="bg-gray-50/80 border border-gray-200/80 rounded-2xl p-4 sm:p-5">
            <h3 className="text-xs font-extrabold text-violet-900 border-b border-gray-200/60 pb-2 mb-3 flex items-center gap-1.5">
              <span>👤</span>
              <span>بيانات الزبون والشحن</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-gray-400 block text-[11px]">الاسم الكريم:</span>
                <span className="font-extrabold text-gray-900 text-sm">{order.customerName}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">رقم الهاتف:</span>
                <span className="font-bold text-gray-900 font-mono text-sm">{order.customerPhone}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">المحافظة والعنوان المفصل:</span>
                <span className="font-semibold text-gray-800">{order.customerAddress}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">مدة التوصيل المتوقعة:</span>
                <span className="font-semibold text-gray-800">{order.deliveryDuration || settings.defaultDeliveryDuration || "2 - 3 أيام عمل"}</span>
              </div>
              {order.notes && (
                <div className="sm:col-span-2 pt-1 border-t border-gray-200/50">
                  <span className="text-gray-400 block text-[11px]">ملاحظات إضافية:</span>
                  <span className="font-medium text-gray-700">{order.notes}</span>
                </div>
              )}
            </div>
          </div>

          {/* Items Table */}
          <div className="overflow-x-auto rounded-2xl border border-gray-200">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-gradient-to-r from-gray-100 to-gray-50 text-gray-700 font-extrabold border-b border-gray-200">
                  <th className="py-3 px-3 text-center w-10">#</th>
                  <th className="py-3 px-3 text-center w-14">الصورة</th>
                  <th className="py-3 px-4">اسم المنتج المطلوبة</th>
                  <th className="py-3 px-3 text-center">السعر الفردي</th>
                  <th className="py-3 px-3 text-center w-16">الكمية</th>
                  <th className="py-3 px-4 text-left">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {order.items.map((item, idx) => {
                  const unitPrice = item.appliedTierPrice ?? item.retailPrice;
                  const itemTotal = unitPrice * item.quantity;
                  const hasValidImg = Boolean(item.image && typeof item.image === "string" && item.image.trim().length > 5);

                  return (
                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-3 px-3 text-center text-gray-400 font-bold">{idx + 1}</td>
                      <td className="py-3 px-3 text-center">
                        {hasValidImg ? (
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-9 h-9 rounded-lg object-cover border border-gray-200 mx-auto"
                          />
                        ) : (
                          <span className="text-xl">📦</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-bold text-gray-900">
                        <div>{item.name}</div>
                        {item.appliedTierLabel && item.appliedTierLabel !== "مفرد" && (
                          <span className="text-[10px] font-semibold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                            {item.appliedTierLabel}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center font-semibold text-gray-700 font-mono">
                        {unitPrice.toLocaleString()} د.ع
                      </td>
                      <td className="py-3 px-3 text-center font-extrabold text-gray-900 bg-gray-50/50 rounded-lg">
                        {item.quantity}
                      </td>
                      <td className="py-3 px-4 text-left font-extrabold text-gray-900 font-mono">
                        {itemTotal.toLocaleString()} د.ع
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary Breakdown & Terms */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-gray-100 items-start">
            {/* Terms & Notes */}
            <div className="bg-gray-50/60 rounded-2xl p-4 border border-gray-200/60 space-y-1.5 text-[11px] text-gray-500 leading-relaxed">
              <p className="font-bold text-gray-700">📌 شروط وضمانات الاستلام:</p>
              <p>• يرجى معاينة شحنة المنتجات وتفحص سلامتها عند استلامها من مندوب التوصيل.</p>
              <p>• كافة المنتجات مضمونة ومطابقة للمواصفات المعروضة في متجر أحمد بحري.</p>
              <p className="text-violet-700 font-bold mt-2">شكراً لثقتكم بنا وتسوقكم من متجرنا! 🙏</p>
            </div>

            {/* Price Calculations Box */}
            <div className="bg-gradient-to-br from-violet-50/60 to-indigo-50/40 rounded-2xl p-4 border border-violet-100 space-y-2.5 text-xs">
              <div className="flex justify-between items-center text-gray-600">
                <span>مجموع المنتجات:</span>
                <span className="font-bold font-mono text-gray-900">{itemsSubtotal.toLocaleString()} د.ع</span>
              </div>

              <div className="flex justify-between items-center text-gray-600">
                <span>أجور الشحن والتوصيل ({order.deliveryDuration || "2-3 أيام"}):</span>
                <span className="font-bold font-mono text-gray-900">
                  {order.deliveryFee ? `${order.deliveryFee.toLocaleString()} د.ع` : "مجاني"}
                </span>
              </div>

              <div className="border-t border-violet-200/60 pt-2.5 flex justify-between items-center text-sm font-black text-violet-950">
                <span>المبلغ الإجمالي النهائي المطلوب:</span>
                <span className="text-base font-mono text-violet-700 bg-white px-3 py-1 rounded-xl shadow-xs border border-violet-200">
                  {order.total.toLocaleString()} د.ع
                </span>
              </div>
            </div>
          </div>

          {/* Footer Bar */}
          <div className="text-center pt-6 border-t border-gray-100 text-[11px] text-gray-400 space-y-1">
            <p className="font-bold text-gray-600">{settings.siteName || "متجر أحمد بحري"} - نظام الفواتير الإلكترونية المعتمد</p>
            <p>عنوان المحل: {settings.storeAddress || "كركوك - احمد اغا"} | الهاتف الرئيسي: {settings.phonePrimary || "07706166725"}</p>
          </div>
        </div>
      </div>

      {/* Print Specific CSS */}
      <style jsx global>{`
        @media print {
          body {
            background-color: white !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          .print-shadow-none {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            max-width: 100% !important;
            border-radius: 0 !important;
            padding: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}

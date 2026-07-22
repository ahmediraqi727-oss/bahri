"use client";

import { useState, useRef, useEffect } from "react";
import { useData } from "@/lib/data-context";
import { useSettings } from "@/lib/settings-context";
import { useActivityLog } from "@/lib/activity-log";
import { useTrash } from "@/lib/trash";
import { useNotifications } from "@/lib/notifications";
import { useRouter } from "next/navigation";

interface Message {
  id: string;
  text: string;
  isBot: boolean;
  timestamp: Date;
}

const QUICK_ACTIONS = [
  { label: "📊 ملخص المخزون", value: "stock_summary" },
  { label: "⚠️ تنبيهات المخزون", value: "low_stock" },
  { label: "📝 آخر الحركات", value: "recent_activity" },
  { label: "📦 إضافة منتج", value: "add_product" },
  { label: "💰 حساب الأرباح", value: "profits" },
  { label: "🧹 تنظيف السلة", value: "clean_trash" },
];

export default function DashboardAssistant() {
  const { products, suppliers } = useData();
  const { settings } = useSettings();
  const { activities } = useActivityLog();
  const { items: trashItems, purgeExpired } = useTrash();
  const { notifications, unreadCount } = useNotifications();
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (isOpen && !initialized.current) {
      initialized.current = true;
      setMessages([
        { id: crypto.randomUUID(), text: `مرحباً يا ${settings.currentRole === "manager" ? "المدير" : "الإداري"}! 👋`, isBot: true, timestamp: new Date() },
        { id: crypto.randomUUID(), text: "أنا مساعدك الذكي في إدارة النظام. كيف أقدر أساعدك؟", isBot: true, timestamp: new Date() },
      ]);
    }
  }, [isOpen, settings.currentRole]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const addBotMessage = (text: string) => {
    setIsTyping(true);
    setTimeout(() => {
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), text, isBot: true, timestamp: new Date() }]);
      setIsTyping(false);
    }, 400 + Math.random() * 400);
  };

  const handleQuickAction = async (action: string) => {
    const label = QUICK_ACTIONS.find((a) => a.value === action)?.label || action;
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), text: label, isBot: false, timestamp: new Date() }]);

    switch (action) {
      case "stock_summary": {
        const total = products.length;
        const totalValue = products.reduce((s, p) => s + p.retailPrice * p.stock, 0);
        const outOfStock = products.filter((p) => p.stock === 0).length;
        const avgStock = total > 0 ? Math.round(products.reduce((s, p) => s + p.stock, 0) / total) : 0;
        addBotMessage(`📊 ملخص المخزون:\n\n📦 إجمالي المنتجات: ${total}\n💰 إجمالي القيمة: ${totalValue.toLocaleString()} د.ع\n📉 منتجات نافدة: ${outOfStock}\n📈 متوسط الكمية: ${avgStock}\n🚚 عدد الموردين: ${suppliers.length}`);
        break;
      }
      case "low_stock": {
        const low = products.filter((p) => p.stock <= 10 && p.stock > 0);
        const out = products.filter((p) => p.stock === 0);
        if (low.length === 0 && out.length === 0) {
          addBotMessage("✅ لا توجد تنبيهات مخزون حالياً. كل شيء ممتاز!");
        } else {
          let msg = "";
          if (out.length > 0) {
            msg += `🔴 نفد بالكامل (${out.length}):\n${out.map((p) => `  • ${p.name}`).join("\n")}\n\n`;
          }
          if (low.length > 0) {
            msg += `🟡 كمية منخفضة (${low.length}):\n${low.map((p) => `  • ${p.name}: ${p.stock}`).join("\n")}`;
          }
          addBotMessage(msg);
        }
        break;
      }
      case "recent_activity": {
        if (activities.length === 0) {
          addBotMessage("📝 لا توجد حركات مسجلة بعد.");
        } else {
          const recent = activities.slice(0, 5).map((a) => {
            const icons: Record<string, string> = { create: "➕", update: "✏️", delete: "🗑️", import: "📥", export: "📤", restore: "♻️", login: "🔑" };
            return `${icons[a.action] || "•"} ${a.details}`;
          }).join("\n");
          addBotMessage(`📝 آخر ${Math.min(5, activities.length)} حركات:\n\n${recent}`);
        }
        break;
      }
      case "add_product": {
        addBotMessage("📦 جارِ تحويلك لصفحة المنتجات...\n\nاضغط على زر '+ إضافة منتج' في الصفحة.");
        setTimeout(() => router.push("/dashboard/products"), 500);
        break;
      }
      case "profits": {
        const totalCost = products.reduce((s, p) => s + p.costPrice * p.stock, 0);
        const totalRetail = products.reduce((s, p) => s + p.retailPrice * p.stock, 0);
        const potentialProfit = totalRetail - totalCost;
        addBotMessage(`💰 تقرير الأرباح المحتملة:\n\n📦 تكلفة المخزون: ${totalCost.toLocaleString()} د.ع\n💵 قيمة المخزون (بيع): ${totalRetail.toLocaleString()} د.ع\n📈 الربح المحتمل: ${potentialProfit.toLocaleString()} د.ع\n📊 هامش الربح: ${totalCost > 0 ? Math.round((potentialProfit / totalCost) * 100) : 0}%`);
        break;
      }
      case "clean_trash": {
        if (trashItems.length === 0) {
          addBotMessage("🧹 سلة المهملات فارغة بالفعل!");
        } else {
          const count = await purgeExpired();
          addBotMessage(`🧹 تم فحص سلة المهملات:\n\n📦 العناصر الحالية: ${trashItems.length}\n🗑️ تم حذف المنتهي: ${count} عنصر`);
        }
        break;
      }
    }
  };

  const processMessage = (text: string) => {
    const q = text.toLowerCase().trim();

    if (q.includes("مخزون") || q.includes("stock") || q.includes("كمية")) {
      handleQuickAction("stock_summary");
    } else if (q.includes("تنبيه") || q.includes("منخفض") || q.includes("نفد") || q.includes(".low")) {
      handleQuickAction("low_stock");
    } else if (q.includes("حركات") || q.includes("سجل") || q.includes("activity")) {
      handleQuickAction("recent_activity");
    } else if (q.includes("ربح") || q.includes("أرباح") || q.includes("مال") || q.includes("income")) {
      handleQuickAction("profits");
    } else if (q.includes("منتج") && (q.includes("إضافة") || q.includes("جديد") || q.includes("add"))) {
      handleQuickAction("add_product");
    } else if (q.includes("سلة") || q.includes("حذف") || q.includes("تنظيف")) {
      handleQuickAction("clean_trash");
    } else if (q.includes("مورد")) {
      const list = suppliers.slice(0, 5).map((s) => `• ${s.name} ${s.phone ? `📞 ${s.phone}` : ""}`).join("\n");
      addBotMessage(`🚚 الموردين (${suppliers.length}):\n\n${list || "لا يوجد موردين مسجلين."}`);
    } else if (q.includes("مرحبا") || q.includes("سلام")) {
      addBotMessage(`أهلاً! 👋 اليوم يومك. كيف أقدر أساعدك؟`);
    } else if (q.includes("skór") || q.includes("help") || q.includes("مساعدة")) {
      addBotMessage(`💡 أوامر متاحة:\n\n• "مخزون" - ملخص المخزون\n• "تنبيهات" - تنبيهات المخزون\n• "حركات" - آخر الحركات\n• "أرباح" - تقرير الأرباح\n• "إضافة منتج" - الانتقال لصفحة المنتجات\n• "مورد" - عرض الموردين\n• "تنظيف" - تنظيف سلة المهملات`);
    } else {
      const matched = products.filter((p) => p.name.toLowerCase().includes(q));
      if (matched.length > 0) {
        const list = matched.slice(0, 5).map((p) => `• ${p.name}: ${p.stock} قطعة | ${p.retailPrice.toLocaleString()} د.ع`).join("\n");
        addBotMessage(`📦 نتائج البحث (${matched.length}):\n\n${list}`);
      } else {
        addBotMessage(`لم أفهم الأمر. جرّب كتابة:\n\n• "مخزون" أو "أرباح" أو "تنبيهات"\n• أو اسم منتج للبحث\n• أو "مساعدة" لقائمة الأوامر`);
      }
    }
  };

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), text: input, isBot: false, timestamp: new Date() }]);
    const text = input;
    setInput("");
    processMessage(text);
  };

  const theme = settings.roleThemes[settings.currentRole];

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 left-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white text-2xl hover:scale-110 transition-transform"
        style={{ backgroundColor: theme.primary }}
        title="المساعد الذكي"
      >
        {isOpen ? "✕" : "🤖"}
        {!isOpen && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed bottom-24 left-6 z-50 w-80 sm:w-96 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col" style={{ maxHeight: "500px" }}>
          <div className="p-4 text-white flex items-center gap-3" style={{ backgroundColor: theme.primary }}>
            <img src="/logo.jpg" alt="شعار" className="w-10 h-10 rounded-full object-cover shadow-md" />
            <div>
              <h3 className="font-bold text-sm">مساعد الإدارة</h3>
              <p className="text-xs text-white/80">{settings.siteName}</p>
            </div>
            {unreadCount > 0 && (
              <span className="mr-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{unreadCount} إشعار</span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[250px] max-h-[320px]">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.isBot ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-line ${
                  msg.isBot
                    ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-br-md"
                    : "text-white rounded-bl-md"
                }`} style={!msg.isBot ? { backgroundColor: theme.primary } : {}}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 rounded-2xl rounded-br-md">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {messages.length <= 3 && (
            <div className="px-4 pb-2 flex flex-wrap gap-1.5">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.value}
                  onClick={() => {
                    setMessages((prev) => [...prev, { id: crypto.randomUUID(), text: action.label, isBot: false, timestamp: new Date() }]);
                    handleQuickAction(action.value);
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-full border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}

          <div className="p-3 border-t border-gray-200 dark:border-gray-700">
            <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2">
              <input
                type="text" value={input} onChange={(e) => setInput(e.target.value)}
                placeholder="اكتب أمراً أو سؤال..."
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-full bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-[var(--primary)] outline-none"
              />
              <button type="submit" className="w-9 h-9 rounded-full text-white flex items-center justify-center text-sm hover:opacity-90" style={{ backgroundColor: theme.primary }}>
                ➤
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

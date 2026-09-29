"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
  isError?: boolean;
}

const QUICK_ACTIONS = [
  { label: "📊 ملخص المخزون", prompt: "أعطني ملخصاً شاملاً ودقيقاً عن المخزون الحالي وقيمته المالية وتوزيع المنتجات." },
  { label: "⚠️ تنبيهات المخزون", prompt: "ما هي المنتجات التي أوشكت على النفاد أو كميتها صفر وتحتاج إلى إعادة تعبئة عاجلة؟" },
  { label: "💰 حساب الأرباح", prompt: "قدم لي تحليلاً للأرباح المتوقعة وهوامش الربح بين سعر التكلفة وسعر البيع بالمفرد والجملة." },
  { label: "📦 إضافة منتج", prompt: "كيف أقوم بإضافة منتج جديد وتعيين كود الباركود وتحديد الأسعار بالطريقة الصحيحة؟", directAction: "add_product" },
  { label: "📝 آخر الحركات", prompt: "ما هي آخر العمليات والتعديلات المسجلة في سجل النظام؟", directAction: "recent_activity" },
  { label: "🧹 تنظيف السلة", prompt: "افحص حالة سلة المهملات واقترح تنظيف العناصر القديمة غير المستخدمة.", directAction: "clean_trash" },
];

// Helper to render simple Markdown (bold, bullet points, headers, inline code)
function FormattedMessageText({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-right select-text break-words">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1.5" />;
        }

        // Header ###
        if (trimmed.startsWith("### ")) {
          return (
            <h4 key={idx} className="font-bold text-base text-gray-900 dark:text-white pt-1">
              {trimmed.replace(/^###\s+/, "")}
            </h4>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h3 key={idx} className="font-extrabold text-base text-gray-900 dark:text-white pt-1.5 border-b border-gray-200/50 dark:border-gray-700/50 pb-0.5">
              {trimmed.replace(/^##\s+/, "")}
            </h3>
          );
        }

        // Bullet point
        const isBullet = trimmed.startsWith("• ") || trimmed.startsWith("- ") || trimmed.startsWith("* ");
        const content = isBullet ? trimmed.replace(/^[•\-*]\s+/, "") : line;

        // Render inline bold, code, and text
        const renderedContent = parseInlineStyles(content);

        if (isBullet) {
          return (
            <div key={idx} className="flex items-start gap-1.5 pr-1">
              <span className="text-violet-500 font-bold select-none text-xs mt-1">●</span>
              <span className="flex-1">{renderedContent}</span>
            </div>
          );
        }

        return <p key={idx}>{renderedContent}</p>;
      })}
    </div>
  );
}

function parseInlineStyles(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-bold text-gray-950 dark:text-gray-100">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={index}
          className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-violet-700 dark:text-violet-300 font-mono text-xs"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

export default function DashboardAssistant() {
  const { products, suppliers, categories } = useData();
  const { settings } = useSettings();
  const { activities } = useActivityLog();
  const { items: trashItems, purgeExpired } = useTrash();
  const { unreadCount } = useNotifications();
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      id: "welcome-1",
      text: "مرحباً بك في مساعد الإدارة الذكي لـ متجر أحمد بحري! 👋",
      isBot: true,
      timestamp: new Date(),
    },
    {
      id: "welcome-2",
      text: "أنا مساعد الإدارة الذكي المدعوم بنموذج Google Gemini.\nجاهز لتحليل بيانات المخزون، فواتير المبيعات، حساب الأرباح، وتوجيهك في لوحة التحكم. كيف أقدر أساعدك اليوم؟",
      isBot: true,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Compute live store context snapshot to ground Gemini with current figures
  const storeContextSnapshot = useMemo(() => {
    const total = products.length;
    const totalRetail = products.reduce((s, p) => s + (p.retailPrice || 0) * (p.stock || 0), 0);
    const totalCost = products.reduce((s, p) => s + (p.costPrice || 0) * (p.stock || 0), 0);
    const outOfStock = products.filter((p) => p.stock === 0);
    const lowStock = products.filter((p) => p.stock > 0 && p.stock <= 10);

    const topLow = [...outOfStock, ...lowStock].slice(0, 10).map((p) => ({
      name: p.name,
      stock: p.stock,
      retailPrice: p.retailPrice,
    }));

    const recentAct = activities.slice(0, 6).map((a) => `${a.action}: ${a.details} (${a.entity})`);

    return {
      role: settings.currentRole,
      userName: settings.currentRole === "manager" ? "أحمد العراقي (المدير)" : "ahmed al adeeb (إداري)",
      totalProducts: total,
      totalInventoryRetailValue: totalRetail,
      totalInventoryCostValue: totalCost,
      outOfStockCount: outOfStock.length,
      lowStockCount: outOfStock.length + lowStock.length,
      suppliersCount: suppliers.length,
      categoriesCount: categories.length,
      topLowStockProducts: topLow,
      recentActivitiesSummary: recentAct,
      unreadNotificationsCount: unreadCount,
    };
  }, [products, suppliers, categories, activities, settings.currentRole, unreadCount]);

  // Auto scroll down smoothly on message changes or streaming tokens
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating, scrollToBottom]);

  // Send request to Gemini API streaming endpoint
  const sendToGemini = async (userText: string) => {
    const cleanText = userText.trim();
    if (!cleanText || isGenerating) return;

    const userMessageId = crypto.randomUUID();
    const botMessageId = crypto.randomUUID();

    const userMsg: Message = {
      id: userMessageId,
      text: cleanText,
      isBot: false,
      timestamp: new Date(),
    };

    const botMsg: Message = {
      id: botMessageId,
      text: "",
      isBot: true,
      timestamp: new Date(),
    };

    // 1. Immediately add both user message and empty bot thinking message to state
    setMessages((prev) => [...prev, userMsg, botMsg]);
    setInput("");
    setIsGenerating(true);
    setActiveStreamId(botMessageId);

    // Create abort controller to allow user stopping
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Build conversation payload for Gemini
      const currentHistory = [...messages, userMsg];
      const conversationPayload = currentHistory.map((m) => ({
        role: m.isBot ? "model" : "user",
        content: m.text,
      }));

      const res = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: conversationPayload,
          prompt: cleanText,
          storeContext: storeContextSnapshot,
        }),
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.error || `خطأ في الاتصال بالخادم (${res.status})`);
      }

      if (!res.body) {
        throw new Error("لم يتم استلام تدفق بيانات من الخادم");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        accumulatedText += chunk;

        // Update the bot message in real-time
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === botMessageId ? { ...msg, text: accumulatedText } : msg
          )
        );
      }

      // If finished and still empty
      if (!accumulatedText.trim()) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === botMessageId
              ? { ...msg, text: "عذراً، لم أتمكن من الحصول على إجابة واضحة. يرجى إعادة صياغة السؤال." }
              : msg
          )
        );
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") {
        console.log("Gemini stream aborted by user");
        return;
      }

      console.error("AI Assistant stream error:", err);
      const errMsg = err instanceof Error ? err.message : String(err);

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === botMessageId
            ? {
                ...msg,
                isError: true,
                text: `⚠️ عذراً، حدث خطأ أثناء معالجة السؤال.\nالتفاصيل: ${errMsg}\n\nيرجى المحاولة مرة أخرى أو فحص الاتصال بالإنترنت.`,
              }
            : msg
        )
      );
    } finally {
      setIsGenerating(false);
      setActiveStreamId(null);
      abortControllerRef.current = null;
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
      setActiveStreamId(null);
    }
  };

  const handleQuickAction = async (action: (typeof QUICK_ACTIONS)[0]) => {
    if (isGenerating) return;

    if (action.directAction === "add_product") {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), text: action.label, isBot: false, timestamp: new Date() },
        {
          id: crypto.randomUUID(),
          text: "📦 جارٍ تحويلك مباشرة إلى صفحة إدارة المنتجات...\nيمكنك الضغط على زر '+ إضافة منتج' لإدخال تفاصيل القطعة وصورها وتوليد باركود تلقائي.",
          isBot: true,
          timestamp: new Date(),
        },
      ]);
      setTimeout(() => router.push("/dashboard/products"), 600);
      return;
    }

    if (action.directAction === "clean_trash") {
      if (trashItems.length === 0) {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), text: action.label, isBot: false, timestamp: new Date() },
          { id: crypto.randomUUID(), text: "🧹 سلة المهملات فارغة تماماً ولا توجد عناصر منتهية الصلاحية لحذفها.", isBot: true, timestamp: new Date() },
        ]);
      } else {
        const count = await purgeExpired();
        sendToGemini(
          `تم فحص سلة المهملات: إجمالي العناصر المحذوفة ${trashItems.length}، وتم تنظيف ${count} عنصر منتهي الصلاحية تلقائياً. لخص حالة السلة وقدم نصيحة للإدارة.`
        );
      }
      return;
    }

    // Default: pass prompt to Gemini with rich store snapshot
    sendToGemini(action.prompt);
  };

  const handleClearHistory = () => {
    if (isGenerating) handleStopGeneration();
    setMessages([
      {
        id: crypto.randomUUID(),
        text: "تم مسح المحادثة السابقة. أنا هنا لمساعدتك في أي استفسار يخص متجر أحمد بحري!",
        isBot: true,
        timestamp: new Date(),
      },
    ]);
  };

  const currentRole = settings?.currentRole || "manager";
  const theme = settings?.roleThemes?.[currentRole] || {
    primary: "#1e40af",
    secondary: "#7c3aed",
    accent: "#f59e0b",
  };

  return (
    <>
      {/* Floating Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 left-6 z-50 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center text-white text-2xl hover:scale-110 active:scale-95 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-4 focus:ring-violet-400/40"
        style={{
          background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary || "#7c3aed"})`,
        }}
        title="مساعد الإدارة الذكي (Google Gemini)"
        aria-label="مساعد الإدارة الذكي"
      >
        {isOpen ? "✕" : "🤖"}
        {!isOpen && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-red-600 text-white text-[11px] font-extrabold rounded-full flex items-center justify-center shadow-md animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Chat Window Container */}
      {isOpen && (
        <div
          className="fixed bottom-24 left-4 sm:left-6 z-50 w-[calc(100vw-2rem)] sm:w-96 bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col transition-all duration-300 animate-scaleUp"
          style={{ height: "540px", maxHeight: "calc(100vh - 120px)" }}
          dir="rtl"
        >
          {/* Header */}
          <div
            className="p-3.5 text-white flex items-center justify-between shadow-md select-none relative overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary || "#6366f1"})`,
            }}
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <img
                  src="/logo.jpg"
                  alt="شعار متجر أحمد بحري"
                  className="w-10 h-10 rounded-2xl object-cover ring-2 ring-white/30 shadow-md"
                />
                <span className="absolute -bottom-0.5 -left-0.5 w-3 h-3 bg-emerald-400 border-2 border-white rounded-full shadow-sm" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-extrabold text-sm text-white">مساعد الإدارة</h3>
                  <span className="px-1.5 py-0.2 rounded-md bg-white/20 text-[10px] font-bold tracking-wider">
                    Gemini AI
                  </span>
                </div>
                <p className="text-[11px] text-white/80 font-medium truncate max-w-[160px]">
                  {settings.siteName || "متجر أحمد بحري"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow-sm">
                  {unreadCount} إشعار
                </span>
              )}
              <button
                onClick={handleClearHistory}
                title="بدء محادثة جديدة ومسح السجل"
                className="w-7 h-7 rounded-xl bg-white/10 hover:bg-white/20 text-white/90 flex items-center justify-center text-xs transition-colors cursor-pointer"
              >
                🔄
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="إغلاق"
                className="w-7 h-7 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-gray-50/60 dark:bg-gray-950/60 scrollbar-thin">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex items-end gap-2 ${msg.isBot ? "justify-start" : "justify-end"} animate-fadeIn`}
              >
                {msg.isBot && (
                  <div
                    className="w-7 h-7 rounded-xl flex items-center justify-center text-xs text-white shadow-sm flex-shrink-0 mb-1"
                    style={{ backgroundColor: theme.primary }}
                  >
                    🤖
                  </div>
                )}

                <div
                  className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl shadow-sm text-sm transition-all ${
                    msg.isBot
                      ? msg.isError
                        ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-br-sm"
                        : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-100 dark:border-gray-700/80 rounded-br-sm"
                      : "text-white rounded-bl-sm font-medium"
                  }`}
                  style={!msg.isBot ? { backgroundColor: theme.primary } : {}}
                >
                  {msg.isBot ? (
                    msg.text ? (
                      <FormattedMessageText text={msg.text} />
                    ) : (
                      <div className="flex items-center gap-2 py-1 px-1">
                        <div className="flex gap-1 items-center">
                          <span className="w-2 h-2 rounded-full bg-violet-600 animate-bounce" />
                          <span className="w-2 h-2 rounded-full bg-violet-600 animate-bounce [animation-delay:0.15s]" />
                          <span className="w-2 h-2 rounded-full bg-violet-600 animate-bounce [animation-delay:0.3s]" />
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 font-bold">
                          جاري التفكير وتحليل بيانات المتجر...
                        </span>
                      </div>
                    )
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  )}

                  <span
                    className={`block text-[10px] mt-1 text-left ${
                      msg.isBot
                        ? "text-gray-400 dark:text-gray-500"
                        : "text-white/70"
                    }`}
                  >
                    {new Date(msg.timestamp).toLocaleTimeString("ar-IQ", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            ))}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions Pills */}
          <div className="px-3 pt-2 pb-1 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-1.5 max-h-[85px] overflow-y-auto scrollbar-none">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                disabled={isGenerating}
                onClick={() => handleQuickAction(action)}
                className="px-2.5 py-1 text-[11px] font-bold rounded-xl border border-gray-200 dark:border-gray-700/80 text-gray-700 dark:text-gray-300 hover:bg-violet-50 hover:border-violet-300 dark:hover:bg-violet-950/40 dark:hover:border-violet-700 hover:text-violet-700 dark:hover:text-violet-300 transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shadow-2xs"
              >
                {action.label}
              </button>
            ))}
          </div>

          {/* Bottom Chat Input Form */}
          <div className="p-3 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (input.trim() && !isGenerating) {
                  sendToGemini(input);
                }
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (input.trim() && !isGenerating) {
                      sendToGemini(input);
                    }
                  }
                }}
                placeholder="اكتب أمراً أو سؤال (مثال: كم عدد المنتجات؟)..."
                disabled={isGenerating}
                className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-2xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs sm:text-sm focus:ring-2 focus:ring-violet-500 focus:bg-white dark:focus:bg-gray-900 outline-none transition-all placeholder:text-gray-400 disabled:opacity-60"
              />

              {isGenerating ? (
                <button
                  type="button"
                  onClick={handleStopGeneration}
                  title="إيقاف التوليد"
                  className="w-10 h-10 rounded-2xl bg-red-600 hover:bg-red-700 text-white flex items-center justify-center text-sm shadow-md transition-all active:scale-95 cursor-pointer flex-shrink-0"
                >
                  ⏹
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="w-10 h-10 rounded-2xl text-white flex items-center justify-center text-sm shadow-md hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex-shrink-0"
                  style={{ backgroundColor: theme.primary }}
                  title="إرسال"
                  aria-label="إرسال"
                >
                  ➤
                </button>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useSettings } from "@/lib/settings-context";
import { useNotifications } from "@/lib/notifications";
import { supabase } from "@/lib/supabase-client";
import { useAuth } from "@/lib/auth-context";
import { smartMatch, type AutoReplyRule } from "@/lib/fuzzy-match";

interface ContactSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Inquiry {
  id: string;
  category: string;
  question: string;
  answer: string;
  sort_order: number;
}

export default function ContactSupportModal({ isOpen, onClose }: ContactSupportModalProps) {
  const { settings } = useSettings();
  const { addNotification } = useNotifications();
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

  // Inquiries panel
  const [showInquiries, setShowInquiries] = useState(false);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [inquiriesLoading, setInquiriesLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("الكل");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [inquirySearch, setInquirySearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Auto-reply
  const [autoRules, setAutoRules] = useState<AutoReplyRule[]>([]);
  const [autoReplyMsg, setAutoReplyMsg] = useState<string | null>(null);

  // Debounce inquiry search — 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(inquirySearch), 300);
    return () => clearTimeout(timer);
  }, [inquirySearch]);

  // Load inquiries + auto-reply rules once
  useEffect(() => {
    if (!isOpen) return;
    async function loadData() {
      setInquiriesLoading(true);
      const [{ data: iData }, { data: arData }] = await Promise.all([
        supabase.from("inquiries").select("id,category,question,answer,sort_order").eq("is_active", true).order("sort_order"),
        supabase.from("auto_replies").select("*").eq("is_active", true).order("priority", { ascending: false }),
      ]);
      if (iData) setInquiries(iData as Inquiry[]);
      if (arData) setAutoRules(arData as AutoReplyRule[]);
      setInquiriesLoading(false);
    }
    loadData();
  }, [isOpen]);

  if (!isOpen) return null;

  const hasWa = Boolean(settings.whatsappLink && settings.whatsappLink.trim() !== "");
  const hasPhone = Boolean(settings.phoneLink && settings.phoneLink.trim() !== "");
  const hasPhone2 = Boolean(settings.phoneLink2 && settings.phoneLink2.trim() !== "");
  const hasTelegram = Boolean(settings.telegramLink && settings.telegramLink.trim() !== "");
  const hasMessenger = Boolean(settings.messengerLink && settings.messengerLink.trim() !== "");

  const rawWa = settings.whatsappLink?.trim() || "";
  const cleanWaNumber = rawWa.replace(/[^0-9]/g, "");
  const formattedWaNumber = cleanWaNumber.startsWith("964")
    ? cleanWaNumber
    : cleanWaNumber.startsWith("07")
    ? `964${cleanWaNumber.substring(1)}`
    : `964${cleanWaNumber}`;

  const waUrl = rawWa.startsWith("http")
    ? rawWa
    : `https://wa.me/${formattedWaNumber}?text=${encodeURIComponent(
        `سلام عليكم، استفسار من متجر ${settings.siteName || "أحمد بحري"}:`
      )}`;
  const phoneUrl = `tel:${settings.phoneLink?.trim() || ""}`;
  const phone2Url = `tel:${settings.phoneLink2?.trim() || ""}`;
  const telegramUrl = hasTelegram
    ? settings.telegramLink!.startsWith("http")
      ? settings.telegramLink!
      : `https://t.me/${settings.telegramLink!.replace("@", "")}`
    : "";
  const messengerUrl = hasMessenger
    ? settings.messengerLink!.startsWith("http")
      ? settings.messengerLink!
      : `https://m.me/${settings.messengerLink!}`
    : "";

  // Derived categories
  const categories = ["الكل", ...Array.from(new Set(inquiries.map((i) => i.category)))];
  const filteredInquiries = inquiries.filter((i) => {
    const catOk = selectedCategory === "الكل" || i.category === selectedCategory;
    const searchOk = !debouncedSearch || i.question.includes(debouncedSearch) || i.answer.includes(debouncedSearch);
    return catOk && searchOk;
  });

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !message.trim()) return;
    setSending(true);
    try {
      const threadId = crypto.randomUUID();
      const customerUserId = user && !user.isGuest && !user.id.startsWith("guest-") ? user.id : null;

      // 1. Save to messages table with proper user mapping and error checking
      const { error: msgError } = await supabase.from("messages").insert({
        user_id: customerUserId,
        sender_name: name.trim(),
        sender_phone: phone.trim() || null,
        content: message.trim(),
        is_admin_reply: false,
        is_read: false,
        thread_id: threadId,
      });

      if (msgError) {
        console.error("Supabase message insert error:", msgError);
        alert("حدث خطأ أثناء إرسال الرسالة، يرجى المحاولة لاحقاً.");
        setSending(false);
        return;
      }

      // 2. Fuzzy auto-reply check
      const globalThreshold = (settings as any).auto_reply_threshold ?? 0.9;
      const autoReplyEnabled = (settings as any).auto_reply_enabled ?? false;
      let matched = null;
      if (autoReplyEnabled && autoRules.length > 0) {
        matched = smartMatch(message.trim(), autoRules, globalThreshold);
      }
      if (matched) {
        await supabase.from("messages").insert({
          user_id: customerUserId,
          sender_name: "الرد التلقائي 🤖",
          content: matched.rule.response_text,
          is_admin_reply: true,
          is_read: true,
          auto_replied: true,
          matched_keyword: matched.matchedKeyword,
          thread_id: threadId,
        });
        setAutoReplyMsg(matched.rule.response_text);
      }

      // 3. Notify admin bell safely (letting DB handle defaults if needed)
      await supabase.from("notifications").insert({
        type: "message",
        title: `📩 رسالة جديدة من: ${name.trim()}`,
        message: `${message.trim()} (هاتف: ${phone.trim() || "غير محدد"})`,
        read: false,
      });

      addNotification({
        type: "info",
        title: `📩 رسالة دعم من: ${name.trim()}`,
        message: message.trim(),
      });

      setSentSuccess(true);
      setTimeout(() => {
        setSentSuccess(false);
        setName("");
        setPhone("");
        setMessage("");
        if (!matched) onClose();
      }, matched ? 100 : 1500);
    } catch (err) {
      console.error("Send contact message unexpected error:", err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden text-right flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "scaleUp 0.2s ease" }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-400 flex items-center justify-center text-xl">
              {showInquiries ? "📋" : "💬"}
            </div>
            <div>
              <h3 className="font-extrabold text-base text-gray-900 dark:text-white">
                {showInquiries ? "الاستفسارات الجاهزة" : "التواصل والدعم الفني"}
              </h3>
              <p className="text-xs text-gray-400">
                {showInquiries ? "إجابات فورية على أكثر الأسئلة شيوعاً" : `تواصل مع إدارة متجر ${settings.siteName || "أحمد بحري"}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {showInquiries && (
              <button
                onClick={() => setShowInquiries(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/40 hover:bg-teal-100 transition-colors"
              >
                ← رجوع
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 text-lg">✕</button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* ════════════════════════════════════════════════
              PANEL A: Main Contact View
          ════════════════════════════════════════════════ */}
          {!showInquiries && (
            <div className="p-6 space-y-4">
              {/* Ready Inquiries CTA */}
              <button
                onClick={() => setShowInquiries(true)}
                className="w-full flex items-center justify-between p-3.5 bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/30 border border-violet-200 dark:border-violet-800/40 rounded-2xl hover:scale-[1.01] transition-transform group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📋</span>
                  <div className="text-right">
                    <p className="text-sm font-extrabold text-violet-800 dark:text-violet-300">استفسارات جاهزة</p>
                    <p className="text-[11px] text-violet-500 dark:text-violet-400">إجابات فورية لأكثر الأسئلة الشائعة</p>
                  </div>
                </div>
                <span className="text-violet-400 group-hover:translate-x-1 transition-transform">←</span>
              </button>

              {/* Direct Contact Buttons (Strict Dynamic Conditional Rendering) */}
              {(hasWa || hasPhone || hasPhone2 || hasTelegram || hasMessenger) && (
                <div className="flex flex-wrap gap-2.5">
                  {hasWa && (
                    <a href={waUrl} target="_blank" rel="noreferrer"
                      className="flex-1 min-w-[140px] flex items-center justify-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded-2xl font-extrabold text-xs border border-emerald-200 dark:border-emerald-800/40 hover:scale-[1.02] transition-transform shadow-2xs">
                      <span className="text-lg">💬</span> محادثة واتساب
                    </a>
                  )}
                  {hasPhone && (
                    <a href={phoneUrl}
                      className="flex-1 min-w-[140px] flex items-center justify-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 rounded-2xl font-extrabold text-xs border border-blue-200 dark:border-blue-800/40 hover:scale-[1.02] transition-transform shadow-2xs">
                      <span className="text-lg">📞</span> {settings.phoneLink}
                    </a>
                  )}
                  {hasPhone2 && (
                    <a href={phone2Url}
                      className="flex-1 min-w-[140px] flex items-center justify-center gap-2 p-3 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 rounded-2xl font-extrabold text-xs border border-indigo-200 dark:border-indigo-800/40 hover:scale-[1.02] transition-transform shadow-2xs">
                      <span className="text-lg">☎️</span> {settings.phoneLink2} (ثانوي)
                    </a>
                  )}
                  {hasTelegram && (
                    <a href={telegramUrl} target="_blank" rel="noreferrer"
                      className="flex-1 min-w-[140px] flex items-center justify-center gap-2 p-3 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 rounded-2xl font-extrabold text-xs border border-sky-200 dark:border-sky-800/40 hover:scale-[1.02] transition-transform shadow-2xs">
                      <span className="text-lg">✈️</span> قناة تليجرام
                    </a>
                  )}
                  {hasMessenger && (
                    <a href={messengerUrl} target="_blank" rel="noreferrer"
                      className="flex-1 min-w-[140px] flex items-center justify-center gap-2 p-3 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 rounded-2xl font-extrabold text-xs border border-indigo-200 dark:border-indigo-800/40 hover:scale-[1.02] transition-transform shadow-2xs">
                      <span className="text-lg">⚡</span> ماسنجر
                    </a>
                  )}
                </div>
              )}

              {/* Social Links (Strict Dynamic Conditional Rendering) */}
              {(() => {
                const hasFacebook = Boolean(settings.facebookLink && settings.facebookLink.trim() !== "");
                const hasInstagram = Boolean(settings.instagramLink && settings.instagramLink.trim() !== "");
                const hasTiktok = Boolean(settings.tiktokLink && settings.tiktokLink.trim() !== "");
                const hasYoutube = Boolean(settings.youtubeLink && settings.youtubeLink.trim() !== "");

                if (!hasFacebook && !hasInstagram && !hasTiktok && !hasYoutube) return null;

                return (
                  <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700/60">
                    <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-2">تابعنا على وسائل التواصل الاجتماعي:</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {hasFacebook && <a href={settings.facebookLink!} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:opacity-90">📘 فيسبوك</a>}
                      {hasInstagram && <a href={settings.instagramLink!} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-pink-600 text-white rounded-xl text-xs font-bold hover:opacity-90">📷 إنستغرام</a>}
                      {hasTiktok && <a href={settings.tiktokLink!} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-gray-900 text-white rounded-xl text-xs font-bold hover:opacity-90">🎵 تيك توك</a>}
                      {hasYoutube && <a href={settings.youtubeLink!} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-red-600 text-white rounded-xl text-xs font-bold hover:opacity-90">▶️ يوتيوب</a>}
                    </div>
                  </div>
                );
              })()}

              {/* Auto-Reply shown if matched */}
              {autoReplyMsg && (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-2xl space-y-1">
                  <p className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300">🤖 رد تلقائي فوري:</p>
                  <p className="text-xs text-emerald-800 dark:text-emerald-200 leading-relaxed whitespace-pre-line">{autoReplyMsg}</p>
                  <button onClick={() => setAutoReplyMsg(null)} className="text-[10px] text-emerald-500 underline mt-1">إخفاء الرد</button>
                </div>
              )}

              {/* Message Form */}
              <form onSubmit={handleSendMessage} className="p-4 bg-gradient-to-br from-teal-50/50 to-blue-50/50 dark:from-teal-950/20 dark:to-blue-950/20 rounded-2xl border border-teal-100 dark:border-teal-900/40 space-y-3">
                <p className="text-xs font-extrabold text-teal-900 dark:text-teal-200">✉️ إرسال رسالة مباشرة لإدارة المتجر</p>
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 dark:text-gray-300 mb-1">الاسم الكامل: *</label>
                  <input type="text" required placeholder="أدخل اسمك..." value={name} onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-bold text-gray-900 dark:text-white outline-none focus:border-teal-500" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 dark:text-gray-300 mb-1">رقم الهاتف (لإعادة الاتصال):</label>
                  <input type="tel" placeholder="078..." value={phone} onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-bold text-gray-900 dark:text-white outline-none focus:border-teal-500" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 dark:text-gray-300 mb-1">نص الاستفسار أو الرسالة: *</label>
                  <textarea required rows={3} placeholder="اكتب استفسارك أو طلبك هنا..." value={message} onChange={(e) => setMessage(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-bold text-gray-900 dark:text-white outline-none focus:border-teal-500 resize-none" />
                </div>
                <button type="submit" disabled={sending || sentSuccess}
                  className={`w-full py-2.5 rounded-xl text-xs font-extrabold text-white transition-all shadow-sm ${sentSuccess ? "bg-emerald-600" : sending ? "bg-gray-400 cursor-not-allowed" : "bg-teal-600 hover:bg-teal-700"}`}>
                  {sentSuccess ? "✅ تم إرسال الرسالة بنجاح!" : sending ? "جارٍ الإرسال..." : "إرسال الرسالة للمدير 🚀"}
                </button>
              </form>
            </div>
          )}

          {/* ════════════════════════════════════════════════
              PANEL B: Ready Inquiries View
          ════════════════════════════════════════════════ */}
          {showInquiries && (
            <div className="p-5 space-y-4">
              {/* Search */}
              <input
                type="text"
                placeholder="🔍 ابحث في الاستفسارات..."
                value={inquirySearch}
                onChange={(e) => setInquirySearch(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-bold text-gray-900 dark:text-white outline-none focus:border-violet-500"
              />

              {/* Category tabs */}
              <div className="flex gap-2 flex-wrap">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold border transition-all ${
                      selectedCategory === cat
                        ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                        : "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-violet-400"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Q&A Accordion */}
              {inquiriesLoading ? (
                <div className="flex items-center justify-center py-10 text-gray-400">
                  <div className="animate-spin w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full ml-2" />
                  جارٍ التحميل...
                </div>
              ) : filteredInquiries.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">لا توجد استفسارات مطابقة</div>
              ) : (
                <div className="space-y-2">
                  {filteredInquiries.map((inq) => (
                    <div
                      key={inq.id}
                      className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden"
                    >
                      <button
                        onClick={() => setExpandedId(expandedId === inq.id ? null : inq.id)}
                        className="w-full flex items-start justify-between gap-3 p-3.5 text-right bg-white dark:bg-gray-800/60 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <div className="flex items-start gap-2 flex-1">
                          <span className="text-violet-500 text-sm mt-0.5 flex-shrink-0">❓</span>
                          <span className="text-xs font-bold text-gray-800 dark:text-gray-100 leading-relaxed text-right">{inq.question}</span>
                        </div>
                        <span className={`flex-shrink-0 text-gray-400 text-xs transition-transform ${expandedId === inq.id ? "rotate-180" : ""}`}>▼</span>
                      </button>
                      {expandedId === inq.id && (
                        <div className="px-4 pb-4 pt-2 bg-violet-50/50 dark:bg-violet-950/20 border-t border-gray-100 dark:border-gray-700">
                          <p className="text-xs text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-line">{inq.answer}</p>
                          <span className="inline-block mt-2 px-2 py-0.5 rounded-md text-[10px] font-bold bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">
                            {inq.category}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* CTA to message */}
              <button
                onClick={() => setShowInquiries(false)}
                className="w-full py-2.5 rounded-xl text-xs font-extrabold text-white bg-teal-600 hover:bg-teal-700 transition-colors shadow-sm"
              >
                لم تجد إجابتك؟ راسلنا مباشرة 💬
              </button>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes scaleUp {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

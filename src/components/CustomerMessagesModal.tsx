"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase-client";
import { useAuth } from "@/lib/auth-context";
import { useSettings } from "@/lib/settings-context";
import { getOrCreateGuestSessionId } from "@/lib/notifications";
import Link from "next/link";

interface Message {
  id: string;
  sender_name: string;
  sender_phone: string | null;
  content: string;
  is_admin_reply: boolean;
  is_read: boolean;
  auto_replied: boolean;
  is_guest?: boolean;
  matched_keyword: string | null;
  thread_id: string | null;
  created_at: string;
}

interface CustomerMessagesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  return `منذ ${Math.floor(hours / 24)} يوم`;
}

export default function CustomerMessagesModal({ isOpen, onClose }: CustomerMessagesModalProps) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isGuest = !user || user.isGuest || !user.email || user.id?.startsWith("guest-");

  const loadCustomerMessages = useCallback(async () => {
    if (!isOpen) return;
    try {
      setLoading(true);
      const guestSessionId = getOrCreateGuestSessionId();
      
      // Strict Tenant Isolation Query
      let query = supabase.from("messages").select("*").order("created_at", { ascending: true }).limit(200);

      if (user?.id && !user.id.startsWith("guest-")) {
        // Registered Customer: fetch strictly matching user_id or session_id
        query = query.or(`user_id.eq.${user.id},session_id.eq.${guestSessionId}`);
      } else {
        // Guest User: fetch strictly matching dynamic anonymous guest session ID
        query = query.eq("session_id", guestSessionId);
      }

      const { data, error } = await query;
      if (error) {
        console.error("Error loading isolated customer messages:", error);
      } else if (data) {
        setMessages(data as Message[]);
      }
    } catch (err) {
      console.error("Unexpected error loading customer messages:", err);
    } finally {
      setLoading(false);
    }
  }, [isOpen, user?.id, user?.fullName]);

  useEffect(() => {
    if (!isOpen) return;
    loadCustomerMessages();

    // Supabase Realtime channel for instant message sync
    const channel = supabase
      .channel("customer-messages-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        loadCustomerMessages();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, () => {
        loadCustomerMessages();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, loadCustomerMessages]);

  useEffect(() => {
    if (isOpen && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isOpen, messages]);

  if (!isOpen) return null;

  const handleSendMessage = async () => {
    if (!newText.trim()) return;
    setSending(true);
    try {
      const guestSessionId = getOrCreateGuestSessionId();
      const threadId = messages.length > 0 ? (messages[0].thread_id || crypto.randomUUID()) : crypto.randomUUID();
      const customerUserId = user && !user.isGuest && !user.id?.startsWith("guest-") ? user.id : null;

      const { data: insertedMsg, error } = await supabase
        .from("messages")
        .insert({
          user_id: customerUserId,
          session_id: isGuest ? guestSessionId : null,
          serial_id: isGuest ? guestSessionId : null,
          sender_name: user?.fullName || (isGuest ? `ضيف #${guestSessionId.slice(-4)}` : "مستخدم"),
          sender_phone: isGuest ? guestSessionId : (user as any)?.phone || "",
          content: newText.trim(),
          role: isGuest ? "guest" : "customer",
          is_admin_reply: false,
          is_read: false,
          is_guest: isGuest,
          thread_id: threadId,
        })
        .select()
        .single();

      if (error) {
        console.error("Error sending message:", error);
        alert("حدث خطأ أثناء إرسال الرسالة، يرجى المحاولة لاحقاً.");
      } else if (insertedMsg) {
        setMessages((prev) => [...prev, insertedMsg as Message]);
        setNewText("");
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    } catch (err) {
      console.error("Unexpected send error:", err);
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
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden text-right flex flex-col h-[85vh] max-h-[700px] max-w-full"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "scaleUp 0.2s ease" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-6 py-4 flex-shrink-0 bg-gradient-to-r from-blue-50 to-indigo-50/40 dark:from-blue-950/20 dark:to-indigo-950/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-xl shadow-md">
              💬
            </div>
            <div>
              <h3 className="font-extrabold text-base text-gray-900 dark:text-white">المحادثة المباشرة مع الدعم</h3>
              <p className="text-xs text-gray-400">تواصل مباشر وسريع مع إدارة متجر أحمد بحري</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 text-lg">
            ✕
          </button>
        </div>

        {/* Visual Alert Banner for Guest Users */}
        {isGuest && (
          <div className="p-3.5 bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-800/60 flex items-center justify-between gap-3 flex-shrink-0 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xl flex-shrink-0">⚠️</span>
              <p className="text-xs font-bold text-amber-900 dark:text-amber-200 leading-tight">
                تنبيه: محادثتك مؤقتة وتتم عبر جلسة مؤقتة (Guest Session). لن يتم حفظ السجل بشكل دائم عند مسح بيانات المتصفح. يمكنك إنشاء حساب مجاناً لضمان حفظ سجل محادثاتك وسهولة التواصل.
              </p>
            </div>
            <Link
              href="/login?mode=signup&upgrade=true"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl text-xs font-extrabold text-white bg-amber-600 hover:bg-amber-700 transition-all shadow-sm flex-shrink-0 whitespace-nowrap"
            >
              إنشاء حساب مجاني 🔑
            </Link>
          </div>
        )}

        {/* Messages Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50 dark:bg-gray-950/40">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
              <div className="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full ml-2" />
              جارٍ تحميل الرسائل...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-center space-y-3">
              <span className="text-5xl opacity-60">💬</span>
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400">لا توجد رسائل سابقة بعد</p>
              <p className="text-[11px] text-gray-400 max-w-xs">يمكنك كتابة رسالتك أو استفسارك أدناه وسيجيبك فريق الدعم فوراً.</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isAdmin = msg.is_admin_reply;
              return (
                <div key={msg.id} className={`flex ${isAdmin ? "justify-start" : "justify-end"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-xs text-xs leading-relaxed ${
                      isAdmin
                        ? msg.auto_replied
                          ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800/40"
                          : "bg-blue-600 text-white"
                        : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1 border-b border-black/10 dark:border-white/10 pb-1">
                      <span className="font-extrabold text-[11px]">
                        {isAdmin ? (msg.auto_replied ? "🤖 الرد التلقائي" : `📢 ${msg.sender_name || "إدارة المتجر"}`) : "أنت"}
                      </span>
                      <span className="text-[10px] opacity-75">{timeAgo(msg.created_at)}</span>
                    </div>
                    <p className="whitespace-pre-line text-xs font-medium">{msg.content}</p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply Input */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0 bg-white dark:bg-gray-900">
          <div className="flex gap-2 items-end">
            <textarea
              rows={2}
              placeholder="اكتب رسالتك أو ردك هنا..."
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              className="flex-1 px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs text-gray-900 dark:text-white outline-none focus:border-blue-500 resize-none font-medium"
            />
            <button
              onClick={handleSendMessage}
              disabled={sending || !newText.trim()}
              className="px-4 py-3 rounded-xl text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 transition-colors shadow-sm flex-shrink-0 flex items-center gap-1"
            >
              {sending ? "..." : "إرسال 🚀"}
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1">اضغط Enter للإرسال · Shift+Enter لسطر جديد</p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase-client";
import { useAuth } from "@/lib/auth-context";
import { useSettings } from "@/lib/settings-context";

interface Message {
  id: string;
  sender_name: string;
  sender_phone: string | null;
  content: string;
  is_admin_reply: boolean;
  is_read: boolean;
  auto_replied: boolean;
  matched_keyword: string | null;
  thread_id: string | null;
  created_at: string;
}

interface Thread {
  thread_id: string;
  sender_name: string;
  sender_phone: string | null;
  last_message: string;
  last_at: string;
  unread_count: number;
  messages: Message[];
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

function groupIntoThreads(msgs: Message[]): Thread[] {
  const map = new Map<string, Message[]>();
  for (const m of msgs) {
    const key = m.thread_id || m.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }

  const threads: Thread[] = [];
  map.forEach((messages, threadId) => {
    const sorted = messages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const customer = sorted.find((m) => !m.is_admin_reply) || sorted[0];
    const last = sorted[sorted.length - 1];
    const unread = sorted.filter((m) => !m.is_admin_reply && !m.is_read).length;
    threads.push({
      thread_id: threadId,
      sender_name: customer.sender_name,
      sender_phone: customer.sender_phone || null,
      last_message: last.content,
      last_at: last.created_at,
      unread_count: unread,
      messages: sorted,
    });
  });

  return threads.sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime());
}

export default function MessagesPage() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastText, setBroadcastText] = useState("");
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastSent, setBroadcastSent] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const loadMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) { console.error(error); return; }
    const grouped = groupIntoThreads((data || []) as Message[]);
    setThreads(grouped);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadMessages();

    // Supabase Realtime subscription
    const channel = supabase
      .channel("messages-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        loadMessages();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadMessages]);

  // Scroll to bottom when thread selected or new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedThread]);

  // Mark thread as read when opened
  const openThread = async (thread: Thread) => {
    setSelectedThread(thread);
    setReplyText("");
    const unreadIds = thread.messages.filter((m) => !m.is_admin_reply && !m.is_read).map((m) => m.id);
    if (unreadIds.length > 0) {
      await supabase.from("messages").update({ is_read: true }).in("id", unreadIds);
      setThreads((prev) =>
        prev.map((t) =>
          t.thread_id === thread.thread_id
            ? { ...t, unread_count: 0, messages: t.messages.map((m) => ({ ...m, is_read: true })) }
            : t
        )
      );
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedThread) return;
    setSending(true);
    try {
      const { data: newMsg, error } = await supabase
        .from("messages")
        .insert({
          sender_name: user?.fullName || "الإدارة",
          content: replyText.trim(),
          is_admin_reply: true,
          is_read: true,
          thread_id: selectedThread.thread_id,
        })
        .select()
        .single();
      if (error) throw error;
      const updated = { ...selectedThread, messages: [...selectedThread.messages, newMsg as Message], last_message: replyText.trim(), last_at: new Date().toISOString() };
      setSelectedThread(updated);
      setThreads((prev) => prev.map((t) => t.thread_id === updated.thread_id ? updated : t));
      setReplyText("");
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  const handleDeleteThread = async (threadId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذه المحادثة؟")) return;
    await supabase.from("messages").delete().eq("thread_id", threadId);
    setThreads((prev) => prev.filter((t) => t.thread_id !== threadId));
    if (selectedThread?.thread_id === threadId) setSelectedThread(null);
    showToast("✅ تم حذف المحادثة");
  };

  const handleBroadcast = async () => {
    if (!broadcastText.trim()) return;
    setBroadcastSending(true);
    try {
      await supabase.from("messages").insert({
        sender_name: user?.fullName || "الإدارة",
        content: `📢 رسالة ترويجية: ${broadcastText.trim()}`,
        is_admin_reply: true,
        is_read: true,
        thread_id: crypto.randomUUID(),
      });
      setBroadcastSent(true);
      showToast("✅ تم إرسال الرسالة الترويجية بنجاح");
      setTimeout(() => { setBroadcastSent(false); setBroadcastText(""); setBroadcastOpen(false); }, 1500);
    } catch (err) {
      console.error(err);
    } finally {
      setBroadcastSending(false);
    }
  };

  const filteredThreads = filter === "unread" ? threads.filter((t) => t.unread_count > 0) : threads;
  const totalUnread = threads.reduce((s, t) => s + t.unread_count, 0);

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col" dir="rtl">
      {/* Toast */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl text-xs font-bold">
          {toast}
        </div>
      )}

      {/* Page Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
            💬 الرسائل والمحادثات
            {totalUnread > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-red-600 text-white animate-pulse">{totalUnread}</span>
            )}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">إدارة رسائل الزبائن والردود الإدارية</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBroadcastOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity shadow-md"
          >
            📢 رسالة ترويجية
          </button>
        </div>
      </div>

      {/* Broadcast Modal */}
      {broadcastOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setBroadcastOpen(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md shadow-2xl border border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-extrabold text-gray-900 dark:text-white mb-4">📢 إرسال رسالة ترويجية</h3>
            <textarea
              rows={4}
              placeholder="اكتب رسالتك الترويجية أو العرض الخاص هنا..."
              value={broadcastText}
              onChange={(e) => setBroadcastText(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white outline-none focus:border-violet-500 resize-none mb-4"
            />
            <div className="flex gap-2">
              <button onClick={handleBroadcast} disabled={broadcastSending || broadcastSent}
                className={`flex-1 py-2.5 rounded-xl text-sm font-extrabold text-white transition-all ${broadcastSent ? "bg-emerald-600" : broadcastSending ? "bg-gray-400" : "bg-violet-600 hover:bg-violet-700"}`}>
                {broadcastSent ? "✅ تم الإرسال" : broadcastSending ? "جارٍ الإرسال..." : "إرسال 🚀"}
              </button>
              <button onClick={() => setBroadcastOpen(false)} className="px-4 py-2.5 rounded-xl text-sm font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Chat Layout */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* ── Thread List (Left Panel) ── */}
        <div className="w-80 flex-shrink-0 flex flex-col bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
          {/* Filter tabs */}
          <div className="flex border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
            {(["all", "unread"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 py-2.5 text-xs font-extrabold transition-colors ${filter === f ? "text-violet-600 dark:text-violet-400 border-b-2 border-violet-600" : "text-gray-400 hover:text-gray-600"}`}
              >
                {f === "all" ? `الكل (${threads.length})` : `غير مقروءة (${totalUnread})`}
              </button>
            ))}
          </div>

          {/* Threads */}
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-gray-400 text-sm">
                <div className="animate-spin w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full ml-2" />
                جارٍ التحميل...
              </div>
            ) : filteredThreads.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">
                {filter === "unread" ? "لا توجد رسائل غير مقروءة" : "لا توجد رسائل بعد"}
              </div>
            ) : (
              filteredThreads.map((thread) => (
                <div
                  key={thread.thread_id}
                  onClick={() => openThread(thread)}
                  className={`p-3.5 border-b border-gray-100 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors group ${
                    selectedThread?.thread_id === thread.thread_id ? "bg-violet-50 dark:bg-violet-950/30 border-r-2 border-r-violet-600" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-xs font-extrabold flex items-center justify-center flex-shrink-0">
                        {thread.sender_name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-extrabold text-gray-900 dark:text-white truncate">{thread.sender_name}</p>
                          {thread.unread_count > 0 && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-red-500 text-white flex-shrink-0">{thread.unread_count}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 truncate leading-tight mt-0.5">{thread.last_message}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[10px] text-gray-300 dark:text-gray-500">{timeAgo(thread.last_at)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteThread(thread.thread_id); }}
                      className="opacity-0 group-hover:opacity-100 text-[10px] text-red-400 hover:text-red-600 transition-all px-1"
                    >🗑️</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Thread Detail (Right Panel) ── */}
        <div className="flex-1 flex flex-col bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm min-w-0">
          {!selectedThread ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-300 dark:text-gray-600 space-y-3">
              <span className="text-6xl">💬</span>
              <p className="text-sm font-bold">اختر محادثة من القائمة للبدء</p>
            </div>
          ) : (
            <>
              {/* Thread Header */}
              <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-800 flex-shrink-0 flex items-center justify-between bg-gradient-to-r from-violet-50 to-indigo-50/30 dark:from-violet-950/20 dark:to-indigo-950/20">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-extrabold flex items-center justify-center">
                    {selectedThread.sender_name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-extrabold text-gray-900 dark:text-white">{selectedThread.sender_name}</p>
                    {selectedThread.sender_phone && <p className="text-xs text-gray-400">{selectedThread.sender_phone}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedThread.sender_phone && (
                    <a href={`https://wa.me/${selectedThread.sender_phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40 hover:scale-[1.02] transition-transform">
                      💬 واتساب
                    </a>
                  )}
                  <button onClick={() => handleDeleteThread(selectedThread.thread_id)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-red-50 dark:bg-red-950/40 text-red-600 border border-red-200 dark:border-red-800/40 hover:scale-[1.02] transition-transform">
                    🗑️ حذف
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {selectedThread.messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.is_admin_reply ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-xs text-xs leading-relaxed ${
                      msg.is_admin_reply
                        ? msg.auto_replied
                          ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800/40"
                          : "bg-violet-600 text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                    }`}>
                      {msg.auto_replied && <p className="text-[10px] font-bold mb-1 opacity-70">🤖 رد تلقائي {msg.matched_keyword ? `(${msg.matched_keyword})` : ""}</p>}
                      <p className="whitespace-pre-line">{msg.content}</p>
                      <p className={`text-[10px] mt-1 ${msg.is_admin_reply ? "opacity-70 text-left" : "text-gray-400 text-right"}`}>{timeAgo(msg.created_at)}</p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply Input */}
              <div className="px-4 pb-4 pt-2 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
                <div className="flex gap-2 items-end">
                  <textarea
                    rows={2}
                    placeholder="اكتب ردك هنا..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }}
                    className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs text-gray-900 dark:text-white outline-none focus:border-violet-500 resize-none"
                  />
                  <button
                    onClick={handleSendReply}
                    disabled={sending || !replyText.trim()}
                    className="px-4 py-2 rounded-xl text-xs font-extrabold text-white bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 transition-colors shadow-sm flex-shrink-0"
                  >
                    {sending ? "..." : "إرسال ↩"}
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">اضغط Enter للإرسال · Shift+Enter لسطر جديد</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

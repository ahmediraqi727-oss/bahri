"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

interface Post {
  id: string;
  title: string;
  body: string;
  post_type: "educational" | "promotional";
  display_position: "home_top" | "home_bottom" | "all_sections" | "category";
  target_category: string | null;
  media_url: string | null;
  media_type: "image" | "video";
  is_published: boolean;
  views_count: number;
  created_at: string;
}

export default function PostsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [posts, setPosts] = useState<Post[]>([]);
  const [fetching, setFetching] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    title: "",
    body: "",
    post_type: "promotional" as "educational" | "promotional",
    display_position: "home_top" as "home_top" | "home_bottom" | "all_sections" | "category",
    target_category: "",
    media_url: "",
    media_type: "image" as "image" | "video",
    is_published: true,
  });

  const isManager = user?.role === "manager" || user?.role === "admin";

  useEffect(() => {
    if (!loading && (!user || !isManager)) router.replace("/dashboard");
  }, [user, loading, isManager, router]);

  useEffect(() => { fetchPosts(); }, []);

  async function fetchPosts() {
    setFetching(true);
    const { data } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false });
    setPosts(data || []);
    setFetching(false);
  }

  const resetForm = () => {
    setForm({ title: "", body: "", post_type: "promotional", display_position: "home_top", target_category: "", media_url: "", media_type: "image", is_published: true });
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (p: Post) => {
    setForm({
      title: p.title, body: p.body, post_type: p.post_type,
      display_position: p.display_position, target_category: p.target_category || "",
      media_url: p.media_url || "", media_type: p.media_type, is_published: p.is_published,
    });
    setEditingId(p.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا المنشور؟")) return;
    await supabase.from("posts").delete().eq("id", id);
    fetchPosts();
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const isVideo = file.type.startsWith("video/");
      const ext = file.name.split(".").pop();
      const path = `posts/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("images").upload(path, file, { upsert: true });
      if (!error) {
        const { data: urlData } = supabase.storage.from("images").getPublicUrl(path);
        setForm((f) => ({ ...f, media_url: urlData.publicUrl, media_type: isVideo ? "video" : "image" }));
      }
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.title.trim()) return alert("يرجى إدخال عنوان المنشور");
    setSaving(true);
    try {
      const payload = {
        ...form,
        target_category: form.display_position === "category" ? form.target_category : null,
        author_id: user?.id || null,
        updated_at: new Date().toISOString(),
      };
      if (editingId) {
        await supabase.from("posts").update(payload).eq("id", editingId);
      } else {
        await supabase.from("posts").insert(payload);
      }
      fetchPosts();
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const positionLabel: Record<string, string> = {
    home_top: "أعلى الصفحة الرئيسية",
    home_bottom: "نهاية الصفحة الرئيسية",
    all_sections: "جميع الأقسام",
    category: "قسم محدد",
  };

  if (loading || fetching) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 sm:p-6 overflow-x-hidden" dir="rtl">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">📢 إدارة المنشورات</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">أنشئ وادر المقاطع التعليمية والترويجية</p>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all hover:scale-[1.02]"
            >
              <span>➕</span> منشور جديد
            </button>
          )}
        </div>

        {/* Add/Edit Form */}
        {showForm && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-lg space-y-4">
            <h2 className="text-lg font-extrabold text-gray-900 dark:text-white">
              {editingId ? "✏️ تعديل المنشور" : "📝 منشور جديد"}
            </h2>

            <div className="space-y-1">
              <label className="text-sm font-bold text-gray-700 dark:text-gray-300">العنوان *</label>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="عنوان المنشور..."
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-bold text-gray-700 dark:text-gray-300">الوصف التفصيلي</label>
              <textarea
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                rows={4}
                placeholder="محتوى المنشور التفصيلي..."
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-bold text-gray-700 dark:text-gray-300">نوع المنشور</label>
                <select
                  value={form.post_type}
                  onChange={(e) => setForm((f) => ({ ...f, post_type: e.target.value as "educational" | "promotional" }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="promotional">📣 ترويجي</option>
                  <option value="educational">📚 تعليمي</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-bold text-gray-700 dark:text-gray-300">مكان العرض</label>
                <select
                  value={form.display_position}
                  onChange={(e) => setForm((f) => ({ ...f, display_position: e.target.value as Post["display_position"] }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="home_top">⬆️ أعلى الصفحة الرئيسية</option>
                  <option value="home_bottom">⬇️ نهاية الصفحة الرئيسية</option>
                  <option value="all_sections">📋 جميع الأقسام</option>
                  <option value="category">📁 قسم محدد</option>
                </select>
              </div>
            </div>

            {form.display_position === "category" && (
              <div className="space-y-1">
                <label className="text-sm font-bold text-gray-700 dark:text-gray-300">اسم القسم المستهدف</label>
                <input
                  value={form.target_category}
                  onChange={(e) => setForm((f) => ({ ...f, target_category: e.target.value }))}
                  placeholder="مثال: إلكترونيات"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {/* Media Upload */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700 dark:text-gray-300">صورة أو مقطع فيديو</label>
              <div className="flex items-start gap-4 flex-wrap">
                {form.media_url && (
                  form.media_type === "video" ? (
                    <video src={form.media_url} className="w-32 h-20 rounded-xl object-cover border border-gray-200 dark:border-gray-700" controls />
                  ) : (
                    <img src={form.media_url} alt="preview" className="w-32 h-20 rounded-xl object-cover border border-gray-200 dark:border-gray-700" />
                  )
                )}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-60"
                  >
                    {uploading ? "جارٍ الرفع..." : "📷 رفع صورة / فيديو"}
                  </button>
                  {/* capture="environment" for mobile camera */}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,video/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleMediaUpload}
                  />
                  {form.media_url && (
                    <button onClick={() => setForm((f) => ({ ...f, media_url: "" }))} className="text-xs text-red-500 hover:underline">
                      إزالة الوسيط
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_published}
                  onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                <span className="ms-3 text-sm font-bold text-gray-700 dark:text-gray-300">نشر المنشور</span>
              </label>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold rounded-xl transition-all"
              >
                {saving ? "جارٍ الحفظ..." : editingId ? "💾 حفظ التعديلات" : "✅ نشر المنشور"}
              </button>
              <button
                onClick={resetForm}
                className="px-5 py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl transition-all"
              >
                إلغاء
              </button>
            </div>
          </div>
        )}

        {/* Posts Table */}
        {posts.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
            <span className="text-5xl block mb-3">📢</span>
            <p className="text-gray-500 dark:text-gray-400 font-bold">لا توجد منشورات بعد</p>
            <button onClick={() => setShowForm(true)} className="mt-4 px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl">
              ➕ أضف أول منشور
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                    <th className="px-4 py-3 text-right font-extrabold text-gray-700 dark:text-gray-300">العنوان</th>
                    <th className="px-4 py-3 text-right font-extrabold text-gray-700 dark:text-gray-300 hidden sm:table-cell">النوع</th>
                    <th className="px-4 py-3 text-right font-extrabold text-gray-700 dark:text-gray-300 hidden md:table-cell">مكان العرض</th>
                    <th className="px-4 py-3 text-center font-extrabold text-gray-700 dark:text-gray-300">المشاهدات</th>
                    <th className="px-4 py-3 text-center font-extrabold text-gray-700 dark:text-gray-300">الحالة</th>
                    <th className="px-4 py-3 text-center font-extrabold text-gray-700 dark:text-gray-300">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {posts.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {p.media_url && (
                            <img src={p.media_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                          )}
                          <div>
                            <p className="font-bold text-gray-900 dark:text-white line-clamp-1">{p.title}</p>
                            <p className="text-xs text-gray-400 line-clamp-1">{p.body}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${p.post_type === "promotional" ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300" : "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"}`}>
                          {p.post_type === "promotional" ? "📣 ترويجي" : "📚 تعليمي"}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-gray-500 dark:text-gray-400">
                        {positionLabel[p.display_position]}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs font-bold text-gray-600 dark:text-gray-300">👁️ {p.views_count}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${p.is_published ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" : "bg-gray-100 dark:bg-gray-800 text-gray-500"}`}>
                          {p.is_published ? "✓ منشور" : "مسودة"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => handleEdit(p)} className="p-1.5 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-600 rounded-lg transition-colors" title="تعديل">✏️</button>
                          <button onClick={() => handleDelete(p.id)} className="p-1.5 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-500 rounded-lg transition-colors" title="حذف">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards List View */}
            <div className="block md:hidden space-y-3.5 p-3">
              {posts.map((p) => (
                <div
                  key={p.id}
                  className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm space-y-3 transition-all"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2 border-b border-gray-100 dark:border-gray-800 pb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {p.media_url ? (
                        <img
                          src={p.media_url}
                          alt=""
                          className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-gray-200 dark:border-gray-700 shadow-sm"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 text-lg flex-shrink-0 border border-gray-200 dark:border-gray-700">
                          📝
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="font-bold text-gray-900 dark:text-white text-sm line-clamp-1" title={p.title}>
                          {p.title}
                        </h3>
                        {p.body && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                            {p.body}
                          </p>
                        )}
                      </div>
                    </div>

                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap flex-shrink-0 ${p.is_published ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" : "bg-gray-100 dark:bg-gray-800 text-gray-500"}`}>
                      {p.is_published ? "✓ منشور" : "مسودة"}
                    </span>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 dark:bg-gray-800/60 p-3 rounded-xl border border-gray-100 dark:border-gray-800/80">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400 block text-[11px] font-medium">نوع المنشور</span>
                      <span className={`inline-block px-2 py-0.5 mt-0.5 rounded-md text-[10px] font-bold ${p.post_type === "promotional" ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300" : "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"}`}>
                        {p.post_type === "promotional" ? "📣 ترويجي" : "📚 تعليمي"}
                      </span>
                    </div>

                    <div>
                      <span className="text-gray-500 dark:text-gray-400 block text-[11px] font-medium">مكان العرض</span>
                      <span className="font-semibold text-gray-800 dark:text-gray-200 truncate block">
                        {positionLabel[p.display_position]}
                      </span>
                    </div>

                    <div className="col-span-2 pt-1 border-t border-gray-200/60 dark:border-gray-700/60 flex items-center justify-between">
                      <span className="text-gray-500 dark:text-gray-400 text-[11px]">عدد المشاهدات:</span>
                      <span className="font-bold text-gray-900 dark:text-white text-xs">
                        👁️ {p.views_count} مشاهدة
                      </span>
                    </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="flex items-center gap-2 pt-1 border-t border-gray-100 dark:border-gray-800">
                    <button
                      onClick={() => handleEdit(p)}
                      className="flex-1 py-2 px-3 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-xl border border-blue-200 dark:border-blue-800 flex items-center justify-center gap-1.5 transition-all active:scale-95 min-h-[40px]"
                    >
                      <span>✏️</span>
                      <span>تعديل</span>
                    </button>

                    <button
                      onClick={() => handleDelete(p.id)}
                      className="flex-1 py-2 px-3 text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-xl border border-red-200 dark:border-red-800 flex items-center justify-center gap-1.5 transition-all active:scale-95 min-h-[40px]"
                    >
                      <span>🗑️</span>
                      <span>حذف</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

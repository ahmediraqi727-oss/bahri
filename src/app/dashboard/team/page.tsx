"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

interface TeamMember {
  id: string;
  full_name: string;
  job_title: string;
  bio: string;
  avatar_url: string;
  display_order: number;
  is_visible: boolean;
  created_at: string;
}

export default function TeamPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [fetching, setFetching] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    job_title: "",
    bio: "",
    avatar_url: "",
    display_order: 0,
    is_visible: true,
  });

  const isManager = user?.role === "manager" || user?.role === "admin";

  useEffect(() => {
    if (!loading && (!user || !isManager)) router.replace("/dashboard");
  }, [user, loading, isManager, router]);

  useEffect(() => {
    fetchMembers();
  }, []);

  async function fetchMembers() {
    setFetching(true);
    const { data } = await supabase
      .from("team_members")
      .select("*")
      .order("display_order", { ascending: true });
    setMembers(data || []);
    setFetching(false);
  }

  const resetForm = () => {
    setForm({ full_name: "", job_title: "", bio: "", avatar_url: "", display_order: 0, is_visible: true });
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (m: TeamMember) => {
    setForm({
      full_name: m.full_name,
      job_title: m.job_title,
      bio: m.bio || "",
      avatar_url: m.avatar_url || "",
      display_order: m.display_order,
      is_visible: m.is_visible,
    });
    setEditingId(m.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا العضو؟")) return;
    await supabase.from("team_members").delete().eq("id", id);
    fetchMembers();
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `team/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("images").upload(path, file, { upsert: true });
      if (!error) {
        const { data: urlData } = supabase.storage.from("images").getPublicUrl(path);
        setForm((f) => ({ ...f, avatar_url: urlData.publicUrl }));
      }
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) return alert("يرجى إدخال الاسم الكامل");
    setSaving(true);
    try {
      if (editingId) {
        await supabase.from("team_members").update({ ...form, updated_at: new Date().toISOString() }).eq("id", editingId);
      } else {
        await supabase.from("team_members").insert({ ...form });
      }
      fetchMembers();
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  if (loading || fetching) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 sm:p-6" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">👥 إدارة أعضاء الفريق</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">أضف وعدّل وأدر أعضاء فريق العمل الذين سيظهرون في حاشية الموقع</p>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all hover:scale-[1.02]"
            >
              <span>➕</span> إضافة عضو
            </button>
          )}
        </div>

        {/* Add/Edit Form */}
        {showForm && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-lg space-y-4">
            <h2 className="text-lg font-extrabold text-gray-900 dark:text-white">
              {editingId ? "✏️ تعديل عضو الفريق" : "➕ إضافة عضو جديد"}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-bold text-gray-700 dark:text-gray-300">الاسم الكامل *</label>
                <input
                  value={form.full_name}
                  onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                  placeholder="مثال: أحمد بحري"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-bold text-gray-700 dark:text-gray-300">المسمى الوظيفي</label>
                <input
                  value={form.job_title}
                  onChange={(e) => setForm((f) => ({ ...f, job_title: e.target.value }))}
                  placeholder="مثال: مدير المتجر"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-bold text-gray-700 dark:text-gray-300">نبذة مختصرة</label>
              <textarea
                value={form.bio}
                onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                rows={2}
                placeholder="نبذة قصيرة عن العضو..."
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Avatar Upload */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700 dark:text-gray-300">صورة العضو</label>
              <div className="flex items-center gap-4">
                {form.avatar_url ? (
                  <img src={form.avatar_url} alt="avatar" className="w-16 h-16 rounded-2xl object-cover border-2 border-blue-400" />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-2xl">👤</div>
                )}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-60"
                  >
                    {uploading ? "جارٍ الرفع..." : "📷 رفع صورة"}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                  {form.avatar_url && (
                    <button onClick={() => setForm((f) => ({ ...f, avatar_url: "" }))} className="text-xs text-red-500 hover:underline">
                      إزالة الصورة
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-bold text-gray-700 dark:text-gray-300">ترتيب العرض</label>
                <input
                  type="number"
                  value={form.display_order}
                  onChange={(e) => setForm((f) => ({ ...f, display_order: Number(e.target.value) }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_visible}
                    onChange={(e) => setForm((f) => ({ ...f, is_visible: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  <span className="ms-3 text-sm font-bold text-gray-700 dark:text-gray-300">ظاهر في الموقع</span>
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold rounded-xl transition-all"
              >
                {saving ? "جارٍ الحفظ..." : editingId ? "💾 حفظ التعديلات" : "✅ إضافة العضو"}
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

        {/* Members List */}
        {members.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
            <span className="text-5xl block mb-3">👥</span>
            <p className="text-gray-500 dark:text-gray-400 font-bold">لا يوجد أعضاء فريق حتى الآن</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl"
            >
              ➕ أضف أول عضو
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {members.map((m) => (
              <div key={m.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 flex items-start gap-4 shadow-sm hover:shadow-md transition-shadow">
                {m.avatar_url ? (
                  <img src={m.avatar_url} alt={m.full_name} className="w-14 h-14 rounded-2xl object-cover flex-shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-extrabold text-xl flex-shrink-0">
                    {m.full_name.charAt(0)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-extrabold text-gray-900 dark:text-white text-sm">{m.full_name}</h3>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${m.is_visible ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" : "bg-gray-100 dark:bg-gray-800 text-gray-500"}`}>
                      {m.is_visible ? "✓ ظاهر" : "مخفي"}
                    </span>
                  </div>
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-bold mt-0.5">{m.job_title}</p>
                  {m.bio && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{m.bio}</p>}
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleEdit(m)}
                    className="p-2 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 rounded-lg transition-colors"
                    title="تعديل"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(m.id)}
                    className="p-2 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-500 rounded-lg transition-colors"
                    title="حذف"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

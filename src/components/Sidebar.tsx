"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSettings } from "@/lib/settings-context";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase-client";
import { useActivityLog } from "@/lib/activity-log";
import { UserRole } from "@/lib/types";

const NAV_ITEMS = [
  { label: "القائمة الرئيسية", href: "/dashboard", icon: "🏠", roles: ["manager", "admin"] as UserRole[] },
  { label: "المنتجات", href: "/dashboard/products", icon: "📦", roles: ["manager", "admin"] as UserRole[] },
  { label: "الموردين", href: "/dashboard/suppliers", icon: "🚚", roles: ["manager", "admin"] as UserRole[] },
  { label: "المخزون", href: "/dashboard/inventory", icon: "📊", roles: ["manager", "admin"] as UserRole[] },
  { label: "الطلبات", href: "/dashboard/orders", icon: "🛒", roles: ["manager", "admin"] as UserRole[] },
  { label: "التقارير", href: "/dashboard/analytics", icon: "📈", roles: ["manager"] as UserRole[] },
  { label: "الزبائن", href: "/dashboard/customers", icon: "👥", roles: ["manager", "admin"] as UserRole[] },
  { label: "إدارة الحسابات", href: "/dashboard/accounts", icon: "👤", roles: ["manager"] as UserRole[] },
  { label: "سجل الحركات", href: "/dashboard/activity", icon: "📝", roles: ["manager"] as UserRole[] },
  { label: "سلة المهملات", href: "/dashboard/trash", icon: "🗑️", roles: ["manager"] as UserRole[] },
  { label: "المتجر", href: "/", icon: "🏪", roles: ["manager", "admin", "customer"] as UserRole[] },
  { label: "صلاحيات الإداري", href: "/dashboard/roles", icon: "🔐", roles: ["manager"] as UserRole[] },
  { label: "إعدادات", href: "/dashboard/settings", icon: "⚙️", roles: ["manager"] as UserRole[] },
  { label: "صور الواجهة", href: "/dashboard/hero-gallery", icon: "🖼️", roles: ["manager"] as UserRole[] },
];

const ROLE_LABELS: Record<UserRole, string> = {
  manager: "مدير",
  admin: "إداري",
  customer: "زبون",
};

const ROLE_COLORS: Record<UserRole, string> = {
  manager: "#dc2626",
  admin: "#2563eb",
  customer: "#16a34a",
};

interface StaffUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { settings, setCurrentRole } = useSettings();
  const { user, signOut } = useAuth();
  const { logActivity } = useActivityLog();
  const { currentRole, roleThemes } = settings;
  const theme = roleThemes[currentRole];

  const [staffOpen, setStaffOpen] = useState(false);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [editRole, setEditRole] = useState<UserRole>("admin");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(currentRole));

  const fetchStaff = async () => {
    const { data } = await supabase
      .from("users")
      .select("id, email, full_name, role")
      .in("role", ["manager", "admin"])
      .order("created_at", { ascending: false });
    if (data) {
      setStaff(data.map((r) => ({
        id: r.id,
        email: r.email,
        full_name: r.full_name || "",
        role: r.role as UserRole,
      })));
    }
  };

  useEffect(() => {
    if (user?.role === "manager") fetchStaff();
  }, [user]);

  const handleRoleChange = async (userId: string, newRole: UserRole, userName: string) => {
    const { error } = await supabase
      .from("users")
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (!error) {
      await logActivity({
        user: "manager",
        action: "update",
        entity: "حساب",
        entityId: userId,
        details: `تغيير صلاحية "${userName}" إلى ${ROLE_LABELS[newRole]}`,
        newValue: newRole,
      });
      fetchStaff();
    }
    setEditingUser(null);
  };

  const handleDelete = async (userId: string, userName: string) => {
    const { error } = await supabase.from("users").delete().eq("id", userId);
    if (!error) {
      await logActivity({
        user: "manager",
        action: "delete",
        entity: "حساب",
        entityId: userId,
        details: `حذف حساب "${userName}"`,
      });
      fetchStaff();
    }
    setConfirmDeleteId(null);
  };

  const handleLogout = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <aside className="w-64 min-h-screen bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3 mb-3">
          <img src="/logo.jpg" alt="شعار أحمد بحري" className="w-10 h-10 rounded-lg object-cover shadow-md" />
          <h1 className="font-bold text-gray-900 dark:text-white text-sm leading-tight">
            {settings.siteName}
          </h1>
        </div>

        {user && (
          <div className="mb-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <div className="text-xs font-semibold text-gray-900 dark:text-white truncate">{user.fullName || user.email}</div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{ROLE_LABELS[user.role]}</div>
          </div>
        )}

        {user?.role === "manager" && (
          <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
            {(["manager", "admin", "customer"] as UserRole[]).map((role) => (
              <button
                key={role}
                onClick={() => setCurrentRole(role)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                  currentRole === role
                    ? "text-white shadow-sm"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
                style={currentRole === role ? { backgroundColor: roleThemes[role].primary } : {}}
              >
                {ROLE_LABELS[role]}
              </button>
            ))}
          </div>
        )}
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? "text-white shadow-md"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
              }`}
              style={isActive ? { backgroundColor: theme.primary } : {}}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}

        {user?.role === "manager" && (
          <div>
            <button
              onClick={() => { setStaffOpen(!staffOpen); if (!staffOpen) fetchStaff(); }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                staffOpen
                  ? "text-white shadow-md"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
              }`}
              style={staffOpen ? { backgroundColor: theme.primary } : {}}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">👥</span>
                <span>الفريق</span>
              </div>
              <svg className={`w-4 h-4 transition-transform ${staffOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {staffOpen && (
              <div className="mt-1 mr-4 space-y-1 border-r-2 border-gray-200 dark:border-gray-700 pr-2">
                {staff.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500 py-2 px-2">لا يوجد أعضاء</p>
                ) : (
                  staff.map((s) => (
                    <div
                      key={s.id}
                      className="group flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                          style={{ backgroundColor: ROLE_COLORS[s.role] }}
                        >
                          {s.full_name?.charAt(0) || s.email.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{s.full_name || s.email}</p>
                          <p className="text-[10px] text-gray-400 dark:text-gray-500" style={{ color: ROLE_COLORS[s.role] }}>{ROLE_LABELS[s.role]}</p>
                        </div>
                      </div>

                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={() => { setEditingUser(s); setEditRole(s.role); }}
                          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          title="تعديل الصلاحية"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(s.id)}
                          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                          title="حذف"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </nav>

      <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ backgroundColor: theme.accent }}
          />
          <span className="text-xs text-gray-500 dark:text-gray-400">
            الدور الحالي: <span className="font-semibold" style={{ color: theme.primary }}>{ROLE_LABELS[currentRole]}</span>
          </span>
        </div>
        <button
          onClick={handleLogout}
          className="w-full py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
        >
          تسجيل الخروج
        </button>
      </div>

      {/* Edit Role Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditingUser(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">تعديل الصلاحية</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{editingUser.full_name || editingUser.email}</p>

            <div className="space-y-2 mb-6">
              {(["manager", "admin", "customer"] as UserRole[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setEditRole(r)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                    editRole === r
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: ROLE_COLORS[r] }}>
                    {r === "manager" ? "👑" : r === "admin" ? "🛡️" : "👤"}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{ROLE_LABELS[r]}</p>
                    <p className="text-[10px] text-gray-400">
                      {r === "manager" ? "صلاحيات كاملة" : r === "admin" ? "إدارة المنتجات والمخزون" : "تسوق فقط"}
                    </p>
                  </div>
                  {editRole === r && (
                    <svg className="w-5 h-5 text-blue-500 mr-auto" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                  )}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => handleRoleChange(editingUser.id, editRole, editingUser.full_name || editingUser.email)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: ROLE_COLORS[editRole] }}
              >
                حفظ التغيير
              </button>
              <button
                onClick={() => setEditingUser(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">حذف الحساب</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">هل أنت متأكد من حذف هذا الحساب؟ لا يمكن التراجع.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    const u = staff.find((s) => s.id === confirmDeleteId);
                    if (u) handleDelete(u.id, u.full_name || u.email);
                  }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
                >
                  حذف
                </button>
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

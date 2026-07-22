"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase-client";
import { useActivityLog } from "@/lib/activity-log";
import { useSales } from "@/lib/sales-context";
import { useSettings } from "@/lib/settings-context";
import { UserRole } from "@/lib/types";

interface UserAccount {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone: string;
  created_at: string;
  avatar_url: string;
}

const ROLE_LABELS: Record<UserRole, string> = {
  manager: "مدير",
  admin: "إداري",
  customer: "عميل",
};

const ROLE_COLORS: Record<UserRole, string> = {
  manager: "#dc2626",
  admin: "#2563eb",
  customer: "#16a34a",
};

const ROLE_LABELS_PLURAL: Record<UserRole, string> = {
  manager: "المديرين",
  admin: "الإداريين",
  customer: "العملاء",
};

export default function AccountsPage() {
  const { user } = useAuth();
  const { logActivity } = useActivityLog();
  const { settings } = useSettings();
  const { sales } = useSales();
  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState<UserAccount | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("admin");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [upgradeTarget, setUpgradeTarget] = useState<UserAccount | null>(null);
  const [upgradeRole, setUpgradeRole] = useState<UserRole>("admin");

  const fetchAccounts = async () => {
    const { data } = await supabase.from("users").select("*").order("created_at", { ascending: false });
    if (data) {
      setAccounts(data.map((r) => ({
        id: r.id,
        email: r.email,
        full_name: r.full_name || "",
        role: r.role as UserRole,
        phone: r.phone || "",
        created_at: r.created_at,
        avatar_url: r.avatar_url || "",
      })));
    }
    setLoading(false);
  };

  useEffect(() => { fetchAccounts(); }, []);

  const roleCounts = useMemo(() => {
    const counts: Record<UserRole, number> = { manager: 0, admin: 0, customer: 0 };
    accounts.forEach((a) => { counts[a.role]++; });
    return counts;
  }, [accounts]);

  const getUserPurchases = (account: UserAccount) => {
    const name = account.full_name?.toLowerCase() || "";
    const email = account.email?.toLowerCase() || "";
    if (!name && !email) return [];
    return sales.filter((s) => {
      const cn = s.customerName?.toLowerCase() || "";
      return cn === name || cn === email || email.includes(cn);
    });
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setCreating(true);

    const response = await fetch("/api/create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: newEmail,
        password: newPassword,
        fullName: newName,
        role: newRole,
      }),
    });

    if (!response.ok) {
      const errData = await response.json();
      setError(errData.error || "خطأ في إنشاء الحساب");
      setCreating(false);
      return;
    }

    await logActivity({
      user: "manager",
      action: "create",
      entity: "حساب",
      details: `إنشاء حساب جديد "${newName}" بصلاحية ${ROLE_LABELS[newRole]}`,
    });

    setShowCreateModal(false);
    setNewEmail("");
    setNewPassword("");
    setNewName("");
    setNewRole("admin");
    setCreating(false);
    fetchAccounts();
  };

  const handleRoleChange = async (userId: string, newRole: UserRole, userName: string) => {
    const { error: updateError } = await supabase
      .from("users")
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (updateError) {
      alert("خطأ في تحديث الصلاحية");
      return;
    }

    await logActivity({
      user: "manager",
      action: "update",
      entity: "حساب",
      entityId: userId,
      details: `تغيير صلاحية "${userName}" إلى ${ROLE_LABELS[newRole]}`,
      newValue: newRole,
    });

    fetchAccounts();
  };

  const handleUpgradeClick = (account: UserAccount) => {
    setUpgradeTarget(account);
    setUpgradeRole(account.role === "customer" ? "admin" : "manager");
    setShowRoleModal(true);
  };

  const handleUpgradeConfirm = async () => {
    if (!upgradeTarget) return;
    const target = upgradeTarget;
    await handleRoleChange(target.id, upgradeRole, target.full_name || target.email);
    setShowRoleModal(false);
    setUpgradeTarget(null);
    if (showDetail && selectedAccount?.id === target.id) {
      setSelectedAccount({ ...target, role: upgradeRole });
    }
  };

  if (user?.role !== "manager") {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 dark:text-gray-400">هذه الصفحة للمدير فقط</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">إدارة الحسابات</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">إنشاء وإدارة حسابات المستخدمين</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-colors"
          style={{ backgroundColor: settings.roleThemes.manager.primary }}
        >
          + إنشاء حساب جديد
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(["manager", "admin", "customer"] as UserRole[]).map((role) => (
          <div
            key={role}
            className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-xl" style={{ backgroundColor: ROLE_COLORS[role] }}>
                {role === "manager" ? "👑" : role === "admin" ? "🛡️" : "👤"}
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{roleCounts[role]}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{ROLE_LABELS_PLURAL[role]}</p>
              </div>
            </div>
          </div>
        ))}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-xl">
              📊
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{accounts.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">إجمالي المستخدمين</p>
            </div>
          </div>
        </div>
      </div>

      {/* Accounts Table */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">المستخدم</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">الصلاحية</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">المشتريات</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">تاريخ الانضمام</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {accounts.map((account) => {
                  const purchases = getUserPurchases(account);
                  const totalSpent = purchases.reduce((sum, s) => sum + s.total, 0);
                  return (
                    <tr
                      key={account.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                      onClick={() => { setSelectedAccount(account); setShowDetail(true); }}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
                            style={{ backgroundColor: ROLE_COLORS[account.role] }}
                          >
                            {account.full_name?.charAt(0) || account.email.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">{account.full_name || "بدون اسم"}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{account.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className="px-3 py-1 rounded-full text-xs font-bold text-white"
                          style={{ backgroundColor: ROLE_COLORS[account.role] }}
                        >
                          {ROLE_LABELS[account.role]}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{purchases.length} طلب</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{totalSpent.toLocaleString()} د.ع</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {new Date(account.created_at).toLocaleDateString("ar-EG")}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleUpgradeClick(account); }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors hover:opacity-90"
                          style={{ backgroundColor: ROLE_COLORS[account.role] === "#16a34a" ? "#2563eb" : ROLE_COLORS[account.role] === "#2563eb" ? "#dc2626" : "#7c3aed" }}
                        >
                          {account.role === "customer" ? "⬆ رفع صلاحيات" : account.role === "admin" ? "⬆ ترقية" : "👑 مدير"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {accounts.length === 0 && (
            <div className="text-center py-12">
              <span className="text-4xl block mb-3">👤</span>
              <p className="text-gray-500 dark:text-gray-400">لا توجد حسابات بعد</p>
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {showDetail && selectedAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDetail(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">تفاصيل الحساب</h2>
              <button onClick={() => setShowDetail(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl">&times;</button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold"
                  style={{ backgroundColor: ROLE_COLORS[selectedAccount.role] }}
                >
                  {selectedAccount.full_name?.charAt(0) || selectedAccount.email.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">{selectedAccount.full_name || "بدون اسم"}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{selectedAccount.email}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">الصلاحية</p>
                  <span
                    className="px-3 py-1 rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: ROLE_COLORS[selectedAccount.role] }}
                  >
                    {ROLE_LABELS[selectedAccount.role]}
                  </span>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">تاريخ الانضمام</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {new Date(selectedAccount.created_at).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">الهاتف</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{selectedAccount.phone || "غير مسجل"}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">معرّف المستخدم</p>
                  <p className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate">{selectedAccount.id}</p>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">سجل المشتريات</p>
                {(() => {
                  const purchases = getUserPurchases(selectedAccount);
                  const totalSpent = purchases.reduce((sum, s) => sum + s.total, 0);
                  const totalItems = purchases.reduce((sum, s) => sum + s.items.reduce((is, i) => is + i.quantity, 0), 0);
                  return (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{purchases.length}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">طلب</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">{totalSpent.toLocaleString()}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">د.ع منفق</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{totalItems}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">قطعة</p>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {selectedAccount.role !== "manager" && (
                <button
                  onClick={() => { handleUpgradeClick(selectedAccount); }}
                  className="w-full py-3 rounded-xl text-sm font-medium text-white transition-colors hover:opacity-90"
                  style={{ backgroundColor: selectedAccount.role === "customer" ? "#2563eb" : "#dc2626" }}
                >
                  {selectedAccount.role === "customer" ? "⬆ رفع إلى إداري" : "⬆ رفع إلى مدير"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Upgrade Role Modal */}
      {showRoleModal && upgradeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowRoleModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">ترقية صلاحية</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              تغيير صلاحية <span className="font-semibold text-gray-900 dark:text-white">{upgradeTarget.full_name || upgradeTarget.email}</span>
            </p>
            <select
              value={upgradeRole}
              onChange={(e) => setUpgradeRole(e.target.value as UserRole)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 mb-4"
            >
              <option value="customer">عميل</option>
              <option value="admin">إداري</option>
              <option value="manager">مدير</option>
            </select>
            <div className="flex gap-3">
              <button
                onClick={handleUpgradeConfirm}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: settings.roleThemes.manager.primary }}
              >
                تأكيد الترقية
              </button>
              <button
                onClick={() => setShowRoleModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Account Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">إنشاء حساب جديد</h2>
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الاسم الكامل</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  placeholder="أحمد بحري"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">البريد الإلكتروني</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  placeholder="ahmed@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">كلمة المرور</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الصلاحية</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="admin"> إداري</option>
                  <option value="manager">مدير</option>
                  <option value="customer">عميل</option>
                </select>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white transition-colors"
                  style={{ backgroundColor: settings.roleThemes.manager.primary }}
                >
                  {creating ? "جاري الإنشاء..." : "إنشاء الحساب"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

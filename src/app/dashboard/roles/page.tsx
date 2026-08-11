"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Permission,
  PERMISSION_LABELS,
  getDefaultAdminPermissions,
  getAllPermissionCategories,
  getPermissionsByCategory,
  hasPermission,
  UserPermissionOverride,
} from "@/lib/permissions";
import { getAdminPermissionsConfig, saveAdminPermissionsConfig } from "@/components/PermissionGate";
import { useActivityLog } from "@/lib/activity-log";
import { useAuth } from "@/lib/auth-context";
import { useSettings } from "@/lib/settings-context";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: "manager" | "admin" | "customer";
  jobTitle?: string;
}

const DEFAULT_TEAM_USERS: TeamUser[] = [
  { id: "mgr-001", name: "أحمد بحري", email: "ahmed@bahri.com", role: "manager", jobTitle: "مدير النظام العام" },
  { id: "adm-001", name: "سارة علي", email: "sara@bahri.com", role: "admin", jobTitle: "إداري مبيعات" },
  { id: "adm-002", name: "محمد الحسين", email: "mohammed@bahri.com", role: "admin", jobTitle: "إداري مخزون وتجهيز" },
  { id: "cust-001", name: "حيدر جاسم", email: "haider@customer.com", role: "customer", jobTitle: "زبون جملة مميز" },
];

export default function RolesPage() {
  const { user, loading } = useAuth();
  const { settings, updateSettings } = useSettings();
  const router = useRouter();

  // Mode Tab: "roles" = Role Categories | "users" = Individual User Overrides
  const [activeTab, setActiveTab] = useState<"roles" | "users">("roles");

  // Layer 1: Base Admin Role Permissions
  const [adminPerms, setAdminPerms] = useState<Permission[]>([]);
  const [homeVis, setHomeVis] = useState({
    showLogos: true,
    showShare: true,
    showMap: true,
    showContact: true,
  });

  // Layer 2: Individual User Overrides
  const [usersList, setUsersList] = useState<TeamUser[]>(DEFAULT_TEAM_USERS);
  const [searchUser, setSearchUser] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("adm-001");
  const [allUserOverrides, setAllUserOverrides] = useState<Record<string, Permission[]>>({});

  const [mounted, setMounted] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [savedUserSuccess, setSavedUserSuccess] = useState(false);
  const { logActivity } = useActivityLog();

  // Load Home Menu Visibility from settings
  useEffect(() => {
    if (settings?.homeMenuVisibility) {
      setHomeVis(settings.homeMenuVisibility);
    }
  }, [settings]);

  // Load Admin Config & Users / Overrides from Supabase
  useEffect(() => {
    if (!loading) {
      const config = getAdminPermissionsConfig();
      const isManager = user?.role === "manager";
      const isAdminWithPermission = user?.role === "admin" && hasPermission("admin", "permissions.manage", config);

      if (!user || user.isGuest || (!isManager && !isAdminWithPermission)) {
        router.replace("/");
        return;
      }
      setAdminPerms(config?.permissions || getDefaultAdminPermissions());
      setMounted(true);

      // Fetch users and user permission overrides from Supabase
      loadUsersAndOverrides();
    }
  }, [user, loading, router]);

  const loadUsersAndOverrides = async () => {
    try {
      // 1. Fetch team members
      const { data: teamData } = await supabase.from("team_members").select("*");
      if (teamData && teamData.length > 0) {
        const mappedUsers: TeamUser[] = teamData.map((m: any) => ({
          id: m.id || m.email,
          name: m.full_name || m.name || "مستخدم",
          email: m.email || "",
          role: (m.role as any) || "admin",
          jobTitle: m.job_title || "عضو فريق",
        }));
        setUsersList(mappedUsers);
        if (mappedUsers.length > 0) setSelectedUserId(mappedUsers[0].id);
      }

      // 2. Fetch user permission overrides table
      const { data: overrideData } = await supabase.from("user_permission_overrides").select("*");
      if (overrideData && overrideData.length > 0) {
        const overridesMap: Record<string, Permission[]> = {};
        overrideData.forEach((row: any) => {
          overridesMap[row.user_id] = Array.isArray(row.permissions) ? row.permissions : [];
        });
        setAllUserOverrides(overridesMap);
      } else if (typeof window !== "undefined") {
        // Fallback to localStorage
        const cached = localStorage.getItem("user_permission_overrides_cache");
        if (cached) {
          try {
            setAllUserOverrides(JSON.parse(cached));
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      console.warn("Failed to load user overrides from DB:", err);
    }
  };

  // Selected User Object & Active Overrides
  const selectedUser = useMemo(
    () => usersList.find((u) => u.id === selectedUserId) || usersList[0] || DEFAULT_TEAM_USERS[1],
    [usersList, selectedUserId]
  );

  const currentSelectedUserPerms = useMemo(() => {
    if (!selectedUser) return [];
    if (allUserOverrides[selectedUser.id] !== undefined) {
      return allUserOverrides[selectedUser.id];
    }
    // Default fallback to base role permissions
    return getDefaultAdminPermissions();
  }, [selectedUser, allUserOverrides]);

  const filteredUsers = useMemo(() => {
    if (!searchUser.trim()) return usersList;
    const q = searchUser.trim().toLowerCase();
    return usersList.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.jobTitle && u.jobTitle.toLowerCase().includes(q))
    );
  }, [usersList, searchUser]);

  // Role Level Toggles
  const togglePermission = (perm: Permission) => {
    setAdminPerms((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const toggleCategory = (category: string) => {
    const perms = getPermissionsByCategory(category);
    const allSelected = perms.every((p) => adminPerms.includes(p));
    if (allSelected) {
      setAdminPerms((prev) => prev.filter((p) => !perms.includes(p)));
    } else {
      setAdminPerms((prev) => [...new Set([...prev, ...perms])]);
    }
  };

  // Individual User Level Toggles
  const toggleUserPermission = (perm: Permission) => {
    if (!selectedUser) return;
    const current = currentSelectedUserPerms;
    const updated = current.includes(perm)
      ? current.filter((p) => p !== perm)
      : [...current, perm];

    setAllUserOverrides((prev) => ({
      ...prev,
      [selectedUser.id]: updated,
    }));
  };

  const toggleUserCategory = (category: string) => {
    if (!selectedUser) return;
    const perms = getPermissionsByCategory(category);
    const current = currentSelectedUserPerms;
    const allSelected = perms.every((p) => current.includes(p));
    const updated = allSelected
      ? current.filter((p) => !perms.includes(p))
      : [...new Set([...current, ...perms])];

    setAllUserOverrides((prev) => ({
      ...prev,
      [selectedUser.id]: updated,
    }));
  };

  // Save Global Base Admin Permissions
  const handleSaveGlobalRoles = async () => {
    saveAdminPermissionsConfig({ permissions: adminPerms });
    await updateSettings({ homeMenuVisibility: homeVis });

    if (user?.role === "manager") {
      const { data: existing } = await supabase.from("settings").select("id").limit(1).maybeSingle();
      if (existing?.id) {
        await supabase.from("settings").update({ home_menu_visibility: homeVis }).eq("id", existing.id);
      } else {
        await supabase.from("settings").insert({ home_menu_visibility: homeVis });
      }
    }

    await logActivity({
      user: "manager",
      action: "update",
      entity: "صلاحيات الأدوار الفئوية",
      details: `تم تحديث صلاحيات فئة الإداري ورؤية عناصر الصفحة الرئيسية`,
    });
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
  };

  // Save Individual User Override
  const handleSaveUserOverride = async () => {
    if (!selectedUser) return;
    setSavingUser(true);
    try {
      const userPerms = currentSelectedUserPerms;

      // 1. Upsert into Supabase user_permission_overrides table
      const { error } = await supabase.from("user_permission_overrides").upsert({
        user_id: selectedUser.id,
        user_name: selectedUser.name,
        user_email: selectedUser.email,
        permissions: userPerms,
        updated_at: new Date().toISOString(),
      });

      if (error) console.warn("Supabase user_permission_overrides error:", error.message);

      // 2. Cache locally
      if (typeof window !== "undefined") {
        localStorage.setItem("user_permission_overrides_cache", JSON.stringify(allUserOverrides));
      }

      await logActivity({
        user: "manager",
        action: "update",
        entity: `تخصيص صلاحيات المستخدم: ${selectedUser.name}`,
        details: `تم حفظ ${userPerms.length} صلاحية مخصصة حصراً للمستخدم ${selectedUser.name} (${selectedUser.email})`,
      });

      setSavedUserSuccess(true);
      setTimeout(() => setSavedUserSuccess(false), 2500);
    } catch (err) {
      console.error("Failed to save user permission override:", err);
    } finally {
      setSavingUser(false);
    }
  };

  // Reset Individual User Override to Base Role Defaults
  const handleResetUserOverride = async () => {
    if (!selectedUser) return;
    try {
      await supabase.from("user_permission_overrides").delete().eq("user_id", selectedUser.id);
      setAllUserOverrides((prev) => {
        const copy = { ...prev };
        delete copy[selectedUser.id];
        return copy;
      });
      if (typeof window !== "undefined") {
        const copy = { ...allUserOverrides };
        delete copy[selectedUser.id];
        localStorage.setItem("user_permission_overrides_cache", JSON.stringify(copy));
      }
      setSavedUserSuccess(true);
      setTimeout(() => setSavedUserSuccess(false), 2000);
    } catch (err) {
      console.error("Reset user override error:", err);
    }
  };

  if (!mounted) return null;

  const categories = getAllPermissionCategories();

  return (
    <div className="space-y-6 max-w-5xl w-full" dir="rtl">
      {/* Action Bar Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-white">
            نظام الصلاحيات المزدوج (Dual-Layer RBAC)
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
            إدارة الصلاحيات على مستوى الفئات العامة وتخصيص صلاحيات دقيقة لكل مستخدم بمفرده
          </p>
        </div>

        {/* Primary Tab Switcher */}
        <div className="flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1 border border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab("roles")}
            className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all ${
              activeTab === "roles"
                ? "bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
            }`}
          >
            🏷️ فئات الأدوار العامة
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all ${
              activeTab === "users"
                ? "bg-white dark:bg-gray-900 text-purple-600 dark:text-purple-400 shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
            }`}
          >
            👤 المستخدمين والأفراد (تخصيص)
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: ROLE CATEGORIES MANAGEMENT                                         */}
      {/* ========================================================================= */}
      {activeTab === "roles" && (
        <div className="space-y-6">
          {/* Header Action Row */}
          <div className="flex items-center justify-between bg-blue-50/50 dark:bg-blue-950/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900/40">
            <div>
              <span className="text-xs font-bold text-blue-800 dark:text-blue-300">
                صلاحيات فئة الإداري (Admin): {adminPerms.length} / {Object.keys(PERMISSION_LABELS).length} مفعّلة
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setAdminPerms(getDefaultAdminPermissions())}
                className="px-4 py-2 text-xs font-bold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 transition-colors"
              >
                إعادة تعيين للنسب الافتراضية
              </button>
              <button
                onClick={handleSaveGlobalRoles}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-sm"
              >
                {showSaved ? "✓ تم الحفظ" : "حفظ صلاحيات الفئات"}
              </button>
            </div>
          </div>

          {/* Home Menu Items Visibility Control Card (Managers Only) */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xl font-bold">
                🎯
              </div>
              <div>
                <h3 className="font-extrabold text-base text-gray-900 dark:text-white">
                  صلاحيات ورؤية عناصر القائمة المنسدلة للواجهة الرئيسية (Home Page Dropdown)
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  يمكن للمدير إخفاء أو إظهار الأزرار المنقولة حديثاً في قائمة الصفحة الرئيسية حصراً
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* 1. Logos & Identity */}
              <div className="flex items-center justify-between p-3.5 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-100 dark:border-gray-700/60">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🖼️</span>
                  <div>
                    <p className="text-xs font-bold text-gray-900 dark:text-white">المنتجات / الشعارات والتصميم</p>
                    <p className="text-[11px] text-gray-500">إظهار زر المنتجات والشعارات بالقائمة</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={homeVis.showLogos}
                  onChange={(e) => setHomeVis((prev) => ({ ...prev, showLogos: e.target.checked }))}
                  className="w-5 h-5 accent-blue-600 cursor-pointer"
                />
              </div>

              {/* 2. Store Share & App Links */}
              <div className="flex items-center justify-between p-3.5 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-100 dark:border-gray-700/60">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🔗</span>
                  <div>
                    <p className="text-xs font-bold text-gray-900 dark:text-white">المشاركة</p>
                    <p className="text-[11px] text-gray-500">إظهار زر المشاركة بالقائمة</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={homeVis.showShare}
                  onChange={(e) => setHomeVis((prev) => ({ ...prev, showShare: e.target.checked }))}
                  className="w-5 h-5 accent-blue-600 cursor-pointer"
                />
              </div>

              {/* 3. Store Map Location */}
              <div className="flex items-center justify-between p-3.5 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-100 dark:border-gray-700/60">
                <div className="flex items-center gap-3">
                  <span className="text-xl">📍</span>
                  <div>
                    <p className="text-xs font-bold text-gray-900 dark:text-white">موقعنا على الخريطة</p>
                    <p className="text-[11px] text-gray-500">إظهار زر الخريطة بالقائمة</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={homeVis.showMap}
                  onChange={(e) => setHomeVis((prev) => ({ ...prev, showMap: e.target.checked }))}
                  className="w-5 h-5 accent-blue-600 cursor-pointer"
                />
              </div>

              {/* 4. Contact Support */}
              <div className="flex items-center justify-between p-3.5 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-100 dark:border-gray-700/60">
                <div className="flex items-center gap-3">
                  <span className="text-xl">💬</span>
                  <div>
                    <p className="text-xs font-bold text-gray-900 dark:text-white">التواصل والدعم الفني</p>
                    <p className="text-[11px] text-gray-500">إظهار زر التواصل بالقائمة</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={homeVis.showContact}
                  onChange={(e) => setHomeVis((prev) => ({ ...prev, showContact: e.target.checked }))}
                  className="w-5 h-5 accent-blue-600 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Role Categories Permission Matrix */}
          {categories.map((category) => {
            const perms = getPermissionsByCategory(category);
            const selectedCount = perms.filter((p) => adminPerms.includes(p)).length;
            const allSelected = selectedCount === perms.length;

            return (
              <div key={category} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-xs">
                <div
                  className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  onClick={() => toggleCategory(category)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-colors ${
                        allSelected
                          ? "border-blue-600 bg-blue-600"
                          : selectedCount > 0
                          ? "border-blue-600 bg-blue-100 dark:bg-blue-950"
                          : "border-gray-300 dark:border-gray-600"
                      }`}
                    >
                      {allSelected && <span className="text-white text-xs">✓</span>}
                      {selectedCount > 0 && !allSelected && (
                        <div className="w-2 h-2 rounded-sm bg-blue-600" />
                      )}
                    </div>
                    <h3 className="font-extrabold text-sm text-gray-900 dark:text-white">{category}</h3>
                  </div>
                  <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                    {selectedCount}/{perms.length}
                  </span>
                </div>

                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {perms.map((perm) => {
                    const enabled = adminPerms.includes(perm);
                    return (
                      <label
                        key={perm}
                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors border ${
                          enabled
                            ? "bg-blue-50/40 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/30"
                            : "bg-gray-50/50 dark:bg-gray-800/40 border-gray-100 dark:border-gray-800 opacity-60 hover:opacity-100"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={() => togglePermission(perm)}
                          className="w-4 h-4 accent-blue-600 cursor-pointer"
                        />
                        <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                          {PERMISSION_LABELS[perm].label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: INDIVIDUAL USER OVERRIDES MANAGER                                  */}
      {/* ========================================================================= */}
      {activeTab === "users" && (
        <div className="space-y-6">
          {/* User Selector & Search Bar */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-purple-200 dark:border-purple-800/40 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xl font-bold">
                  👥
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-gray-900 dark:text-white">
                    إدارة الصلاحيات الفردية للموظفين والمستخدمين
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    حدد مستخدماً معيناً لإضافة صلاحيات خاصة به تتجاوز حدود فئته الأصلية
                  </p>
                </div>
              </div>

              {/* Search User Input */}
              <input
                type="text"
                placeholder="🔍 بحث عن موظف بالاسم أو الإيميل..."
                value={searchUser}
                onChange={(e) => setSearchUser(e.target.value)}
                className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs font-bold text-gray-900 dark:text-white outline-none focus:border-purple-500 w-full sm:w-64"
              />
            </div>

            {/* Horizontal User Selector Chips */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-1 scrollbar-thin">
              {filteredUsers.map((u) => {
                const isSelected = u.id === selectedUserId;
                const hasOverride = allUserOverrides[u.id] !== undefined;

                return (
                  <button
                    key={u.id}
                    onClick={() => setSelectedUserId(u.id)}
                    className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all border flex-shrink-0 ${
                      isSelected
                        ? "bg-purple-600 text-white border-purple-600 shadow-md"
                        : "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <span>👤</span>
                    <span>{u.name}</span>
                    <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${isSelected ? "bg-white/20 text-white" : "bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300"}`}>
                      {u.role === "manager" ? "مدير" : u.role === "admin" ? "إداري" : "زبون"}
                    </span>
                    {hasOverride && (
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="يحتوي على تخصيص فردي" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected User Header Card & Individual Action Controls */}
          {selectedUser && (
            <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white rounded-2xl p-5 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-purple-700/40">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">👤</span>
                  <h3 className="font-extrabold text-lg text-white">{selectedUser.name}</h3>
                  <span className="px-2 py-0.5 rounded-lg text-xs font-extrabold bg-purple-500/30 border border-purple-400/40 text-purple-200">
                    {selectedUser.jobTitle || selectedUser.role}
                  </span>
                </div>
                <p className="text-xs text-purple-200 mt-1">
                  البريد الإلكتروني: {selectedUser.email || "غير محدد"} | الصلاحيات المخصصة: {currentSelectedUserPerms.length} / {Object.keys(PERMISSION_LABELS).length}
                </p>
              </div>

              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  onClick={handleResetUserOverride}
                  className="flex-1 sm:flex-initial px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs font-extrabold rounded-xl border border-white/20 transition-all"
                >
                  🔄 إعادة تعيين للفئة
                </button>
                <button
                  onClick={handleSaveUserOverride}
                  disabled={savingUser}
                  className={`flex-1 sm:flex-initial px-5 py-2.5 text-xs font-extrabold text-white rounded-xl shadow-md transition-all ${
                    savedUserSuccess
                      ? "bg-emerald-600"
                      : savingUser
                      ? "bg-gray-500 cursor-not-allowed"
                      : "bg-purple-600 hover:bg-purple-500 hover:scale-[1.02]"
                  }`}
                >
                  {savedUserSuccess ? "✅ تم الحفظ!" : savingUser ? "جارٍ الحفظ..." : "💾 حفظ الصلاحيات الفردية"}
                </button>
              </div>
            </div>
          )}

          {/* Granular User Override Matrix */}
          {selectedUser && categories.map((category) => {
            const perms = getPermissionsByCategory(category);
            const userPerms = currentSelectedUserPerms;
            const selectedCount = perms.filter((p) => userPerms.includes(p)).length;
            const allSelected = selectedCount === perms.length;

            return (
              <div key={category} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-xs">
                <div
                  className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  onClick={() => toggleUserCategory(category)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-colors ${
                        allSelected
                          ? "border-purple-600 bg-purple-600"
                          : selectedCount > 0
                          ? "border-purple-600 bg-purple-100 dark:bg-purple-950"
                          : "border-gray-300 dark:border-gray-600"
                      }`}
                    >
                      {allSelected && <span className="text-white text-xs">✓</span>}
                      {selectedCount > 0 && !allSelected && (
                        <div className="w-2 h-2 rounded-sm bg-purple-600" />
                      )}
                    </div>
                    <h3 className="font-extrabold text-sm text-gray-900 dark:text-white">{category}</h3>
                  </div>
                  <span className="text-xs font-bold text-purple-600 dark:text-purple-400">
                    {selectedCount}/{perms.length}
                  </span>
                </div>

                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {perms.map((perm) => {
                    const enabled = userPerms.includes(perm);
                    const baseEnabled = adminPerms.includes(perm);
                    const isCustomOverride = allUserOverrides[selectedUser.id] !== undefined;

                    return (
                      <label
                        key={perm}
                        className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors border ${
                          enabled
                            ? "bg-purple-50/40 dark:bg-purple-950/20 border-purple-100 dark:border-purple-900/30"
                            : "bg-gray-50/50 dark:bg-gray-800/40 border-gray-100 dark:border-gray-800 opacity-60 hover:opacity-100"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={() => toggleUserPermission(perm)}
                            className="w-4 h-4 accent-purple-600 cursor-pointer"
                          />
                          <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                            {PERMISSION_LABELS[perm].label}
                          </span>
                        </div>

                        {/* Status pill indicating inheritance vs custom override */}
                        {isCustomOverride ? (
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${enabled ? "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300" : "bg-gray-200 dark:bg-gray-700 text-gray-500"}`}>
                            ⚡ تخصيص فردي
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-500">
                            افتراضي (الفئة)
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

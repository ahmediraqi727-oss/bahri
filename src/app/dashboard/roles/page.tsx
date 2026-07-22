"use client";

import { useState, useEffect } from "react";
import {
  Permission,
  PERMISSION_LABELS,
  getDefaultAdminPermissions,
  getAllPermissionCategories,
  getPermissionsByCategory,
} from "@/lib/permissions";
import { getAdminPermissionsConfig, saveAdminPermissionsConfig } from "@/components/PermissionGate";
import { useActivityLog } from "@/lib/activity-log";

export default function RolesPage() {
  const [adminPerms, setAdminPerms] = useState<Permission[]>([]);
  const [mounted, setMounted] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const { logActivity } = useActivityLog();

  useEffect(() => {
    const config = getAdminPermissionsConfig();
    setAdminPerms(config?.permissions || getDefaultAdminPermissions());
    setMounted(true);
  }, []);

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

  const handleSave = async () => {
    saveAdminPermissionsConfig({ permissions: adminPerms });
    await logActivity({
      user: "manager",
      action: "update",
      entity: "صلاحيات الإداري",
      details: `تم تعديل صلاحيات الإداري: ${adminPerms.length} صلاحية مفعلة`,
    });
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
  };

  const handleReset = () => {
    setAdminPerms(getDefaultAdminPermissions());
  };

  if (!mounted) return null;

  const categories = getAllPermissionCategories();

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">إدارة صلاحيات الإداري</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            تحديد الصلاحيات التي يمكن للإداري الوصول إليها
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            إعادة تعيين
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors hover:opacity-90"
            style={{ backgroundColor: "var(--primary)" }}
          >
            {showSaved ? "✓ تم الحفظ" : "حفظ الصلاحيات"}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            الصلاحيات المفعلة للإداري
          </span>
          <span className="text-sm font-bold" style={{ color: "var(--primary)" }}>
            {adminPerms.length} / {Object.keys(PERMISSION_LABELS).length}
          </span>
        </div>
        <div className="mt-3 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="h-2 rounded-full transition-all"
            style={{
              width: `${(adminPerms.length / Object.keys(PERMISSION_LABELS).length) * 100}%`,
              backgroundColor: "var(--primary)",
            }}
          />
        </div>
      </div>

      {/* Permission categories */}
      {categories.map((category) => {
        const perms = getPermissionsByCategory(category);
        const selectedCount = perms.filter((p) => adminPerms.includes(p)).length;
        const allSelected = selectedCount === perms.length;

        return (
          <div key={category} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div
              className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              onClick={() => toggleCategory(category)}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    allSelected
                      ? "border-[var(--primary)] bg-[var(--primary)]"
                      : selectedCount > 0
                      ? "border-[var(--primary)] bg-[var(--primary)]/20"
                      : "border-gray-300 dark:border-gray-600"
                  }`}
                >
                  {allSelected && <span className="text-white text-xs">✓</span>}
                  {selectedCount > 0 && !allSelected && (
                    <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: "var(--primary)" }} />
                  )}
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white">{category}</h3>
              </div>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {selectedCount}/{perms.length}
              </span>
            </div>

            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2">
              {perms.map((perm) => {
                const enabled = adminPerms.includes(perm);
                return (
                  <label
                    key={perm}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      enabled
                        ? "bg-gray-50 dark:bg-gray-800"
                        : "opacity-60 hover:opacity-100"
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        enabled
                          ? "border-[var(--primary)] bg-[var(--primary)]"
                          : "border-gray-300 dark:border-gray-600"
                      }`}
                      onClick={(e) => { e.preventDefault(); togglePermission(perm); }}
                    >
                      {enabled && <span className="text-white text-xs">✓</span>}
                    </div>
                    <span className="text-sm text-gray-700 dark:text-gray-300">
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
  );
}

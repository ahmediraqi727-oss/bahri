"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { hasPermission } from "@/lib/permissions";
import { getAdminPermissionsConfig } from "@/components/PermissionGate";
import BarcodeManagementHub from "@/components/BarcodeManagementHub";
import { useSettings } from "@/lib/settings-context";

export default function ScannerDashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { settings } = useSettings();
  const theme = settings?.roleThemes?.[settings?.currentRole || "manager"] || {};

  useEffect(() => {
    if (loading) return;
    const adminConfig = getAdminPermissionsConfig();
    const isManager = user?.role === "manager";
    const isAdminWithPerm =
      user?.role === "admin" &&
      hasPermission("admin", "scanner.admin_generate", adminConfig);

    if (!user || user.isGuest || (!isManager && !isAdminWithPerm)) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6" dir="rtl">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg"
            style={{ background: `linear-gradient(135deg, ${theme.primary || "#2563eb"}, ${theme.secondary || "#7c3aed"})` }}
          >
            📷
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">
              مركز إدارة الباركود والـ QR
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              توليد وإدارة ومراجعة أكواد الباركود لجميع المنتجات
            </p>
          </div>
        </div>

        {/* Info Banner */}
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 flex items-start gap-3 mt-4">
          <span className="text-xl mt-0.5">ℹ</span>
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <strong>نظام 1-to-1 صارم:</strong> كل باركود أو QR مرتبط بمنتج واحد فقط ولا يمكن مشاركته بين منتجين.
            التوليد التلقائي يستخدم صيغة EAN-13 متوافقة مع أجهزة المسح العالمية.
          </div>
        </div>
      </div>

      <BarcodeManagementHub />
    </div>
  );
}

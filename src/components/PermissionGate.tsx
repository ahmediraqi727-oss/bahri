"use client";

import { useSettings } from "@/lib/settings-context";
import { useAuth } from "@/lib/auth-context";
import { hasPermission, Permission, AdminPermissionsConfig } from "@/lib/permissions";

export function getAdminPermissionsConfig(): AdminPermissionsConfig | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const stored = localStorage.getItem("ahmed-bahri-admin-perms");
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return undefined;
}

export function saveAdminPermissionsConfig(config: AdminPermissionsConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem("ahmed-bahri-admin-perms", JSON.stringify(config));
}

export function getUserPermissionOverrideFromStorage(userId?: string): Permission[] | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const cached = localStorage.getItem("user_permission_overrides_cache");
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && Array.isArray(parsed[userId])) {
        return parsed[userId];
      }
    }
  } catch { /* ignore */ }
  return null;
}

interface PermissionGateProps {
  permission: Permission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function PermissionGate({ permission, children, fallback = null }: PermissionGateProps) {
  const { settings } = useSettings();
  const { user } = useAuth();
  const config = getAdminPermissionsConfig();
  const userOverride = getUserPermissionOverrideFromStorage(user?.id);

  if (hasPermission(settings.currentRole, permission, config, userOverride)) {
    return <>{children}</>;
  }
  return <>{fallback}</>;
}

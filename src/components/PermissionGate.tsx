"use client";

import { useSettings } from "@/lib/settings-context";
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

interface PermissionGateProps {
  permission: Permission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function PermissionGate({ permission, children, fallback = null }: PermissionGateProps) {
  const { settings } = useSettings();
  const config = getAdminPermissionsConfig();

  if (hasPermission(settings.currentRole, permission, config)) {
    return <>{children}</>;
  }
  return <>{fallback}</>;
}

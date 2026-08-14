import { UserRole } from "./types";

export type Permission =
  | "products.view"
  | "products.create"
  | "products.edit"
  | "products.delete"
  | "categories.view"
  | "categories.manage"
  | "suppliers.view"
  | "suppliers.create"
  | "suppliers.edit"
  | "suppliers.delete"
  | "inventory.view"
  | "inventory.edit"
  | "orders.view"
  | "orders.create"
  | "orders.edit"
  | "orders.delete"
  | "customers.view"
  | "customers.edit"
  | "customers.delete"
  | "reports.view"
  | "reports.financial"
  | "activity.view"
  | "trash.view"
  | "trash.restore"
  | "trash.permanent_delete"
  | "settings.view"
  | "settings.edit"
  | "permissions.manage"
  // ─── QR Scanner Management ──────────────────────────────────────────────
  | "scanner.view_button"     // زر فتح الماسح
  | "scanner.use_camera"      // ماسح الكاميرا
  | "scanner.use_image_upload" // رفع صورة باركود
  | "scanner.use_manual_entry" // إدخال يدوي
  | "scanner.use_hardware"    // ماسح الحديد (USB/Bluetooth)
  | "scanner.admin_generate"; // توليد باركود تلقائي (admin فقط)

export interface AdminPermissionsConfig {
  permissions: Permission[];
}

export interface CustomerPermissionsConfig {
  permissions: Permission[];
}

export interface UserPermissionOverride {
  id?: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  permissions: Permission[];
}

const MANAGER_PERMISSIONS: Permission[] = [
  "products.view", "products.create", "products.edit", "products.delete",
  "categories.view", "categories.manage",
  "suppliers.view", "suppliers.create", "suppliers.edit", "suppliers.delete",
  "inventory.view", "inventory.edit",
  "orders.view", "orders.create", "orders.edit", "orders.delete",
  "customers.view", "customers.edit", "customers.delete",
  "reports.view", "reports.financial",
  "activity.view",
  "trash.view", "trash.restore", "trash.permanent_delete",
  "settings.view", "settings.edit",
  "permissions.manage",
  // QR Scanner — full access for manager
  "scanner.view_button", "scanner.use_camera", "scanner.use_image_upload",
  "scanner.use_manual_entry", "scanner.use_hardware", "scanner.admin_generate",
];

const DEFAULT_ADMIN_PERMISSIONS: Permission[] = [
  "products.view", "products.create", "products.edit",
  "categories.view", "categories.manage",
  "suppliers.view",
  "inventory.view",
  "orders.view", "orders.create",
  "customers.view",
  // QR Scanner — standard admin access (no bulk generation)
  "scanner.view_button", "scanner.use_camera", "scanner.use_image_upload",
  "scanner.use_manual_entry", "scanner.use_hardware",
];

const CUSTOMER_PERMISSIONS: Permission[] = [
  "products.view",
  "orders.create",
];

export const PERMISSION_LABELS: Record<Permission, { label: string; category: string }> = {
  "products.view": { label: "عرض المنتجات", category: "المنتجات" },
  "products.create": { label: "إضافة منتجات", category: "المنتجات" },
  "products.edit": { label: "تعديل المنتجات", category: "المنتجات" },
  "products.delete": { label: "حذف المنتجات", category: "المنتجات" },
  "categories.view": { label: "عرض الأقسام والإحصائيات", category: "الأقسام" },
  "categories.manage": { label: "إدارة وتعديل الأقسام والمنتجات", category: "الأقسام" },
  "suppliers.view": { label: "عرض الموردين", category: "الموردين" },
  "suppliers.create": { label: "إضافة موردين", category: "الموردين" },
  "suppliers.edit": { label: "تعديل الموردين", category: "الموردين" },
  "suppliers.delete": { label: "حذف الموردين", category: "الموردين" },
  "inventory.view": { label: "عرض المخزون", category: "المخزون" },
  "inventory.edit": { label: "تعديل المخزون", category: "المخزون" },
  "orders.view": { label: "عرض الطلبات", category: "الطلبات" },
  "orders.create": { label: "إنشاء طلبات", category: "الطلبات" },
  "orders.edit": { label: "تعديل الطلبات", category: "الطلبات" },
  "orders.delete": { label: "حذف الطلبات", category: "الطلبات" },
  "customers.view": { label: "عرض الزبائن", category: "الزبائن" },
  "customers.edit": { label: "تعديل الزبائن", category: "الزبائن" },
  "customers.delete": { label: "حذف الزبائن", category: "الزبائن" },
  "reports.view": { label: "عرض التقارير", category: "التقارير" },
  "reports.financial": { label: "التقارير المالية", category: "التقارير" },
  "activity.view": { label: "عرض سجل الحركات", category: "الأمان" },
  "trash.view": { label: "عرض سلة المهملات", category: "الأمان" },
  "trash.restore": { label: "استعادة من سلة المهملات", category: "الأمان" },
  "trash.permanent_delete": { label: "حذف نهائي من السلة", category: "الأمان" },
  "settings.view": { label: "عرض الإعدادات", category: "النظام" },
  "settings.edit": { label: "تعديل الإعدادات", category: "النظام" },
  "permissions.manage": { label: "إدارة صلاحيات الأدوار", category: "النظام" },
  // ─── QR Scanner Management ──────────────────────────────────────────────────
  "scanner.view_button": { label: "إظهار زر الماسح الضوئي", category: "ماسح الباركود" },
  "scanner.use_camera": { label: "استخدام ماسح الكاميرا المباشر", category: "ماسح الباركود" },
  "scanner.use_image_upload": { label: "رفع صورة باركود للمسح", category: "ماسح الباركود" },
  "scanner.use_manual_entry": { label: "إدخال رقم الباركود يدوياً", category: "ماسح الباركود" },
  "scanner.use_hardware": { label: "استخدام ماسح الحديد (USB / Bluetooth)", category: "ماسح الباركود" },
  "scanner.admin_generate": { label: "توليد وإدارة الباركود تلقائياً", category: "ماسح الباركود" },
};

export function getRolePermissions(
  role: UserRole,
  adminConfig?: AdminPermissionsConfig,
  customerConfig?: CustomerPermissionsConfig
): Permission[] {
  switch (role) {
    case "manager":
      return MANAGER_PERMISSIONS;
    case "admin":
      return adminConfig?.permissions || DEFAULT_ADMIN_PERMISSIONS;
    case "customer":
      return customerConfig?.permissions || CUSTOMER_PERMISSIONS;
  }
}

export function hasPermission(
  role: UserRole,
  permission: Permission,
  adminConfig?: AdminPermissionsConfig,
  userOverride?: UserPermissionOverride | Permission[] | null
): boolean {
  // Layer 1: Check Granular Individual User Override first
  if (userOverride) {
    const userPerms = Array.isArray(userOverride)
      ? userOverride
      : userOverride.permissions || [];
    return userPerms.includes(permission);
  }

  // Layer 2: Fallback to Base Role Category Permission
  const perms = getRolePermissions(role, adminConfig);
  return perms.includes(permission);
}

export function hasAnyPermission(
  role: UserRole,
  permissions: Permission[],
  adminConfig?: AdminPermissionsConfig,
  userOverride?: UserPermissionOverride | Permission[] | null
): boolean {
  return permissions.some((p) => hasPermission(role, p, adminConfig, userOverride));
}

export function getDefaultAdminPermissions(): Permission[] {
  return [...DEFAULT_ADMIN_PERMISSIONS];
}

export function getDefaultCustomerPermissions(): Permission[] {
  return [...CUSTOMER_PERMISSIONS];
}

export function getCustomerPermissionsConfig(): CustomerPermissionsConfig | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const stored = localStorage.getItem("ahmed-bahri-customer-perms");
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return undefined;
}

export function saveCustomerPermissionsConfig(config: CustomerPermissionsConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem("ahmed-bahri-customer-perms", JSON.stringify(config));
}

export function getAllPermissionCategories(): string[] {
  const cats = new Set<string>();
  Object.values(PERMISSION_LABELS).forEach((v) => cats.add(v.category));
  return Array.from(cats);
}

export function getPermissionsByCategory(category: string): Permission[] {
  return (Object.keys(PERMISSION_LABELS) as Permission[]).filter(
    (p) => PERMISSION_LABELS[p].category === category
  );
}

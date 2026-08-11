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
  | "permissions.manage";

export interface AdminPermissionsConfig {
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
];

const DEFAULT_ADMIN_PERMISSIONS: Permission[] = [
  "products.view", "products.create", "products.edit",
  "categories.view", "categories.manage",
  "suppliers.view",
  "inventory.view",
  "orders.view", "orders.create",
  "customers.view",
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
};

export function getRolePermissions(role: UserRole, adminConfig?: AdminPermissionsConfig): Permission[] {
  switch (role) {
    case "manager":
      return MANAGER_PERMISSIONS;
    case "admin":
      return adminConfig?.permissions || DEFAULT_ADMIN_PERMISSIONS;
    case "customer":
      return CUSTOMER_PERMISSIONS;
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

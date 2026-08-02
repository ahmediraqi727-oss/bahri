"use client";

import CategoriesManager from "@/components/CategoriesManager";
import PermissionGate from "@/components/PermissionGate";

export default function CategoriesPage() {
  return (
    <PermissionGate permission="categories.view">
      <div className="space-y-6" dir="rtl">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">إدارة الأقسام وإحصائيات المخزون</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            عرض وتعديل الأقسام، تتبع عدد الزيارات، وتقارير تنبيهات المخزون لكل قسم
          </p>
        </div>

        <CategoriesManager />
      </div>
    </PermissionGate>
  );
}

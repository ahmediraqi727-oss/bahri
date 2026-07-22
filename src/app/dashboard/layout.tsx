"use client";

import { useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import DashboardAssistant from "@/components/DashboardAssistant";
import { useSettings } from "@/lib/settings-context";
import { useAuth } from "@/lib/auth-context";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { settings, setCurrentRole } = useSettings();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (user) setCurrentRole(user.role);
  }, [user, setCurrentRole]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-4">يجب تسجيل الدخول أولاً</p>
          <a href="/login" className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors">
            تسجيل الدخول
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex min-h-screen ${settings.darkMode ? "dark" : ""}`}
      style={{ fontFamily: settings.fontFamily }}
    >
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 bg-gray-50 dark:bg-gray-950 overflow-y-auto">
          {children}
        </main>
      </div>
      <DashboardAssistant />
    </div>
  );
}

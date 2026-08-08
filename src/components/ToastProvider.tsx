"use client";

/**
 * ==========================================
 * ToastProvider.tsx
 * Enterprise-Grade Toast Notification System
 * أحمد بحري Dashboard
 * ==========================================
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastType = "success" | "error" | "warning" | "info" | "loading";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number; // ms — 0 = persistent
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  toasts: Toast[];
  toast: (opts: Omit<Toast, "id">) => string;
  success: (title: string, message?: string) => string;
  error: (title: string, message?: string) => string;
  warning: (title: string, message?: string) => string;
  info: (title: string, message?: string) => string;
  loading: (title: string, message?: string, existingId?: string) => string;
  update: (id: string, opts: Partial<Omit<Toast, "id">>) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
  /** Replace/update a loading toast in-place once the operation completes */
  resolve: (id: string, type: Omit<ToastType, "loading">, title: string, message?: string) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const dismissAll = useCallback(() => {
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current.clear();
    setToasts([]);
  }, []);

  const scheduleAutoDismiss = useCallback(
    (id: string, duration: number) => {
      if (duration <= 0) return;
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  const toast = useCallback(
    (opts: Omit<Toast, "id">): string => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const duration = opts.duration !== undefined ? opts.duration : opts.type === "loading" ? 0 : 4500;
      setToasts((prev) => [{ ...opts, id, duration }, ...prev].slice(0, 6));
      scheduleAutoDismiss(id, duration);
      return id;
    },
    [scheduleAutoDismiss]
  );

  const success = useCallback(
    (title: string, message?: string) => toast({ type: "success", title, message }),
    [toast]
  );
  const error = useCallback(
    (title: string, message?: string) => toast({ type: "error", title, message, duration: 6000 }),
    [toast]
  );
  const warning = useCallback(
    (title: string, message?: string) => toast({ type: "warning", title, message }),
    [toast]
  );
  const info = useCallback(
    (title: string, message?: string) => toast({ type: "info", title, message }),
    [toast]
  );
  
  const update = useCallback((id: string, opts: Partial<Omit<Toast, "id">>) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...opts } : t))
    );
  }, []);

  const loading = useCallback(
    (title: string, message?: string, existingId?: string) => {
      if (existingId) {
        // Update existing toast in-place without adding new item to array
        setToasts((prev) =>
          prev.map((t) =>
            t.id === existingId
              ? { ...t, title, message, type: "loading" }
              : t
          )
        );
        return existingId;
      }

      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const newToast: Toast = { id, title, message, type: "loading", duration: 0 };
      setToasts((prev) => [newToast, ...prev].slice(0, 6));
      return id;
    },
    []
  );

  const resolve = useCallback(
    (id: string, type: Omit<ToastType, "loading">, title: string, message?: string) => {
      const duration = type === "error" ? 6000 : 4500;
      setToasts((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                type: type as ToastType,
                title,
                message,
                duration,
              }
            : t
        )
      );
      scheduleAutoDismiss(id, duration);
    },
    [scheduleAutoDismiss]
  );

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timers.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  return (
    <ToastContext.Provider
      value={{ toasts, toast, success, error, warning, info, loading, update, dismiss, dismissAll, resolve }}
    >
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

// ─── Visual Config ────────────────────────────────────────────────────────────

const TOAST_CONFIG: Record<
  ToastType,
  { icon: string; bg: string; border: string; text: string; progress: string }
> = {
  success: {
    icon: "✓",
    bg: "bg-emerald-50 dark:bg-emerald-950/80",
    border: "border-emerald-500/40 dark:border-emerald-500/30",
    text: "text-emerald-900 dark:text-emerald-200",
    progress: "bg-emerald-500",
  },
  error: {
    icon: "✕",
    bg: "bg-rose-50 dark:bg-rose-950/80",
    border: "border-rose-500/40 dark:border-rose-500/30",
    text: "text-rose-900 dark:text-rose-200",
    progress: "bg-rose-500",
  },
  warning: {
    icon: "⚠",
    bg: "bg-amber-50 dark:bg-amber-950/80",
    border: "border-amber-500/40 dark:border-amber-500/30",
    text: "text-amber-900 dark:text-amber-200",
    progress: "bg-amber-500",
  },
  info: {
    icon: "ℹ",
    bg: "bg-blue-50 dark:bg-blue-950/80",
    border: "border-blue-500/40 dark:border-blue-500/30",
    text: "text-blue-900 dark:text-blue-200",
    progress: "bg-blue-500",
  },
  loading: {
    icon: "⏳",
    bg: "bg-indigo-50 dark:bg-indigo-950/80",
    border: "border-indigo-500/40 dark:border-indigo-500/30",
    text: "text-indigo-900 dark:text-indigo-200",
    progress: "bg-indigo-500",
  },
};

// ─── UI Container & Cards ─────────────────────────────────────────────────────

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-5 left-5 z-[99999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const config = TOAST_CONFIG[toast.type];

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-xl backdrop-blur-md transition-all duration-300 transform translate-y-0 ${config.bg} ${config.border} ${config.text}`}
      role="alert"
    >
      <div className="text-xl flex-shrink-0 font-bold leading-none mt-0.5">
        {toast.type === "loading" ? (
          <svg className="animate-spin h-5 w-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        ) : (
          config.icon
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-bold leading-snug">{toast.title}</h4>
        {toast.message && <p className="text-xs opacity-90 mt-1 leading-relaxed break-words">{toast.message}</p>}
      </div>

      <button
        onClick={() => onDismiss(toast.id)}
        className="flex-shrink-0 text-xs opacity-60 hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10"
        aria-label="Dismiss toast"
      >
        ✕
      </button>
    </div>
  );
}

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
  loading: (title: string, message?: string) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
  /** Replace a loading toast once the operation completes */
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
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
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
  const loading = useCallback(
    (title: string, message?: string) => toast({ type: "loading", title, message, duration: 0 }),
    [toast]
  );

  const resolve = useCallback(
    (id: string, type: Omit<ToastType, "loading">, title: string, message?: string) => {
      dismiss(id);
      toast({ type: type as ToastType, title, message });
    },
    [dismiss, toast]
  );

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timers.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  return (
    <ToastContext.Provider
      value={{ toasts, toast, success, error, warning, info, loading, dismiss, dismissAll, resolve }}
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
    icon: "✅",
    bg: "from-emerald-950/95 to-emerald-900/95",
    border: "border-emerald-500/40",
    text: "text-emerald-100",
    progress: "bg-emerald-400",
  },
  error: {
    icon: "❌",
    bg: "from-red-950/95 to-red-900/95",
    border: "border-red-500/40",
    text: "text-red-100",
    progress: "bg-red-400",
  },
  warning: {
    icon: "⚠️",
    bg: "from-amber-950/95 to-amber-900/95",
    border: "border-amber-500/40",
    text: "text-amber-100",
    progress: "bg-amber-400",
  },
  info: {
    icon: "ℹ️",
    bg: "from-blue-950/95 to-blue-900/95",
    border: "border-blue-500/40",
    text: "text-blue-100",
    progress: "bg-blue-400",
  },
  loading: {
    icon: "⏳",
    bg: "from-slate-900/95 to-slate-800/95",
    border: "border-slate-500/40",
    text: "text-slate-100",
    progress: "bg-slate-400",
  },
};

// ─── Toast Item ───────────────────────────────────────────────────────────────

function ToastItem({ t, onDismiss }: { t: Toast; onDismiss: (id: string) => void }) {
  const cfg = TOAST_CONFIG[t.type];
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(100);

  // Slide-in animation
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Progress bar tick
  useEffect(() => {
    if (!t.duration || t.duration <= 0) return;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 100 - (elapsed / t.duration!) * 100);
      setProgress(pct);
      if (pct > 0) requestAnimationFrame(tick);
    };
    const raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [t.duration]);

  return (
    <div
      dir="rtl"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0)" : "translateX(100%)",
        transition: "opacity 0.3s ease, transform 0.35s cubic-bezier(0.34,1.56,0.64,1)",
      }}
      className={`
        relative overflow-hidden min-w-[280px] max-w-[360px] w-full
        rounded-2xl border backdrop-blur-xl shadow-2xl
        bg-gradient-to-br ${cfg.bg} ${cfg.border}
        p-3.5
      `}
    >
      <div className="flex items-start gap-3">
        <span className="text-xl mt-0.5 shrink-0" role="img" aria-label={t.type}>
          {t.type === "loading" ? (
            <span className="inline-block animate-spin">⏳</span>
          ) : (
            cfg.icon
          )}
        </span>

        <div className="flex-1 min-w-0">
          <p className={`font-bold text-sm leading-snug ${cfg.text}`}>{t.title}</p>
          {t.message && (
            <p className={`mt-0.5 text-xs opacity-80 leading-relaxed ${cfg.text}`}>{t.message}</p>
          )}
          {t.action && (
            <button
              onClick={t.action.onClick}
              className={`mt-2 text-xs font-bold underline underline-offset-2 ${cfg.text} opacity-90 hover:opacity-100 transition-opacity`}
            >
              {t.action.label}
            </button>
          )}
        </div>

        <button
          onClick={() => onDismiss(t.id)}
          className={`shrink-0 mt-0.5 text-sm opacity-50 hover:opacity-100 transition-opacity ${cfg.text}`}
          aria-label="إغلاق"
        >
          ✕
        </button>
      </div>

      {/* Animated progress bar */}
      {t.duration && t.duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10">
          <div
            className={`h-full ${cfg.progress} transition-none`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Container ────────────────────────────────────────────────────────────────

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="الإشعارات"
      className="fixed top-5 left-5 z-[9999] flex flex-col gap-2.5 pointer-events-none"
      style={{ maxWidth: "90vw" }}
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem t={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export type ToastVariant = "default" | "success" | "error" | "info";

export interface ToastItem {
  id: string;
  title?: string;
  message: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  showToast: (toast: Omit<ToastItem, "id">) => string;
  dismissToast: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const dismissToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = React.useCallback(
    (toast: Omit<ToastItem, "id">) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: ToastItem = { ...toast, id };

      setToasts((prev) => [...prev, newToast]);

      const duration = toast.duration ?? 4000;
      if (duration > 0) {
        setTimeout(() => {
          dismissToast(id);
        }, duration);
      }

      return id;
    },
    [dismissToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export interface ToastViewportProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] left-3 right-3 z-50 mx-auto flex w-auto max-w-sm flex-col gap-2 p-0 sm:bottom-24 sm:left-auto sm:right-4 sm:mx-0 sm:w-full"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
}

export interface ToastCardProps {
  toast: ToastItem;
  onDismiss: () => void;
  className?: string;
}

const iconMap: Record<ToastVariant, React.ReactNode> = {
  default: <Info className="h-5 w-5 text-[var(--primary)] shrink-0" />,
  success: <CheckCircle2 className="h-5 w-5 text-[var(--success)] shrink-0" />,
  error: <AlertCircle className="h-5 w-5 text-[var(--destructive)] shrink-0" />,
  info: <Info className="h-5 w-5 text-[var(--accent)] shrink-0" />,
};

const borderVariantClasses: Record<ToastVariant, string> = {
  default: "border-l-4 border-l-[var(--primary)]",
  success: "border-l-4 border-l-[var(--success)]",
  error: "border-l-4 border-l-[var(--destructive)]",
  info: "border-l-4 border-l-[var(--accent)]",
};

export function ToastCard({ toast, onDismiss, className }: ToastCardProps) {
  const variant = toast.variant ?? "default";

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 text-[var(--text-primary)] shadow-[var(--shadow-card)] transition-all",
        borderVariantClasses[variant],
        className
      )}
    >
      <div className="pt-0.5">{iconMap[variant]}</div>
      <div className="flex-1 space-y-0.5">
        {toast.title && (
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)]">
            {toast.title}
          </h4>
        )}
        <p className="text-sm text-[var(--text-secondary)] leading-snug">
          {toast.message}
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

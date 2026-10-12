"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export type SheetSide = "bottom" | "right" | "left";

export interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  side?: SheetSide;
  className?: string;
}

export function Sheet({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  side = "bottom",
  className,
}: SheetProps) {
  // Prevent background scroll when sheet is open
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sideClasses: Record<SheetSide, string> = {
    bottom:
      "inset-x-0 bottom-0 max-h-[90vh] rounded-t-[var(--radius-xl)] border-t border-[var(--border-subtle)] shadow-[var(--shadow-sheet)] animate-in slide-in-from-bottom duration-250",
    right:
      "inset-y-0 right-0 h-full w-full sm:max-w-md border-l border-[var(--border-subtle)] shadow-[var(--shadow-elevated)] animate-in slide-in-from-right duration-250",
    left:
      "inset-y-0 left-0 h-full w-full sm:max-w-md border-r border-[var(--border-subtle)] shadow-[var(--shadow-elevated)] animate-in slide-in-from-left duration-250",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === "string" ? title : "Drawer"}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[var(--bg-overlay)] backdrop-blur-xs transition-opacity cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet Content Container */}
      <div
        className={cn(
          "fixed z-50 flex flex-col bg-[var(--bg-surface)] text-[var(--text-primary)] overflow-hidden",
          sideClasses[side],
          className
        )}
      >
        {/* Mobile drag handle indicator for bottom sheet */}
        {side === "bottom" && (
          <div className="flex justify-center pt-3 pb-1">
            <div className="h-1.5 w-12 rounded-full bg-[var(--border-strong)] opacity-60" />
          </div>
        )}

        {/* Header */}
        {(title || description) && (
          <div className="flex items-start justify-between p-5 pb-3 border-b border-[var(--border-subtle)]">
            <div className="space-y-1 pr-6">
              {title && (
                <h3 className="font-serif text-xl font-semibold leading-none text-[var(--text-primary)]">
                  {title}
                </h3>
              )}
              {description && (
                <p className="text-sm text-[var(--text-secondary)]">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Body content */}
        <div className="flex-1 overflow-y-auto p-5">{children}</div>

        {/* Optional Footer */}
        {footer && (
          <div className="p-4 sm:p-5 border-t border-[var(--border-subtle)] bg-[var(--bg-subtle)]/50">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export type SheetSide = "bottom" | "right" | "left" | "center";

export interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  side?: SheetSide;
  className?: string;
  contentClassName?: string;
  footerClassName?: string;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Sheet({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  side = "bottom",
  className,
  contentClassName,
  footerClassName,
}: SheetProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLElement | null>(null);

  // Focus trap and return focus on close
  React.useEffect(() => {
    if (!isOpen) return;

    // Save previous active element to restore focus on close
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      triggerRef.current = document.activeElement;
    }

    const originalOverflow = document.body.style.overflow;
    const originalOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";

    // Set initial focus inside sheet after mount
    const timer = setTimeout(() => {
      if (!containerRef.current) return;
      const focusable = containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        containerRef.current.focus();
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab") {
        if (!containerRef.current) return;
        const focusable = Array.from(
          containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter((el) => !el.hasAttribute("disabled") && (el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0));

        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || !containerRef.current.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !containerRef.current.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      document.body.style.overscrollBehavior = originalOverscroll;

      // Return focus on close
      const triggerEl = triggerRef.current;
      if (triggerEl && typeof triggerEl.focus === "function") {
        setTimeout(() => {
          if (document.contains(triggerEl)) {
            triggerEl.focus();
          }
        }, 0);
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sideClasses: Record<SheetSide, string> = {
    bottom:
      "inset-x-0 bottom-0 max-h-[90vh] rounded-t-[var(--radius-xl)] border-t border-[var(--border-subtle)] shadow-[var(--shadow-sheet)] animate-sheet-slide-up",
    right:
      "inset-y-0 right-0 h-full w-full sm:max-w-md border-l border-[var(--border-subtle)] shadow-[var(--shadow-elevated)] animate-in slide-in-from-right duration-250",
    center:
      "inset-x-0 bottom-0 max-h-[94dvh] h-auto rounded-t-[var(--radius-xl)] border-t border-[var(--border-subtle)] shadow-[var(--shadow-sheet)] animate-sheet-slide-up sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[min(92vw,680px)] sm:max-h-[88dvh] sm:rounded-[var(--radius-xl)] sm:border sm:shadow-[var(--shadow-elevated)] sm:animate-in sm:fade-in sm:zoom-in-95 sm:duration-200",
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
        className="fixed inset-0 bg-[var(--bg-overlay)] backdrop-blur-xs transition-opacity cursor-pointer animate-sheet-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet Content Container */}
      <div
        ref={containerRef}
        tabIndex={-1}
        className={cn(
          "fixed z-50 flex flex-col bg-[var(--bg-surface)] text-[var(--text-primary)] overflow-hidden focus:outline-none",
          sideClasses[side],
          className
        )}
      >
        {/* Mobile drag handle indicator for bottom and center sheets */}
        {(side === "bottom" || side === "center") && (
          <div className="flex sm:hidden justify-center pt-3 pb-1">
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
        <div className={cn("min-h-0 flex-1 overflow-y-auto p-5", contentClassName)}>{children}</div>

        {/* Optional Footer */}
        {footer && (
          <div className={cn("border-t border-[var(--border-subtle)] bg-[var(--bg-subtle)]/50 p-4 sm:p-5", footerClassName)}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

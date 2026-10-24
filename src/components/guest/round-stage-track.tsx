"use client";

import * as React from "react";
import { Check, AlertCircle } from "lucide-react";
import type { OrderStatus } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { STEPS, getStepIndex } from "./order-stepper";

export interface RoundStageTrackProps {
  status: OrderStatus;
  createdAt?: string;
  className?: string;
}

export function formatStageTime(isoString?: string): string | null {
  if (!isoString) return null;
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return null;
  }
}

export function RoundStageTrack({
  status,
  createdAt,
  className,
}: RoundStageTrackProps) {
  if (status === "cancelled") {
    return (
      <div
        data-testid="round-stage-cancelled"
        className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-2.5 text-xs text-red-700 dark:text-red-300"
      >
        <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
        <div>
          <span className="font-semibold">Cancelled</span>
          <p className="text-[11px] text-[var(--text-secondary)]">
            This order was cancelled and is excluded from the tab bill.
          </p>
        </div>
      </div>
    );
  }

  const currentStepIdx = getStepIndex(status);
  const placedTime = formatStageTime(createdAt);

  return (
    <div
      data-testid="round-stage-track"
      className={cn("w-full py-1.5", className)}
    >
      <div className="relative flex items-center justify-between">
        {/* Background track line */}
        <div
          aria-hidden="true"
          className="absolute top-3.5 left-4 right-4 h-0.5 bg-[var(--border-subtle)] -z-0"
        />

        {/* Dynamic active progress line */}
        <div
          aria-hidden="true"
          className="absolute top-3.5 left-4 h-0.5 bg-[var(--primary)] transition-all duration-300 motion-reduce:transition-none -z-0"
          style={{
            width: `${Math.max(0, Math.min(100, (currentStepIdx / (STEPS.length - 1)) * 100))}%`,
          }}
        />

        {STEPS.map((step, idx) => {
          const isCompleted = currentStepIdx > idx;
          const isCurrent = Math.floor(currentStepIdx) === idx;
          // Step 3 (served): if served, it is both completed and current
          const isServedCurrent = status === "served" && step.key === "served";
          const stepStatus = isCompleted || isServedCurrent ? "completed" : isCurrent ? "current" : "upcoming";

          return (
            <div
              key={step.key}
              data-testid={`stage-step-${step.key}`}
              data-stage-status={stepStatus}
              data-stage-current={isCurrent ? "true" : "false"}
              className="relative z-10 flex flex-col items-center flex-1 text-center"
            >
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold transition-colors motion-reduce:transition-none shadow-xs",
                  isCompleted || isServedCurrent
                    ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                    : isCurrent
                    ? "border-[var(--primary)] bg-[var(--bg-surface)] text-[var(--primary)] ring-2 ring-[var(--primary)]/30 animate-pulse motion-reduce:animate-none"
                    : "border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-muted)]"
                )}
                aria-label={`${step.label}: ${stepStatus}`}
              >
                {isCompleted || isServedCurrent ? (
                  <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                ) : (
                  <span className="text-[10px] font-mono">{idx + 1}</span>
                )}
              </div>

              <span
                className={cn(
                  "mt-1 text-[11px] font-semibold leading-tight",
                  isCurrent || isCompleted || isServedCurrent
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-muted)]"
                )}
              >
                {step.label}
              </span>

              {/* Time display: show on Placed if available */}
              {step.key === "placed" && placedTime && (
                <span className="text-[9px] font-mono text-[var(--text-secondary)] mt-0.5 leading-none">
                  {placedTime}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

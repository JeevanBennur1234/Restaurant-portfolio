import * as React from "react";
import type { OrderStatus } from "@/server/db/schema";
import { Check, Clock, Flame, BellRing, Sparkles, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface OrderStepperProps {
  status: OrderStatus;
  className?: string;
}

interface StepConfig {
  key: OrderStatus;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const STEPS: StepConfig[] = [
  {
    key: "placed",
    label: "Placed",
    description: "Sent to kitchen",
    icon: <Clock className="h-4 w-4" />,
  },
  {
    key: "preparing",
    label: "Preparing",
    description: "Cooking at the stove",
    icon: <Flame className="h-4 w-4" />,
  },
  {
    key: "ready",
    label: "Ready",
    description: "Plated for table",
    icon: <BellRing className="h-4 w-4" />,
  },
  {
    key: "served",
    label: "Served",
    description: "Enjoy your meal",
    icon: <Sparkles className="h-4 w-4" />,
  },
];

// Helper to determine step index (treating 'accepted' as part of placed/preparing transition)
function getStepIndex(status: OrderStatus): number {
  switch (status) {
    case "placed":
      return 0;
    case "accepted":
      return 0.5;
    case "preparing":
      return 1;
    case "ready":
      return 2;
    case "served":
      return 3;
    case "cancelled":
      return -1;
    default:
      return 0;
  }
}

export function OrderStepper({ status, className }: OrderStepperProps) {
  if (status === "cancelled") {
    return (
      <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--destructive-border)] bg-[var(--destructive-subtle)] p-4 text-[var(--destructive-foreground)]">
        <AlertCircle className="h-5 w-5 shrink-0 text-[var(--destructive)]" />
        <div>
          <h4 className="font-semibold text-sm">Order Cancelled</h4>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            This order has been cancelled. Please talk to the restaurant staff for help.
          </p>
        </div>
      </div>
    );
  }

  const currentStepIdx = getStepIndex(status);

  return (
    <div className={cn("w-full py-4", className)}>
      <div className="relative flex items-center justify-between">
        {/* Continuous progress background track */}
        <div className="absolute top-5 left-6 right-6 h-1 bg-[var(--border-subtle)] -z-0" />

        {/* Dynamic active progress line */}
        <div
          className="absolute top-5 left-6 h-1 bg-[var(--primary)] transition-all duration-500 -z-0"
          style={{
            width: `${Math.max(0, Math.min(100, (currentStepIdx / 3) * 100))}%`,
          }}
        />

        {/* Step Circles */}
        {STEPS.map((step, idx) => {
          const isCompleted = currentStepIdx > idx;
          const isCurrent = Math.floor(currentStepIdx) === idx;

          return (
            <div
              key={step.key}
              className="relative z-10 flex flex-col items-center flex-1 text-center"
            >
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300 shadow-xs",
                  isCompleted
                    ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                    : isCurrent
                    ? "border-[var(--primary)] bg-[var(--bg-surface)] text-[var(--primary)] ring-4 ring-[var(--primary-subtle)] animate-pulse"
                    : "border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-muted)]"
                )}
              >
                {isCompleted ? <Check className="h-5 w-5 stroke-[2.5]" /> : step.icon}
              </div>

              <span
                className={cn(
                  "mt-2 text-xs font-semibold leading-tight",
                  isCurrent || isCompleted
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-muted)]"
                )}
              >
                {step.label}
              </span>

              <span className="text-[10px] text-[var(--text-muted)] hidden sm:block mt-0.5">
                {step.description}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

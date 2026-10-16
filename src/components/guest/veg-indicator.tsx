import * as React from "react";
import { cn } from "@/lib/utils";

export interface VegIndicatorProps {
  isVeg: boolean;
  className?: string;
  size?: "sm" | "md";
}

export function VegIndicator({ isVeg, className, size = "md" }: VegIndicatorProps) {
  const containerSize = size === "sm" ? "h-3.5 w-3.5 p-0.5" : "h-4 w-4 p-0.5";
  const innerSize = size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2";

  return (
    <div
      role="img"
      aria-label={isVeg ? "Vegetarian" : "Non-Vegetarian"}
      title={isVeg ? "Vegetarian" : "Non-Vegetarian"}
      className={cn(
        "inline-flex items-center justify-center rounded-xs border shrink-0",
        containerSize,
        isVeg
          ? "border-emerald-600 bg-emerald-50/50"
          : "border-amber-900 bg-amber-50/50",
        className
      )}
    >
      <div
        className={cn(
          "rounded-full",
          innerSize,
          isVeg ? "bg-emerald-600" : "bg-amber-900"
        )}
      />
    </div>
  );
}

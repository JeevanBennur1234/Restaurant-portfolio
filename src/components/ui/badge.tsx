import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "default"
  | "secondary"
  | "accent"
  | "success"
  | "destructive"
  | "outline";

export type BadgeSize = "sm" | "md";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
}

const variantStyles: Record<BadgeVariant, string> = {
  default:
    "bg-[var(--primary-subtle)] text-[var(--primary)] border border-transparent font-medium",
  secondary:
    "bg-[var(--secondary-subtle)] text-[var(--secondary)] border border-transparent font-medium",
  accent:
    "bg-[var(--accent-subtle)] text-[var(--accent-foreground)] border border-transparent font-medium",
  success:
    "bg-[var(--success-subtle)] text-[var(--success-foreground)] border border-[var(--success-border)] font-medium",
  destructive:
    "bg-[var(--destructive-subtle)] text-[var(--destructive-foreground)] border border-[var(--destructive-border)] font-medium",
  outline:
    "bg-transparent text-[var(--text-secondary)] border border-[var(--border-strong)]",
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: "text-xs px-2 py-0.5 rounded-full tracking-wide font-medium",
  md: "text-xs sm:text-sm px-2.5 py-1 rounded-full tracking-wide font-medium",
};

export function Badge({
  className,
  variant = "default",
  size = "md",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center font-sans uppercase transition-colors select-none leading-none",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    />
  );
}

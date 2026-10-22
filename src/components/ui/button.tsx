import * as React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive"
  | "accent";

export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] active:bg-[var(--primary-active)] shadow-sm focus-visible:ring-[var(--primary)]",
  secondary:
    "bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:bg-[var(--secondary-hover)] shadow-sm focus-visible:ring-[var(--secondary)]",
  outline:
    "border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] focus-visible:ring-[var(--primary)]",
  ghost:
    "text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] active:bg-[var(--bg-muted)] focus-visible:ring-[var(--primary)]",
  destructive:
    "bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:bg-[var(--destructive-hover)] focus-visible:ring-[var(--destructive)]",
  accent:
    "bg-[var(--accent)] text-[var(--primary-foreground)] hover:bg-[var(--accent-hover)] focus-visible:ring-[var(--accent)]",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-xs sm:text-sm font-medium gap-1.5 rounded-[var(--radius-sm)] min-h-[36px]",
  md: "h-11 px-4 text-sm sm:text-base font-semibold gap-2 rounded-[var(--radius-md)] min-h-[44px]",
  lg: "h-12 sm:h-13 px-6 text-base sm:text-lg font-semibold gap-2.5 rounded-[var(--radius-lg)] min-h-[48px]",
  icon: "h-11 w-11 min-h-[44px] min-w-[44px] p-0 rounded-[var(--radius-md)] justify-center",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      children,
      type = "button",
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-colors select-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-current" />
        ) : (
          leftIcon
        )}
        {children}
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = "Button";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type = "text",
      label,
      error,
      helperText,
      leftIcon,
      rightIcon,
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const hasError = Boolean(error);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs sm:text-sm font-medium uppercase tracking-wider text-[var(--text-secondary)]"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="pointer-events-none absolute left-3 flex items-center text-[var(--text-muted)]">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            type={type}
            disabled={disabled}
            aria-invalid={hasError ? "true" : "false"}
            className={cn(
              "flex h-11 w-full rounded-[var(--radius-md)] border bg-[var(--bg-surface)] px-3.5 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-colors",
              "border-[var(--border-subtle)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ring-focus)]",
              "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--bg-subtle)]",
              leftIcon && "pl-10",
              rightIcon && "pr-10",
              hasError &&
                "border-[var(--destructive)] focus:border-[var(--destructive)] focus:ring-[var(--destructive-subtle)]",
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 flex items-center text-[var(--text-muted)]">
              {rightIcon}
            </div>
          )}
        </div>
        {error ? (
          <p className="text-xs font-medium text-[var(--destructive)] animate-in fade-in-50">
            {error}
          </p>
        ) : helperText ? (
          <p className="text-xs text-[var(--text-muted)]">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = "Input";

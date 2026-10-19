"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowRight, QrCode } from "lucide-react";

export function TableTokenForm() {
  const router = useRouter();
  const [tokenInput, setTokenInput] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const handleGo = React.useCallback(() => {
    const raw = tokenInput.trim();

    if (!raw) {
      setError("Please enter a table token or URL");
      return;
    }

    let token = raw;

    // Check if input is a URL
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      try {
        const parsed = new URL(raw);
        if (
          typeof window !== "undefined" &&
          parsed.origin !== window.location.origin
        ) {
          setError(
            "External URLs are not allowed. Please enter a table code or same-origin link."
          );
          return;
        }
        const match = parsed.pathname.match(/\/t\/([a-zA-Z0-9_-]+)/);
        if (match?.[1]) {
          token = match[1];
        } else {
          setError("The URL does not contain a valid /t/[token] table route.");
          return;
        }
      } catch {
        setError("Invalid URL format.");
        return;
      }
    } else if (raw.startsWith("/")) {
      const match = raw.match(/\/t\/([a-zA-Z0-9_-]+)/);
      if (match?.[1]) {
        token = match[1];
      } else {
        setError("The path does not contain a valid /t/[token] table route.");
        return;
      }
    }

    token = token.trim();

    // Validate token charset: only alphanumeric, dashes, and underscores (1 to 128 characters)
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(token)) {
      setError(
        "Invalid table token format. Only alphanumeric characters, dashes, and underscores are allowed."
      );
      return;
    }

    setError(null);
    router.push(`/t/${encodeURIComponent(token)}`);
  }, [tokenInput, router]);

  return (
    <div className="space-y-3">
      <div>
        <label
          htmlFor="table-token-input"
          className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5"
        >
          Enter Table Code or Paste QR Link
        </label>
        <div className="relative">
          <input
            id="table-token-input"
            data-testid="table-token-input"
            type="text"
            value={tokenInput}
            onChange={(e) => {
              setTokenInput(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleGo();
              }
            }}
            placeholder="e.g. da7a9437e11a3995... or http://.../t/..."
            className="w-full text-sm rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-3 pr-10 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] transition-all font-mono min-h-[48px]"
          />
          <QrCode className="absolute right-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-muted)] pointer-events-none" />
        </div>
        {error && (
          <p className="text-xs text-[var(--destructive)] mt-1 font-medium">
            {error}
          </p>
        )}
      </div>

      <Button
        type="button"
        variant="primary"
        size="md"
        onClick={handleGo}
        data-testid="submit-table-token-btn"
        className="w-full justify-between shadow-xs min-h-[48px]"
        rightIcon={<ArrowRight className="h-4 w-4" />}
      >
        <span>Open Table Ordering</span>
      </Button>
    </div>
  );
}

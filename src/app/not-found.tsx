import Link from "next/link";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-6 sm:p-8 shadow-[var(--shadow-card)] text-center space-y-5">
        <div className="space-y-1">
          <span className="font-mono text-xs uppercase tracking-widest text-[var(--accent)] font-semibold">
            Error 404
          </span>
          <h1 className="font-serif text-3xl font-bold text-[var(--text-primary)]">
            Page Not Found
          </h1>
        </div>

        <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
          The requested page, dining table, or dashboard view could not be found. It may have been moved or the table link has expired.
        </p>

        <div className="pt-2">
          <Link href="/" className="w-full">
            <Button
              variant="primary"
              size="md"
              className="w-full justify-center"
              leftIcon={<Home className="h-4 w-4" />}
            >
              Return Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UtensilsCrossed, ArrowRight, Sparkles } from "lucide-react";

export default function HomePage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 sm:py-20 max-w-4xl mx-auto w-full text-center">
      {/* Editorial Header */}
      <div className="inline-flex items-center gap-2 mb-6">
        <Badge variant="accent" size="sm" className="gap-1">
          <Sparkles className="h-3 w-3" />
          Demo Restaurant
        </Badge>
        <span className="text-xs uppercase tracking-widest text-[var(--text-muted)] font-mono">
          DinePulse
        </span>
      </div>

      <h1 className="font-serif text-4xl sm:text-6xl font-bold tracking-tight text-[var(--text-primary)] mb-4">
        Masala Lane
      </h1>

      <p className="font-serif italic text-lg sm:text-xl text-[var(--primary)] mb-6">
        Warm Flavours, Editorial Dining & Seamless Table Ordering
      </p>

      <p className="max-w-xl text-base text-[var(--text-secondary)] leading-relaxed mb-10">
        Experience digital dining designed for modern hospitality. No app installation required—simply tap below to explore the guest demo experience.
      </p>

      {/* Primary CTA */}
      <div className="flex flex-col sm:flex-row items-center gap-4 mb-16">
        <Link href="/demo">
          <Button size="lg" className="px-8 shadow-md group">
            <span>Launch Demo</span>
            <ArrowRight className="h-4 w-4 ml-1 transition-transform group-hover:translate-x-1" />
          </Button>
        </Link>
      </div>

      {/* Brand Aesthetic Card Preview */}
      <div className="w-full max-w-md text-left">
        <Card hoverable className="border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <Badge variant="default" size="sm">
                Design System
              </Badge>
              <UtensilsCrossed className="h-4 w-4 text-[var(--primary)]" />
            </div>
            <CardTitle className="text-lg mt-2">Masala Lane Palette</CardTitle>
            <CardDescription>
              Warm terracotta, rich charcoal, and turmeric gold tokens mapped via CSS variables.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-2 pt-1 text-center text-[10px] font-mono">
              <div className="flex flex-col items-center gap-1">
                <div className="h-8 w-full rounded-[var(--radius-sm)] bg-[var(--primary)]" />
                <span className="text-[var(--text-muted)]">Terracotta</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="h-8 w-full rounded-[var(--radius-sm)] bg-[var(--secondary)]" />
                <span className="text-[var(--text-muted)]">Espresso</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="h-8 w-full rounded-[var(--radius-sm)] bg-[var(--accent)]" />
                <span className="text-[var(--text-muted)]">Turmeric</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="h-8 w-full rounded-[var(--radius-sm)] bg-[var(--bg-subtle)] border border-[var(--border-subtle)]" />
                <span className="text-[var(--text-muted)]">Cream</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

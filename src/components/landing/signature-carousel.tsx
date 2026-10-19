"use client";

import * as React from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface SignatureDishItem {
  id: string;
  slug: string;
  name: string;
  oneLine: string;
  price: string;
  isVeg: boolean;
  imageSrc: string;
  isOptimized?: boolean;
}

export interface SignatureCarouselProps {
  dishes: SignatureDishItem[];
}

export function SignatureCarousel({ dishes }: SignatureCarouselProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(true);
  const [failedImages, setFailedImages] = React.useState<Record<string, boolean>>({});

  const checkScrollState = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
  }, []);

  React.useEffect(() => {
    checkScrollState();
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScrollState, { passive: true });
    window.addEventListener("resize", checkScrollState);
    return () => {
      el.removeEventListener("scroll", checkScrollState);
      window.removeEventListener("resize", checkScrollState);
    };
  }, [checkScrollState]);

  const scroll = (direction: "left" | "right") => {
    const el = containerRef.current;
    if (!el) return;
    const scrollAmount = Math.min(el.clientWidth * 0.85, 400);
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      scroll("left");
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      scroll("right");
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Controls (Accessible Navigation Buttons) */}
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => scroll("left")}
          disabled={!canScrollLeft}
          aria-label="Previous dishes"
          className="h-11 w-11 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] flex items-center justify-center transition-all hover:bg-[var(--bg-subtle)] disabled:opacity-30 disabled:cursor-not-allowed shadow-xs active:scale-95"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => scroll("right")}
          disabled={!canScrollRight}
          aria-label="Next dishes"
          className="h-11 w-11 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] flex items-center justify-center transition-all hover:bg-[var(--bg-subtle)] disabled:opacity-30 disabled:cursor-not-allowed shadow-xs active:scale-95"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Swipeable & Scroll-Snap Row */}
      <div
        ref={containerRef}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="region"
        aria-label="Signature dishes carousel. Use left and right arrow keys to navigate."
        className="flex gap-6 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-4 outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] rounded-[var(--radius-lg)] scrollbar-none"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {dishes.map((dish) => {
          const hasError = failedImages[dish.id];
          const displaySrc = hasError ? "/images/dish-placeholder.svg" : dish.imageSrc;

          return (
            <article
              key={dish.id}
              className="snap-start shrink-0 w-[84vw] sm:w-[340px] md:w-[370px] flex flex-col rounded-[var(--radius-xl)] overflow-hidden bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] hover:border-[var(--border-strong)] hover:shadow-md transition-all group"
            >
              {/* Card Image Banner */}
              <div className="relative aspect-[4/3] w-full bg-[var(--bg-subtle)] overflow-hidden">
                <Image
                  src={displaySrc}
                  alt={dish.name}
                  fill
                  loading="lazy"
                  sizes="(max-width: 640px) 85vw, (max-width: 1024px) 45vw, 370px"
                  unoptimized={hasError || !dish.isOptimized}
                  onError={() => {
                    setFailedImages((prev) => ({ ...prev, [dish.id]: true }));
                  }}
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />
                <div className="absolute top-3.5 left-3.5 z-10">
                  <Badge
                    variant="secondary"
                    size="sm"
                    className={`font-mono text-[10px] tracking-wider uppercase font-semibold ${
                      dish.isVeg
                        ? "bg-emerald-900/90 text-emerald-100 border-emerald-700/50"
                        : "bg-amber-950/90 text-amber-100 border-amber-800/50"
                    }`}
                  >
                    {dish.isVeg ? "VEG" : "NON-VEG"}
                  </Badge>
                </div>
              </div>

              {/* Card Content */}
              <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-serif text-xl font-bold tracking-tight text-[var(--text-primary)]">
                      {dish.name}
                    </h3>
                    <span className="font-sans font-bold text-base text-[var(--primary)] shrink-0">
                      {dish.price}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-2">
                    {dish.oneLine}
                  </p>
                </div>

                <div className="flex items-center justify-between w-full pt-3.5 border-t border-[var(--border-subtle)] text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  <span>Dine-In Signature</span>
                  <span className="text-[var(--primary)] font-medium">Scan Table QR to Order</span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

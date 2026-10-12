"use client";

import * as React from "react";
import Image from "next/image";
import { formatPaiseToINR } from "@/lib/currency";
import { VegIndicator } from "./veg-indicator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Plus, Utensils } from "lucide-react";
import type { GuestMenuItem } from "@/server/queries/guest";

export interface MenuItemCardProps {
  item: GuestMenuItem;
  onSelect: (item: GuestMenuItem) => void;
}

export function MenuItemCard({ item, onSelect }: MenuItemCardProps) {
  const isAvailable = item.isAvailable;
  const hasModifiers = item.modifiers.length > 0;

  return (
    <article
      onClick={() => {
        if (isAvailable) onSelect(item);
      }}
      className={`group relative flex gap-3.5 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--shadow-card)] transition-all ${
        isAvailable
          ? "cursor-pointer hover:border-[var(--border-strong)] active:scale-[0.99]"
          : "opacity-60 cursor-not-allowed bg-[var(--bg-subtle)]/40"
      }`}
    >
      {/* Left Details */}
      <div className="flex flex-1 flex-col justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <VegIndicator isVeg={item.isVeg} size="sm" />
            {hasModifiers && isAvailable && (
              <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--accent)] bg-[var(--accent-subtle)] px-1.5 py-0.5 rounded">
                Customizable
              </span>
            )}
            {!isAvailable && (
              <Badge variant="destructive" size="sm" className="text-[10px]">
                Sold Out
              </Badge>
            )}
          </div>

          <h3 className="font-serif text-base font-semibold leading-snug text-[var(--text-primary)]">
            {item.name}
          </h3>

          {item.description && (
            <p className="line-clamp-2 text-xs text-[var(--text-secondary)] leading-relaxed">
              {item.description}
            </p>
          )}
        </div>

        {/* Price & Prep Time footer */}
        <div className="mt-3 flex items-center justify-between pt-1">
          <div className="flex items-baseline gap-2">
            <span className="font-sans text-sm font-bold text-[var(--primary)]">
              {formatPaiseToINR(item.pricePaise)}
            </span>
            <span className="flex items-center gap-0.5 text-[11px] text-[var(--text-muted)]">
              <Clock className="h-3 w-3" />
              {item.prepTimeMinutes} min
            </span>
          </div>

          <div className="sm:hidden">
            <Button
              size="sm"
              variant={isAvailable ? "outline" : "ghost"}
              disabled={!isAvailable}
              onClick={(e) => {
                e.stopPropagation();
                if (isAvailable) onSelect(item);
              }}
              className="h-7 px-2.5 text-xs font-semibold rounded-full"
            >
              {isAvailable ? (
                <>
                  <Plus className="h-3 w-3 mr-0.5" /> Add
                </>
              ) : (
                "Unavailable"
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Right Visual Image / Placeholder */}
      <div className="relative flex flex-col items-center justify-between w-24 h-24 sm:w-28 sm:h-28 shrink-0">
        <div className="relative h-full w-full overflow-hidden rounded-[var(--radius-md)] bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
          {item.imageUrl ? (
            <Image
              src={item.imageUrl}
              alt={item.name}
              width={112}
              height={112}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center p-2 text-center text-[var(--text-muted)]">
              <Utensils className="h-6 w-6 opacity-30 text-[var(--primary)]" />
              <span className="mt-1 text-[9px] font-mono uppercase tracking-wider opacity-60">
                {item.isVeg ? "Veg" : "Non-Veg"}
              </span>
            </div>
          )}
        </div>

        {/* Desktop Add Button Overlay */}
        <div className="hidden sm:block absolute -bottom-2 w-auto">
          <Button
            size="sm"
            variant={isAvailable ? "primary" : "outline"}
            disabled={!isAvailable}
            onClick={(e) => {
              e.stopPropagation();
              if (isAvailable) onSelect(item);
            }}
            className="h-6 px-3 text-[11px] font-semibold rounded-full shadow-xs"
          >
            {isAvailable ? "ADD" : "OUT"}
          </Button>
        </div>
      </div>
    </article>
  );
}

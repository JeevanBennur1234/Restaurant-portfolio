"use client";

import * as React from "react";
import Image from "next/image";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { VegIndicator } from "./veg-indicator";
import { formatPaiseToINR } from "@/lib/currency";
import { Clock, Minus, Plus, Utensils } from "lucide-react";
import { useCart } from "./cart-context";
import { useToast } from "@/components/ui/toast";
import type { GuestMenuItem, GuestModifier } from "@/lib/api/types";

export interface ItemDetailSheetProps {
  item: GuestMenuItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ItemDetailSheet({ item, isOpen, onClose }: ItemDetailSheetProps) {
  if (!item) return null;

  return (
    <ItemDetailInner
      key={item.id}
      item={item}
      isOpen={isOpen}
      onClose={onClose}
    />
  );
}

interface ItemDetailInnerProps {
  item: GuestMenuItem;
  isOpen: boolean;
  onClose: () => void;
}

function ItemDetailInner({ item, isOpen, onClose }: ItemDetailInnerProps) {
  const [bannerError, setBannerError] = React.useState(false);
  const { addItem } = useCart();
  const { showToast } = useToast();

  // Group modifiers by groupName
  const modifierGroups = React.useMemo(() => {
    const groups = new Map<string, GuestModifier[]>();
    for (const mod of item.modifiers) {
      const list = groups.get(mod.groupName) ?? [];
      list.push(mod);
      groups.set(mod.groupName, list);
    }
    return groups;
  }, [item]);

  // Initial required modifiers computed during state initialization
  const [selectedModifierIds, setSelectedModifierIds] = React.useState<string[]>(
    () => {
      const initial: string[] = [];
      modifierGroups.forEach((mods) => {
        const hasRequired = mods.some((m) => m.isRequired);
        if (hasRequired && mods.length > 0) {
          initial.push(mods[0].id);
        }
      });
      return initial;
    }
  );

  const [quantity, setQuantity] = React.useState(1);
  const isAvailable = item.isAvailable;

  const toggleModifier = (mod: GuestModifier, isRadioGroup: boolean) => {
    setSelectedModifierIds((prev) => {
      if (isRadioGroup) {
        const groupModIds = new Set(
          (modifierGroups.get(mod.groupName) ?? []).map((m) => m.id)
        );
        const filtered = prev.filter((id) => !groupModIds.has(id));
        return [...filtered, mod.id];
      } else {
        return prev.includes(mod.id)
          ? prev.filter((id) => id !== mod.id)
          : [...prev, mod.id];
      }
    });
  };

  // Compute total for this configuration
  const modifierTotalPaise = selectedModifierIds.reduce((sum, id) => {
    const mod = item.modifiers.find((m) => m.id === id);
    return sum + (mod ? mod.pricePaise : 0);
  }, 0);

  const unitTotalPaise = item.pricePaise + modifierTotalPaise;
  const lineTotalPaise = unitTotalPaise * quantity;

  const handleAddToCart = () => {
    if (!isAvailable) return;

    addItem(item.id, quantity, selectedModifierIds);
    showToast({
      title: "Added to Cart",
      message: `${quantity}× ${item.name}`,
      variant: "success",
      duration: 2500,
    });
    onClose();
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      side="bottom"
      className="max-h-[88vh] sm:max-w-md sm:mx-auto sm:rounded-t-[var(--radius-xl)]"
      footer={
        <div className="space-y-2">
          {/* Detailed Price Breakdown */}
          {modifierTotalPaise > 0 && (
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] px-1">
              <span>
                Base {formatPaiseToINR(item.pricePaise)} + Customizations{" "}
                {formatPaiseToINR(modifierTotalPaise)}
              </span>
              <span className="font-mono text-[var(--text-muted)]">
                {quantity} × {formatPaiseToINR(unitTotalPaise)}
              </span>
            </div>
          )}

          <div className="flex items-center gap-3">
            {/* Quantity Stepper (min 44px tap targets) */}
            <div className="flex items-center border border-[var(--border-strong)] rounded-[var(--radius-md)] bg-[var(--bg-surface)]">
              <button
                type="button"
                disabled={quantity <= 1 || !isAvailable}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="h-11 w-11 min-h-[44px] min-w-[44px] flex items-center justify-center p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 cursor-pointer"
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center text-sm font-semibold font-mono text-[var(--text-primary)]">
                {quantity}
              </span>
              <button
                type="button"
                disabled={quantity >= 20 || !isAvailable}
                onClick={() => setQuantity((q) => Math.min(20, q + 1))}
                className="h-11 w-11 min-h-[44px] min-w-[44px] flex items-center justify-center p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 cursor-pointer"
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {/* Add CTA (min 48px height) */}
            <Button
              size="lg"
              variant="primary"
              disabled={!isAvailable}
              onClick={handleAddToCart}
              className="flex-1 justify-between shadow-md px-4 text-xs sm:text-sm min-w-0 min-h-[48px] h-12 font-semibold"
            >
              <span className="truncate pr-1">
                {isAvailable ? "Add to Order" : "Unavailable"}
              </span>
              <span className="font-mono font-bold shrink-0">
                {formatPaiseToINR(lineTotalPaise)}
              </span>
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Full-bleed Photography Banner with WCAG AA Dark Overlay & Graceful Fallback */}
        {item.imageUrl && !bannerError ? (
          <div className="relative -mx-5 -mt-5 h-52 sm:h-64 overflow-hidden rounded-t-[var(--radius-xl)] bg-[var(--bg-subtle)]">
            <Image
              src={item.imageUrl}
              alt={item.name}
              fill
              sizes="(max-width: 640px) 100vw, 480px"
              className="object-cover"
              onError={() => setBannerError(true)}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
            <div className="absolute bottom-3 left-4 right-4 text-white flex items-center justify-between">
              <span className="eyebrow text-[10px] text-amber-300">
                Freshly Prepared · {item.prepTimeMinutes} mins
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-stone-200 bg-black/40 px-2 py-0.5 rounded-full border border-white/20">
                {item.isVeg ? "Vegetarian" : "Non-Veg"}
              </span>
            </div>
          </div>
        ) : (
          <div className="relative -mx-5 -mt-5 h-40 sm:h-48 overflow-hidden rounded-t-[var(--radius-xl)] bg-gradient-to-br from-[#2E2723] via-[#3D332D] to-[#1F1A18] flex flex-col justify-end p-4 border-b border-[var(--border-subtle)]">
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <Utensils className="h-4 w-4 text-[#D97706]" />
                <span className="eyebrow text-[10px] text-amber-300">
                  Freshly Prepared · {item.prepTimeMinutes} mins
                </span>
              </div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-stone-300 bg-white/10 px-2 py-0.5 rounded-full">
                {item.isVeg ? "Vegetarian" : "Non-Veg"}
              </span>
            </div>
          </div>
        )}

        {/* Item Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <VegIndicator isVeg={item.isVeg} />
            <span className="flex items-center gap-1 text-xs text-[var(--text-muted)] font-mono">
              <Clock className="h-3 w-3" />
              {item.prepTimeMinutes} min prep
            </span>
          </div>

          <h2 className="font-serif text-2xl font-bold leading-tight text-[var(--text-primary)]">
            {item.name}
          </h2>

          <div className="text-lg font-bold text-[var(--primary)] font-sans">
            {formatPaiseToINR(item.pricePaise)}
          </div>

          {item.description && (
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed pt-1">
              {item.description}
            </p>
          )}
        </div>

        {/* Modifiers List */}
        {modifierGroups.size > 0 && (
          <div className="space-y-5 border-t border-[var(--border-subtle)] pt-4">
            {Array.from(modifierGroups.entries()).map(([groupName, mods], groupIndex) => {
              const isRadio = mods.some((m) => m.isRequired);

              return (
                <div key={groupName} className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-[var(--accent)]">
                        {String(groupIndex + 1).padStart(2, "0")} /
                      </span>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                        {groupName}
                      </h3>
                    </div>
                    <span className="text-[11px] font-mono text-[var(--text-muted)]">
                      {isRadio ? "Choose 1 (Required)" : "Optional"}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {mods.map((mod) => {
                      const isSelected = selectedModifierIds.includes(mod.id);

                      return (
                        <label
                          key={mod.id}
                          onClick={() => toggleModifier(mod, isRadio)}
                          className={`flex items-center justify-between p-3.5 sm:p-4 rounded-[var(--radius-md)] border text-sm transition-colors cursor-pointer min-h-[48px] select-none ${
                            isSelected
                              ? "border-[var(--primary)] bg-[var(--primary-subtle)]/40 text-[var(--text-primary)] font-medium ring-1 ring-[var(--primary)]"
                              : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type={isRadio ? "radio" : "checkbox"}
                              name={groupName}
                              checked={isSelected}
                              onChange={() => {}} // Controlled by label click
                              className="accent-[var(--primary)] h-4 w-4 cursor-pointer"
                            />
                            <span>{mod.name}</span>
                          </div>

                          <span className="font-mono text-xs text-[var(--text-muted)] font-medium">
                            {mod.pricePaise > 0
                              ? `+${formatPaiseToINR(mod.pricePaise)}`
                              : "Free"}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Sheet>
  );
}

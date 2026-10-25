"use client";

import * as React from "react";
import Image from "next/image";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { VegIndicator } from "./veg-indicator";
import { formatPaiseToINR } from "@/lib/currency";
import { Clock, Minus, Plus, Utensils, X } from "lucide-react";
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
      message: `${quantity} × ${item.name} added to your order.`,
      variant: "success",
      duration: 2500,
    });
    onClose();
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      side="center"
      className="flex w-full sm:w-[min(92vw,680px)] max-h-[94dvh] flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl border border-[#3A3026] bg-[#181412] text-[#FAF7F2] shadow-2xl"
      contentClassName="p-0"
      footerClassName="border-t border-[#2F2722] bg-[#181412] p-4 sm:p-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:pb-5"
      footer={
        <div className="space-y-2">
          {/* Detailed Price Breakdown */}
          {modifierTotalPaise > 0 && (
            <div className="flex items-center justify-between gap-2 px-1 text-sm text-stone-300">
              <span>
                Base {formatPaiseToINR(item.pricePaise)} + Customizations{" "}
                {formatPaiseToINR(modifierTotalPaise)}
              </span>
              <span className="text-stone-400 tabular-nums">
                {quantity} × {formatPaiseToINR(unitTotalPaise)}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Quantity Stepper (min 44px tap targets) */}
            <div className="flex shrink-0 items-center rounded-full border border-[#3A3026] bg-[#221B17]">
              <button
                type="button"
                disabled={quantity <= 1 || !isAvailable}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-2 text-stone-300 transition-colors hover:text-amber-400 disabled:opacity-30 cursor-pointer"
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center font-mono text-base font-semibold text-[#FAF7F2]">
                {quantity}
              </span>
              <button
                type="button"
                disabled={quantity >= 20 || !isAvailable}
                onClick={() => setQuantity((q) => Math.min(20, q + 1))}
                className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-2 text-stone-300 transition-colors hover:text-amber-400 disabled:opacity-30 cursor-pointer"
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {/* Add CTA (min 48px height) with sticky Add to order · ₹x */}
            <Button
              data-testid="add-to-order-btn"
              size="lg"
              variant="primary"
              disabled={!isAvailable}
              onClick={handleAddToCart}
              className="min-h-[52px] h-[52px] min-w-0 flex-1 justify-between gap-2 rounded-full bg-gradient-to-r from-[#C85A32] to-[#B34B24] px-3 sm:px-5 text-sm sm:text-base font-semibold text-white shadow-lg transition hover:brightness-110 active:scale-[0.98]"
            >
              <span className="truncate pr-1">
                {isAvailable ? "Add to Order" : "Unavailable"}
              </span>
              <span className="shrink-0 text-base text-white tabular-nums">
                · {formatPaiseToINR(lineTotalPaise)}
              </span>
            </Button>
          </div>
        </div>
      }
    >
      <div className="relative space-y-0 bg-[#181412] text-[#FAF7F2]">
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${item.name} details`}
          className="absolute right-0 top-0 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-black/65 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <X className="h-5 w-5" />
        </button>
        {/* Full-frame 4:3 food photography keeps the dish and garnishes visible without cropping. */}
        {item.imageUrl && !bannerError ? (
          <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#241E1A]">
            <Image
              src={item.imageUrl}
              alt={item.name}
              fill
              priority
              sizes="(max-width: 640px) 100vw, 680px"
              className="object-contain"
              onError={() => setBannerError(true)}
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#181412]/90 via-transparent to-black/35" />
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 sm:bottom-4 sm:left-4 sm:right-4">
              <span className="rounded-full border border-white/10 bg-black/70 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-300 backdrop-blur-sm sm:text-[11px]">
                FRESHLY PREPARED &middot; {item.prepTimeMinutes || 18} MINS
              </span>
              <span className="rounded-full border border-emerald-500/30 bg-black/70 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-emerald-300 backdrop-blur-sm sm:text-[11px]">
                {item.isVeg ? "Vegetarian" : "Non-Vegetarian"}
              </span>
            </div>
          </div>
        ) : (
          <div className="relative flex aspect-[4/3] w-full flex-col justify-end overflow-hidden border-b border-[#3A3026] bg-gradient-to-br from-[#2E2723] via-[#3D332D] to-[#1F1A18] p-4">
            <div className="absolute inset-0 bg-gradient-to-t from-[#181412] via-transparent to-black/30" />
            <div className="relative flex items-center justify-between gap-2 text-white">
              <div className="flex items-center gap-2">
                <Utensils className="h-4 w-4 text-[#D97706]" aria-hidden="true" />
                <span className="font-mono text-[10px] uppercase tracking-wider text-amber-300">
                  FRESHLY PREPARED &middot; {item.prepTimeMinutes || 18} MINS
                </span>
              </div>
              <span className="rounded-full border border-emerald-500/30 bg-black/50 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-emerald-300">
                {item.isVeg ? "Vegetarian" : "Non-Vegetarian"}
              </span>
            </div>
          </div>
        )}

        {/* Dish details use a separate charcoal surface under the uncropped image. */}
        <div className="space-y-3 p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <VegIndicator isVeg={item.isVeg} />
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#3A3026] bg-[#221B17] px-3 py-1.5 font-mono text-xs text-stone-300">
              <Clock className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
              {item.prepTimeMinutes || 18} min prep
            </span>
          </div>

          <h2 className="font-serif text-2xl font-bold leading-tight tracking-tight text-[#FAF7F2] sm:text-3xl">
            {item.name}
          </h2>

          <div className="text-base font-normal text-white tabular-nums">
            {formatPaiseToINR(item.pricePaise)}
          </div>

          {item.description && (
            <p className="pt-0.5 font-sans text-sm leading-relaxed text-stone-300 sm:text-base">
              {item.description}
            </p>
          )}

          <div className="rounded-xl border border-[#3A3026] bg-[#221B17] p-3.5 sm:p-4">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">
              Masala Lane &middot; Heritage Kitchen
            </p>
            <p className="mt-1 text-sm leading-relaxed text-stone-300">
              Inspired by traditional Indian recipes and prepared fresh to order.
            </p>
          </div>
        </div>

        {/* Modifiers List */}
        {modifierGroups.size > 0 && (
          <div className="space-y-4 border-t border-[#2F2722] pt-4">
            {Array.from(modifierGroups.entries()).map(([groupName, mods], groupIndex) => {
              const isRadio = mods.some((m) => m.isRequired);

              return (
                <div key={groupName} className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-sm font-bold text-amber-400">
                        {String(groupIndex + 1).padStart(2, "0")} /
                      </span>
                      <h3 className="text-sm font-bold uppercase tracking-wider text-[#FAF7F2]">
                        {groupName}
                      </h3>
                    </div>
                    <span className="text-xs font-mono text-stone-400 sm:text-sm">
                      {isRadio ? "Choose 1 (Required)" : "Optional"}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {mods.map((mod) => {
                      const isSelected = selectedModifierIds.includes(mod.id);

                      return (
                        <label
                          key={mod.id}
                          data-testid="modifier-option"
                          onClick={() => toggleModifier(mod, isRadio)}
                          className={`flex items-center justify-between p-3 sm:p-4 rounded-[var(--radius-md)] border text-sm transition-colors cursor-pointer min-h-[48px] select-none ${
                            isSelected
                              ? "border-[#C85A32] bg-[#C85A32]/10 text-[#FAF7F2] font-medium ring-1 ring-[#C85A32]"
                              : "border-dashed border-[#3A3026] bg-[#221B17] text-stone-300 hover:border-[#70513F] hover:bg-[#2A211C]"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type={isRadio ? "radio" : "checkbox"}
                              name={groupName}
                              checked={isSelected}
                              onChange={() => {}} // Controlled by label click
                              className="h-4 w-4 cursor-pointer accent-[#C85A32]"
                            />
                            <span>{mod.name}</span>
                          </div>

                          <span className="text-sm text-stone-300 tabular-nums">
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

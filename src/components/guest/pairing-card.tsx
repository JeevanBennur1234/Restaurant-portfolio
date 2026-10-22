"use client";

import * as React from "react";
import Image from "next/image";
import { Plus, Sparkles, Utensils } from "lucide-react";
import { formatPaiseToINR } from "@/lib/currency";
import type { GuestMenuItem } from "@/lib/api/types";
import { useOptionalCart } from "./cart-context";

interface PairingCardProps {
  bread: GuestMenuItem;
  side: GuestMenuItem;
}

function standardModifierIds(item: GuestMenuItem): string[] {
  const requiredByGroup = new Map<string, GuestMenuItem["modifiers"]>();
  for (const modifier of item.modifiers) {
    if (!modifier.isRequired) continue;
    const group = requiredByGroup.get(modifier.groupName) ?? [];
    group.push(modifier);
    requiredByGroup.set(modifier.groupName, group);
  }
  return Array.from(requiredByGroup.values())
    .filter((group) => group.length > 0)
    .map((group) => group[0].id);
}

function standardItemPrice(item: GuestMenuItem, modifierIds: string[]): number {
  return item.pricePaise + modifierIds.reduce((total, id) => {
    return total + (item.modifiers.find((modifier) => modifier.id === id)?.pricePaise ?? 0);
  }, 0);
}

function PairingImage({ item }: { item: GuestMenuItem }) {
  const [failed, setFailed] = React.useState(false);
  if (!item.imageUrl || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#2E2723] text-amber-300" aria-hidden="true">
        <Utensils className="h-5 w-5" />
      </div>
    );
  }
  return (
    <Image
      src={item.imageUrl}
      alt={item.name}
      fill
      sizes="56px"
      className="object-cover"
      onError={() => setFailed(true)}
    />
  );
}

/** An editorial cross-sell card backed by real menu records and authoritative prices. */
export function PairingCard({ bread, side }: PairingCardProps) {
  const cart = useOptionalCart();
  const breadModifiers = React.useMemo(() => standardModifierIds(bread), [bread]);
  const sideModifiers = React.useMemo(() => standardModifierIds(side), [side]);
  const totalPaise =
    standardItemPrice(bread, breadModifiers) + standardItemPrice(side, sideModifiers);
  const canAdd = Boolean(cart && bread.isAvailable && side.isAvailable);

  const handleAddPair = () => {
    if (!cart || !canAdd) return;
    // Add the same standard required options used by the menu's quick-add flow.
    // Optional upgrades remain unselected and can be added separately from item details.
    cart.addItem(bread.id, 1, breadModifiers);
    cart.addItem(side.id, 1, sideModifiers);
  };

  return (
    <article
      data-testid="pairing-card"
      className="flex h-full min-h-[340px] flex-col justify-between rounded-2xl border border-amber-900/40 bg-gradient-to-b from-[#3D2C24] to-[#251A14] p-4 text-[#FAF7F2] shadow-xl sm:p-5"
    >
      <div className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/15 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-300">
          <Sparkles className="h-3 w-3" aria-hidden="true" /> Chef&apos;s pairing
        </span>
        <div>
          <h3 className="font-serif text-xl font-bold leading-tight tracking-tight sm:text-2xl">Tandoor &amp; Cooling Raita</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-stone-300 sm:text-base">
            {bread.name} with {side.name}.
          </p>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-amber-500/30 bg-[#2E2723]">
            <PairingImage key={bread.id} item={bread} />
          </div>
          <span className="font-serif text-lg font-bold text-amber-400" aria-hidden="true">+</span>
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-amber-500/30 bg-[#2E2723]">
            <PairingImage key={side.id} item={side} />
          </div>
        </div>
        <p className="font-mono text-xs leading-relaxed text-stone-400">
          Standard options ? {formatPaiseToINR(totalPaise)} for both
        </p>
      </div>

      <button
        type="button"
        data-testid="add-pairing-btn"
        onClick={handleAddPair}
        disabled={!canAdd}
        aria-label={`Add standard pairing: ${bread.name} and ${side.name}, ${formatPaiseToINR(totalPaise)}`}
        className="mt-4 flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl bg-[#FAF7F2] px-3 py-3 text-left text-sm font-semibold text-[#1F1A17] transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4"
      >
        <span>{canAdd ? "Add standard pair" : "Currently unavailable"}</span>
        <span className="flex shrink-0 items-center gap-2 font-mono">
          {formatPaiseToINR(totalPaise)}
          <Plus className="h-4 w-4" aria-hidden="true" />
        </span>
      </button>
    </article>
  );
}

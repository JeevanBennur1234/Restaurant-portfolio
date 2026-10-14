"use client";

import * as React from "react";
import type { GuestMenuItem } from "@/lib/api/types";

export interface CartItem {
  id: string; // Composite key: `${menuItemId}::${modifierIds.sort().join(",")}`
  menuItemId: string;
  quantity: number;
  selectedModifierIds: string[];
}

interface CartContextValue {
  items: CartItem[];
  addItem: (menuItemId: string, quantity: number, selectedModifierIds: string[]) => void;
  updateQuantity: (cartItemId: string, delta: number) => void;
  removeItem: (cartItemId: string) => void;
  clearCart: () => void;
  totalCount: number;
  totalPaise: number;
  menuItemMap: Map<string, GuestMenuItem>;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
}

const CartContext = React.createContext<CartContextValue | null>(null);

export interface CartProviderProps {
  children: React.ReactNode;
  menuItems: GuestMenuItem[];
  tableId: string;
}

export function CartProvider({ children, menuItems, tableId }: CartProviderProps) {
  const storageKey = `dinepulse_cart_${tableId}`;

  const [items, setItems] = React.useState<CartItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed as CartItem[];
        }
      }
    } catch {
      // Ignore storage read error
    }
    return [];
  });

  const [isCartOpen, setIsCartOpen] = React.useState(false);

  // Fast lookup map for menu items and their modifiers
  const menuItemMap = React.useMemo(() => {
    const map = new Map<string, GuestMenuItem>();
    for (const item of menuItems) {
      map.set(item.id, item);
    }
    return map;
  }, [menuItems]);

  // Persist items to localStorage
  React.useEffect(() => {
    try {
      if (items.length === 0) {
        localStorage.removeItem(storageKey);
      } else {
        localStorage.setItem(storageKey, JSON.stringify(items));
      }
    } catch {
      // Ignore storage write errors
    }
  }, [items, storageKey]);

  const addItem = React.useCallback(
    (menuItemId: string, quantity: number, selectedModifierIds: string[]) => {
      const sortedMods = [...selectedModifierIds].sort();
      const id = `${menuItemId}::${sortedMods.join(",")}`;

      setItems((prev) => {
        const existingIndex = prev.findIndex((i) => i.id === id);
        if (existingIndex > -1) {
          const updated = [...prev];
          const curr = updated[existingIndex];
          updated[existingIndex] = {
            ...curr,
            quantity: Math.min(50, curr.quantity + quantity),
          };
          return updated;
        }

        return [...prev, { id, menuItemId, quantity, selectedModifierIds: sortedMods }];
      });
    },
    []
  );

  const updateQuantity = React.useCallback((cartItemId: string, delta: number) => {
    setItems((prev) => {
      return prev
        .map((item) => {
          if (item.id === cartItemId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null);
    });
  }, []);

  const removeItem = React.useCallback((cartItemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== cartItemId));
  }, []);

  const clearCart = React.useCallback(() => {
    setItems([]);
  }, []);

  // Compute total item count
  const totalCount = React.useMemo(() => {
    return items.reduce((sum, item) => sum + item.quantity, 0);
  }, [items]);

  // Compute total price in integer paise strictly using prices from server-rendered menu items
  const totalPaise = React.useMemo(() => {
    let sum = 0;
    for (const cartItem of items) {
      const menuItem = menuItemMap.get(cartItem.menuItemId);
      if (!menuItem) continue;

      let itemUnitPaise = menuItem.pricePaise;

      // Add modifier costs
      if (cartItem.selectedModifierIds.length > 0 && menuItem.modifiers.length > 0) {
        const modMap = new Map(menuItem.modifiers.map((m) => [m.id, m.pricePaise]));
        for (const modId of cartItem.selectedModifierIds) {
          const modPrice = modMap.get(modId) ?? 0;
          itemUnitPaise += modPrice;
        }
      }

      sum += itemUnitPaise * cartItem.quantity;
    }
    return sum;
  }, [items, menuItemMap]);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        updateQuantity,
        removeItem,
        clearCart,
        totalCount,
        totalPaise,
        menuItemMap,
        isCartOpen,
        setIsCartOpen,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = React.useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return ctx;
}

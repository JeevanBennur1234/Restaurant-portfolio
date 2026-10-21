import type { Metadata } from "next";
import { connection } from "next/server";
import { db } from "@/server/db";
import { getMenuForTable } from "@/server/services/customer";
import { GuestHeader } from "@/components/guest/guest-header";
import { MenuView } from "@/components/guest/menu-view";
import { CartProvider } from "@/components/guest/cart-context";
import { InvalidTokenView } from "@/components/guest/invalid-token-view";

interface GuestPageProps {
  params: Promise<{
    token: string;
  }>;
}

export async function generateMetadata({
  params,
}: GuestPageProps): Promise<Metadata> {
  // Menu metadata reads the live database, so defer it until a real request.
  await connection();
  const { token } = await params;
  const result = await getMenuForTable({ db }, token);

  if (!result.ok) {
    return {
      title: "Table Not Found | Masala Lane",
      description: "Invalid table QR code session.",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  return {
    title: `${result.data.table.tableNumber} | ${result.data.restaurant.name}`,
    description: `Mobile guest ordering for ${result.data.table.tableNumber} at ${result.data.restaurant.name}.`,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function GuestTablePage({ params }: GuestPageProps) {
  // This route reads the live menu database and must not be prerendered as a static shell.
  await connection();
  const { token } = await params;
  const result = await getMenuForTable({ db }, token);

  if (!result.ok) {
    const reason =
      result.message === "INVALID_TOKEN" ||
      result.message === "NOT_FOUND" ||
      result.message === "INACTIVE_TABLE"
        ? result.message
        : "Service temporarily unavailable";
    return <InvalidTokenView reason={reason} />;
  }

  const { restaurant, table, categories, items, paymentsEnabled, paymentsTestMode } = result.data;

  return (
    <CartProvider menuItems={items} tableId={table.id}>
      <div className="min-h-screen flex flex-col bg-[var(--bg-app)]">
        <GuestHeader
          restaurantName={restaurant.name}
          tableLabel={table.tableNumber}
        />
        <MenuView
          categories={categories}
          items={items}
          table={table}
          restaurantName={restaurant.name}
          paymentsEnabled={paymentsEnabled}
          paymentsTestMode={paymentsTestMode}
        />
      </div>
    </CartProvider>
  );
}

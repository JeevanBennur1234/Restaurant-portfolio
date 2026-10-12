import type { Metadata } from "next";
import { getGuestTableAndMenu } from "@/server/queries/guest";
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
  const { token } = await params;
  const result = await getGuestTableAndMenu(token);

  if (!result.success) {
    return {
      title: "Table Not Found | Masala Lane",
      description: "Invalid table QR code session.",
    };
  }

  return {
    title: `${result.data.table.tableNumber} | ${result.data.restaurant.name}`,
    description: `Mobile guest ordering for ${result.data.table.tableNumber} at ${result.data.restaurant.name}.`,
  };
}

export default async function GuestTablePage({ params }: GuestPageProps) {
  const { token } = await params;
  const result = await getGuestTableAndMenu(token);

  if (!result.success) {
    return <InvalidTokenView reason={result.error} />;
  }

  const { restaurant, table, categories, items } = result.data;

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
        />
      </div>
    </CartProvider>
  );
}

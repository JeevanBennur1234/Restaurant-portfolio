import type { Metadata } from "next";
import { db } from "@/server/db";
import { getStaffSession } from "@/server/auth";
import { listKitchenTickets } from "@/server/services/kitchen";
import { getRestaurantChannel } from "@/server/realtime";
import { env } from "@/server/env";
import { KitchenBoard } from "@/components/kitchen/kitchen-board";
import { KitchenLogin } from "@/components/kitchen/kitchen-login";

export const metadata: Metadata = {
  title: "Kitchen Display System (KDS) | Masala Lane",
  description: "Live kitchen board with New, Preparing, and Ready queues.",
};

export default async function KitchenPage() {
  const session = await getStaffSession();

  // Protected for kitchen, manager, or admin roles
  if (
    !session ||
    (session.role !== "kitchen" &&
      session.role !== "manager" &&
      session.role !== "admin")
  ) {
    return <KitchenLogin isDemoMode={env.DEMO_MODE === "true"} />;
  }

  const result = await listKitchenTickets({ db, actor: session });
  const initialTickets = result.ok ? result.data : [];
  const realtimeChannel = getRestaurantChannel(session.restaurantId);

  return (
    <KitchenBoard
      initialTickets={initialTickets}
      session={session}
      realtimeChannel={realtimeChannel}
    />
  );
}

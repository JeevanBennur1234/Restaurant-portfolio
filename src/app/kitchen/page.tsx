import type { Metadata } from "next";
import { connection } from "next/server";
import { db } from "@/server/db";
import { getStaffSession } from "@/server/auth";
import { listKitchenTickets } from "@/server/services/kitchen";
import { getRestaurantChannel } from "@/server/realtime";
import { env } from "@/server/env";
import { getSite } from "@/server/site";
import { resolveSiteUrl } from "@/lib/site-urls";
import { KitchenBoard } from "@/components/kitchen/kitchen-board";
import { KitchenLogin } from "@/components/kitchen/kitchen-login";

export const metadata: Metadata = {
  title: "Kitchen Display System (KDS) | Masala Lane",
  description: "Live kitchen board with New, Preparing, and Ready queues.",
};

export default async function KitchenPage() {
  await connection();
  const session = await getStaffSession();

  // Protected for kitchen, manager, or admin roles
  if (
    !session ||
    (session.role !== "kitchen" &&
      session.role !== "manager" &&
      session.role !== "admin")
  ) {
    const site = getSite();
    const managerUrl = resolveSiteUrl("manager", "/admin", site);
    return (
      <KitchenLogin
        isDemoMode={env.DEMO_MODE === "true"}
        managerUrl={managerUrl}
      />
    );
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

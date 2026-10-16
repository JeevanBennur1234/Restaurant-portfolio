import { connection } from "next/server";
import { getStaffSession } from "@/server/auth";
import { getRestaurantChannel } from "@/server/realtime";
import { env } from "@/server/env";
import { getSite } from "@/server/site";
import { resolveSiteUrl } from "@/lib/site-urls";
import { db } from "@/server/db";
import { getAdminOrders } from "@/server/services/manager";
import { AdminDashboard, AdminLogin } from "@/components/admin";

export const metadata = {
  title: "Admin Management · Masala Lane",
  description: "Live orders, menu catalog, table QR codes, and sales analytics for Masala Lane.",
};

export default async function AdminPage() {
  await connection();
  const session = await getStaffSession();

  // Strict role guard: only manager or admin can access the admin dashboard
  if (!session || (session.role !== "manager" && session.role !== "admin")) {
    const site = getSite();
    const kitchenUrl = resolveSiteUrl("kitchen", "/kitchen", site);
    return (
      <AdminLogin
        isDemoMode={env.DEMO_MODE === "true"}
        kitchenUrl={kitchenUrl}
      />
    );
  }

  // Server components call manager services directly with actor
  const initialOrdersRes = await getAdminOrders({ db, actor: session });
  const initialOrders = initialOrdersRes.ok ? initialOrdersRes.data.orders : [];
  const initialPagination = initialOrdersRes.ok
    ? initialOrdersRes.data.pagination
    : undefined;

  const realtimeChannel = getRestaurantChannel(session.restaurantId);
  const site = getSite();
  const kitchenUrl = resolveSiteUrl("kitchen", "/kitchen", site);
  const customerUrl = resolveSiteUrl("customer", "/t/demo-table-7", site);

  return (
    <AdminDashboard
      session={session}
      realtimeChannel={realtimeChannel}
      initialOrders={initialOrders}
      initialPagination={initialPagination}
      kitchenUrl={kitchenUrl}
      customerUrl={customerUrl}
    />
  );
}

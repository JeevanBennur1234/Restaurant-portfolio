import { getStaffSession } from "@/server/auth";
import { getRestaurantChannel } from "@/server/realtime";
import { env } from "@/server/env";
import { AdminDashboard, AdminLogin } from "@/components/admin";

export const metadata = {
  title: "Admin Management · Masala Lane",
  description: "Live orders, menu catalog, table QR codes, and sales analytics for Masala Lane.",
};

export default async function AdminPage() {
  const session = await getStaffSession();

  // Strict role guard: only manager or admin can access the admin dashboard
  if (!session || (session.role !== "manager" && session.role !== "admin")) {
    return <AdminLogin isDemoMode={env.DEMO_MODE === "true"} />;
  }

  const realtimeChannel = getRestaurantChannel(session.restaurantId);

  return <AdminDashboard session={session} realtimeChannel={realtimeChannel} />;
}

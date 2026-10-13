import { db } from "@/server/db";
import { listKitchenTickets } from "@/server/services/kitchen";
import { withApi } from "@/server/api/handler";
import { fromServiceResult } from "@/server/api/envelope";


export const GET = withApi(
  async ({ actor }) => {
    const result = await listKitchenTickets({ db, actor });
    return fromServiceResult(result);
  },
  {
    roles: ["kitchen", "manager", "admin"],
    rateLimit: "staff",
  }
);

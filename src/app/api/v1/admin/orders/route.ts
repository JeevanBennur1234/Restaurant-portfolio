import { db } from "@/server/db";
import { getAdminOrders } from "@/server/services/manager";
import { adminOrdersQuerySchema } from "@/lib/validations/admin";
import { withApi } from "@/server/api/handler";
import { fromServiceResult } from "@/server/api/envelope";


export const GET = withApi(
  async ({ query, actor }) => {
    const result = await getAdminOrders({ db, actor }, query);
    return fromServiceResult(result);
  },
  {
    querySchema: adminOrdersQuerySchema,
    roles: ["manager", "admin"],
    rateLimit: "staff",
  }
);

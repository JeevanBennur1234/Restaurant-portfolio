import { z } from "zod";
import { db } from "@/server/db";
import { getAdminBillOrReceipt } from "@/server/services/billing";
import { withApi } from "@/server/api/handler";
import { fromServiceResult } from "@/server/api/envelope";

const paramsSchema = z.object({
  id: z.string().trim().min(1, "Order ID is required"),
});

export const GET = withApi(
  async ({ params, actor }) => {
    const result = await getAdminBillOrReceipt(
      { db, actor },
      { orderId: params.id }
    );
    return fromServiceResult(result);
  },
  {
    paramsSchema,
    roles: ["manager", "admin"],
    rateLimit: "staff",
  }
);

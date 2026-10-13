import { z } from "zod";
import { db } from "@/server/db";
import { cancelOrder } from "@/server/services/manager";
import { withApi } from "@/server/api/handler";
import { fromServiceResult } from "@/server/api/envelope";


const paramsSchema = z.object({
  id: z.string().trim().min(1, "Order ID is required"),
});

const bodySchema = z.object({
  reason: z.string().trim().min(3, "Reason must be at least 3 characters"),
});

export const POST = withApi(
  async ({ params, body, actor }) => {
    const result = await cancelOrder(
      { db, actor },
      { orderId: params.id, reason: body.reason }
    );
    return fromServiceResult(result);
  },
  {
    paramsSchema,
    bodySchema,
    roles: ["manager", "admin"],
    rateLimit: "staff",
  }
);

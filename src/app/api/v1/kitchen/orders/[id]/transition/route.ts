import { z } from "zod";
import { db } from "@/server/db";
import { transitionOrderStatus } from "@/server/services/kitchen";
import { withApi } from "@/server/api/handler";
import { fromServiceResult } from "@/server/api/envelope";


const paramsSchema = z.object({
  id: z.string().trim().min(1, "Order ID is required"),
});

const bodySchema = z.object({
  toStatus: z.enum([
    "placed",
    "accepted",
    "preparing",
    "ready",
    "served",
    "cancelled",
  ]),
});

export const POST = withApi(
  async ({ params, body, actor }) => {
    const result = await transitionOrderStatus(
      { db, actor },
      { orderId: params.id, toStatus: body.toStatus }
    );
    return fromServiceResult(result);
  },
  {
    paramsSchema,
    bodySchema,
    roles: ["kitchen", "manager", "admin"],
    rateLimit: "staff",
  }
);

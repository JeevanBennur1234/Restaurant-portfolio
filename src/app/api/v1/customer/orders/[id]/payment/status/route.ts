import { z } from "zod";
import { db } from "@/server/db";
import { getPaymentStatus } from "@/server/services/customer";
import { withApi } from "@/server/api/handler";
import { fromServiceResult } from "@/server/api/envelope";

const paramsSchema = z.object({
  id: z.string().trim().min(1, "Order ID is required"),
});

export const GET = withApi(
  async ({ params, tableToken }) => {
    const result = await getPaymentStatus(
      { db },
      { orderId: params.id, token: tableToken! }
    );
    return fromServiceResult(result);
  },
  {
    paramsSchema,
    requireTableToken: true,
    rateLimit: "customer",
  }
);

import { z } from "zod";
import { db } from "@/server/db";
import { confirmSimulatedPayment } from "@/server/services/customer";
import { env } from "@/server/env";
import { withApi } from "@/server/api/handler";
import { apiError, fromServiceResult } from "@/server/api/envelope";


const paramsSchema = z.object({
  id: z.string().trim().min(1, "Order ID is required"),
});

export const POST = withApi(
  async ({ params, tableToken }) => {
    if (env.DEMO_MODE !== "true" && process.env.DEMO_MODE !== "true") {
      return apiError("NOT_FOUND", "Endpoint not found", 404);
    }

    const result = await confirmSimulatedPayment(
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

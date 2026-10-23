import { z } from "zod";
import { db } from "@/server/db";
import { settleTabAtCounter } from "@/server/services/tabs";
import { withApi } from "@/server/api/handler";
import { fromServiceResult } from "@/server/api/envelope";

const paramsSchema = z.object({
  id: z.string().trim().min(1, "Tab ID is required"),
});

const bodySchema = z.object({
  paymentMethod: z.enum(["counter", "cash", "card", "upi"]).default("counter"),
  notes: z.string().trim().max(250).optional().nullable(),
});

export const POST = withApi(
  async ({ params, body, actor }) => {
    const result = await settleTabAtCounter(
      { db, actor },
      {
        tabId: params.id,
        paymentMethod: body.paymentMethod,
        notes: body.notes,
      }
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

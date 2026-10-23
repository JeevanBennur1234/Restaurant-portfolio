import { z } from "zod";
import { db } from "@/server/db";
import { placeTabRound } from "@/server/services/tabs";
import { tokenParamSchema } from "@/lib/validations/guest";
import { placeTabRoundSchema } from "@/lib/validations/order";
import { withApi } from "@/server/api/handler";
import { fromServiceResult } from "@/server/api/envelope";
import { executeIdempotentOrder } from "@/server/api/idempotency";

const paramsSchema = z.object({
  token: tokenParamSchema,
});

const bodySchema = placeTabRoundSchema.omit({ token: true }).extend({
  token: z.string().trim().optional(),
});

export const POST = withApi(
  async ({ req, params, body, table, requestId }) => {
    const idempotencyKey = req.headers.get("idempotency-key");
    const restaurantId = table!.restaurantId;

    return await executeIdempotentOrder({
      restaurantId,
      idempotencyKey,
      body,
      requestId,
      handler: async () => {
        const roundInput = {
          ...body,
          token: params.token,
        };
        const result = await placeTabRound({ db }, roundInput);
        return fromServiceResult(result, 201, { "x-request-id": requestId });
      },
    });
  },
  {
    paramsSchema,
    bodySchema,
    requireTableToken: true,
    rateLimit: "customer",
  }
);

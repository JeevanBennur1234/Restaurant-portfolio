import { z } from "zod";
import { db } from "@/server/db";
import { requestTabBill } from "@/server/services/tabs";
import { tokenParamSchema } from "@/lib/validations/guest";
import { requestTabBillSchema } from "@/lib/validations/order";
import { withApi } from "@/server/api/handler";
import { fromServiceResult } from "@/server/api/envelope";

const paramsSchema = z.object({
  token: tokenParamSchema,
});

const bodySchema = requestTabBillSchema.omit({ token: true }).extend({
  token: z.string().trim().optional(),
});

export const POST = withApi(
  async ({ params, body }) => {
    const result = await requestTabBill({ db }, {
      token: params.token,
      paymentMethod: body.paymentMethod,
    });
    return fromServiceResult(result);
  },
  {
    paramsSchema,
    bodySchema,
    requireTableToken: true,
    rateLimit: "customer",
  }
);

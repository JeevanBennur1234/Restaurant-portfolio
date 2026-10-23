import { z } from "zod";
import { db } from "@/server/db";
import { verifyTabPayment } from "@/server/services/tabs";
import { tokenParamSchema } from "@/lib/validations/guest";
import { verifyTabPaymentSchema } from "@/lib/validations/order";
import { withApi } from "@/server/api/handler";
import { fromServiceResult } from "@/server/api/envelope";

const paramsSchema = z.object({
  token: tokenParamSchema,
});

const bodySchema = verifyTabPaymentSchema.omit({ token: true }).extend({
  token: z.string().trim().optional(),
});

export const POST = withApi(
  async ({ params, body }) => {
    const result = await verifyTabPayment({ db }, {
      token: params.token,
      razorpayOrderId: body.razorpayOrderId,
      razorpayPaymentId: body.razorpayPaymentId,
      razorpaySignature: body.razorpaySignature,
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

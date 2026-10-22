import { z } from "zod";
import { db } from "@/server/db";
import { recordCounterPayment } from "@/server/services/billing";
import { recordCounterPaymentSchema } from "@/lib/validations/admin";
import { withApi } from "@/server/api/handler";
import { fromServiceResult } from "@/server/api/envelope";

const paramsSchema = z.object({
  id: z.string().trim().min(1, "Order ID is required"),
});

export const POST = withApi(
  async ({ params, body, actor }) => {
    const result = await recordCounterPayment(
      { db, actor },
      {
        orderId: params.id,
        paymentMethod: body.paymentMethod,
        transactionRef: body.transactionRef,
        note: body.note,
      }
    );
    return fromServiceResult(result);
  },
  {
    paramsSchema,
    bodySchema: recordCounterPaymentSchema,
    roles: ["manager", "admin"],
    rateLimit: "staff",
  }
);

import { z } from "zod";
import { db } from "@/server/db";
import { verifyRazorpayPayment } from "@/server/services/customer";
import { withApi } from "@/server/api/handler";
import { fromServiceResult } from "@/server/api/envelope";


const paramsSchema = z.object({
  id: z.string().trim().min(1, "Order ID is required"),
});

const bodySchema = z.object({
  razorpayOrderId: z.string().trim().min(1, "Razorpay Order ID is required"),
  razorpayPaymentId: z.string().trim().min(1, "Razorpay Payment ID is required"),
  razorpaySignature: z.string().trim().min(1, "Razorpay Signature is required"),
});

export const POST = withApi(
  async ({ params, body, tableToken }) => {
    const result = await verifyRazorpayPayment(
      { db },
      {
        orderId: params.id,
        token: tableToken!,
        razorpayOrderId: body.razorpayOrderId,
        razorpayPaymentId: body.razorpayPaymentId,
        razorpaySignature: body.razorpaySignature,
      }
    );
    return fromServiceResult(result);
  },
  {
    paramsSchema,
    bodySchema,
    requireTableToken: true,
    rateLimit: "customer",
  }
);

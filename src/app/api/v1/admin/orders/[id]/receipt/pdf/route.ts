import { z } from "zod";
import { db } from "@/server/db";
import { getAdminBillOrReceipt } from "@/server/services/billing";
import { generateReceiptPdf } from "@/server/services/receipt-pdf";
import { withApi } from "@/server/api/handler";
import { apiError } from "@/server/api/envelope";

const paramsSchema = z.object({
  id: z.string().trim().min(1, "Order ID is required"),
});

const querySchema = z.object({
  format: z.enum(["a4", "thermal"]).optional(),
});

export const GET = withApi(
  async ({ params, query, actor }) => {
    const result = await getAdminBillOrReceipt(
      { db, actor },
      { orderId: params.id }
    );

    if (!result.ok) {
      return apiError(result.code, result.message, result.status);
    }

    const format = query.format || "a4";
    const pdfBuffer = await generateReceiptPdf(result.data, { format });

    const prefix = result.data.status === "PAID_RECEIPT" ? "receipt" : "bill";
    const filename = `${prefix}-${result.data.orderNumber}${format === "thermal" ? "-thermal" : ""}.pdf`;

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  },
  {
    paramsSchema,
    querySchema,
    roles: ["manager", "admin"],
    rateLimit: "staff",
  }
);

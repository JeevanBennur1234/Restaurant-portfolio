import { z } from "zod";
import { db } from "@/server/db";
import { getAdminTabBillOrReceipt } from "@/server/services/tabs";
import { withApi } from "@/server/api/handler";
import { fromServiceResult } from "@/server/api/envelope";

const paramsSchema = z.object({
  id: z.string().trim().min(1, "Tab ID is required"),
});

export const GET = withApi(
  async ({ params, actor }) => {
    const result = await getAdminTabBillOrReceipt(
      { db, actor },
      { tabId: params.id }
    );
    return fromServiceResult(result);
  },
  {
    paramsSchema,
    roles: ["manager", "admin"],
    rateLimit: "staff",
  }
);

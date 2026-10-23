import { z } from "zod";
import { db } from "@/server/db";
import { getCustomerTabReceipt } from "@/server/services/tabs";
import { tokenParamSchema } from "@/lib/validations/guest";
import { withApi } from "@/server/api/handler";
import { fromServiceResult } from "@/server/api/envelope";

const paramsSchema = z.object({
  token: tokenParamSchema,
});

export const GET = withApi(
  async ({ params }) => {
    const result = await getCustomerTabReceipt({ db }, params.token);
    return fromServiceResult(result);
  },
  {
    paramsSchema,
    requireTableToken: true,
    rateLimit: "customer",
  }
);

import { z } from "zod";
import { db } from "@/server/db";
import { getActiveTab } from "@/server/services/tabs";
import { tokenParamSchema } from "@/lib/validations/guest";
import { withApi } from "@/server/api/handler";
import { fromServiceResult } from "@/server/api/envelope";

const paramsSchema = z.object({
  token: tokenParamSchema,
});

export const GET = withApi(
  async ({ params }) => {
    const result = await getActiveTab({ db }, params.token);
    return fromServiceResult(result);
  },
  {
    paramsSchema,
    rateLimit: "customer",
  }
);

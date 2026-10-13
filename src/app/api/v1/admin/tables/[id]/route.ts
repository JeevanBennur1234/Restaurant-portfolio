import { z } from "zod";
import { db } from "@/server/db";
import { updateTable, deleteTable } from "@/server/services/manager";
import { updateTableSchema } from "@/lib/validations/admin";
import { withApi } from "@/server/api/handler";
import { fromServiceResult } from "@/server/api/envelope";


const paramsSchema = z.object({
  id: z.string().trim().min(1, "Table ID is required"),
});

export const PATCH = withApi(
  async ({ params, body, actor }) => {
    const result = await updateTable(
      { db, actor },
      { id: params.id, ...body }
    );
    return fromServiceResult(result);
  },
  {
    paramsSchema,
    bodySchema: updateTableSchema,
    roles: ["manager", "admin"],
    rateLimit: "staff",
  }
);

export const DELETE = withApi(
  async ({ params, actor }) => {
    const result = await deleteTable({ db, actor }, { id: params.id });
    return fromServiceResult(result);
  },
  {
    paramsSchema,
    roles: ["manager", "admin"],
    rateLimit: "staff",
  }
);

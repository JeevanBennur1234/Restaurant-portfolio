import { db } from "@/server/db";
import { getAdminTables, createTable } from "@/server/services/manager";
import { createTableSchema } from "@/lib/validations/admin";
import { withApi } from "@/server/api/handler";
import { fromServiceResult } from "@/server/api/envelope";


export const GET = withApi(
  async ({ actor }) => {
    const result = await getAdminTables({ db, actor });
    return fromServiceResult(result);
  },
  {
    roles: ["manager", "admin"],
    rateLimit: "staff",
  }
);

export const POST = withApi(
  async ({ body, actor }) => {
    const result = await createTable({ db, actor }, body);
    return fromServiceResult(result, 201);
  },
  {
    bodySchema: createTableSchema,
    roles: ["manager", "admin"],
    rateLimit: "staff",
  }
);

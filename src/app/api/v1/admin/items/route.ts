import { db } from "@/server/db";
import { getAdminMenu, createMenuItem } from "@/server/services/manager";
import { createMenuItemSchema } from "@/lib/validations/admin";
import { withApi } from "@/server/api/handler";
import { apiOk, fromServiceResult } from "@/server/api/envelope";


export const GET = withApi(
  async ({ actor }) => {
    const result = await getAdminMenu({ db, actor });
    if (result.ok) {
      return apiOk(result.data.items);
    }
    return fromServiceResult(result);
  },
  {
    roles: ["manager", "admin"],
    rateLimit: "staff",
  }
);

export const POST = withApi(
  async ({ body, actor }) => {
    const result = await createMenuItem({ db, actor }, body);
    return fromServiceResult(result, 201);
  },
  {
    bodySchema: createMenuItemSchema,
    roles: ["manager", "admin"],
    rateLimit: "staff",
  }
);

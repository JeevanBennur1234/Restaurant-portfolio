import { db } from "@/server/db";
import { getAdminReports } from "@/server/services/manager";
import { withApi } from "@/server/api/handler";
import { fromServiceResult } from "@/server/api/envelope";


export const GET = withApi(
  async ({ actor }) => {
    const result = await getAdminReports({ db, actor });
    return fromServiceResult(result);
  },
  {
    roles: ["manager", "admin"],
    rateLimit: "staff",
  }
);

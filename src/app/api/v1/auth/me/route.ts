import { withApi } from "@/server/api/handler";
import { apiOk } from "@/server/api/envelope";


export const GET = withApi(
  async ({ actor }) => {
    return apiOk({ user: actor });
  },
  {
    requireStaff: true,
  }
);

import { clearStaffSessionCookie } from "@/server/auth";
import { withApi } from "@/server/api/handler";
import { apiOk } from "@/server/api/envelope";


export const POST = withApi(
  async () => {
    await clearStaffSessionCookie();
    return apiOk({ success: true });
  },
  {
    checkOrigin: true,
  }
);

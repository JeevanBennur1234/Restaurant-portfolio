import { z } from "zod";
import { db } from "@/server/db";
import { testVerifyTabPayment } from "@/server/services/tabs";
import { tokenParamSchema } from "@/lib/validations/guest";
import { withApi } from "@/server/api/handler";
import { fromServiceResult } from "@/server/api/envelope";
import { isOnlinePaymentsEnabled } from "@/server/razorpay";
import { isIsolatedLocalTestDatabase } from "@/server/db/safe-test-db";
import { env } from "@/server/env";

const paramsSchema = z.object({
  token: tokenParamSchema,
});

export const POST = withApi(
  async ({ params }) => {
    // Only allow simulation if test simulation is enabled or database is isolated
    if (
      !env.ALLOW_TEST_PAYMENT_SIMULATION &&
      !isIsolatedLocalTestDatabase() &&
      isOnlinePaymentsEnabled()
    ) {
      return fromServiceResult({
        ok: false,
        code: "FORBIDDEN",
        message: "Simulated payment verification is only permitted in test/development environments",
        status: 403,
      });
    }

    const result = await testVerifyTabPayment({ db }, { token: params.token });
    return fromServiceResult(result);
  },
  {
    paramsSchema,
    requireTableToken: true,
    rateLimit: "customer",
  }
);

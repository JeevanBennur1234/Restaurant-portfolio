import crypto from "crypto";
import { NextRequest } from "next/server";
import { POST as handleUpload } from "@/app/api/admin/upload/route";
import { apiOk, apiError } from "@/server/api/envelope";
import { validateOrigin } from "@/server/api/guards";


export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();

  // Origin verification for cookie-authenticated write
  if (!validateOrigin(request)) {
    return apiError("FORBIDDEN", "Forbidden: Invalid origin", 403, {
      "x-request-id": requestId,
    });
  }

  const rawRes = await handleUpload(request);
  const json = await rawRes.json().catch(() => null);

  if (!rawRes.ok || !json?.success) {
    const code =
      rawRes.status === 401
        ? "UNAUTHENTICATED"
        : rawRes.status === 403
        ? "FORBIDDEN"
        : rawRes.status === 400
        ? "VALIDATION"
        : "INTERNAL";

    return apiError(
      code,
      json?.error || "Upload failed",
      rawRes.status,
      { "x-request-id": requestId }
    );
  }

  return apiOk(
    {
      url: json.url,
      fileName: json.fileName,
    },
    201,
    { "x-request-id": requestId }
  );
}

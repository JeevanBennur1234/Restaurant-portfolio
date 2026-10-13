import { NextRequest } from "next/server";
import { GET as handleQrPdf } from "@/app/api/admin/tables/qr-pdf/route";


export async function GET(request: NextRequest) {
  const response = await handleQrPdf(request);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

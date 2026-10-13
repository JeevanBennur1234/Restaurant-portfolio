import { NextResponse } from "next/server";
import { generateOpenApiDocument } from "@/server/api/openapi";


export async function GET() {
  const doc = generateOpenApiDocument();
  return NextResponse.json(doc, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
}

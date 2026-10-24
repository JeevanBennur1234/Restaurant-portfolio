import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { extractTableTokenFromQr } from "@/lib/table-qr";

describe("Table QR token extraction", () => {
  it("accepts a raw table token", () => {
    expect(extractTableTokenFromQr("  table_ab-123  ")).toBe("table_ab-123");
  });

  it("extracts a token from the production table URL and ignores its query string", () => {
    expect(
      extractTableTokenFromQr("https://dinepulse-customer.vercel.app/t/da7a9437e11a3995?source=qr")
    ).toBe("da7a9437e11a3995");
  });

  it("accepts relative table links without navigating to the scanned host", () => {
    expect(extractTableTokenFromQr("/t/table_1")).toBe("table_1");
  });

  it("rejects unrelated URLs, extra path segments, and unsafe token characters", () => {
    expect(extractTableTokenFromQr("https://example.com/menu")).toBeNull();
    expect(extractTableTokenFromQr("https://example.com/t/table_1/order/123")).toBeNull();
    expect(extractTableTokenFromQr("token.with.dots")).toBeNull();
    expect(extractTableTokenFromQr("")).toBeNull();
  });

  it("places the camera scanner on the order landing page and keeps manual entry available", () => {
    const page = fs.readFileSync(path.resolve(process.cwd(), "src/app/order/page.tsx"), "utf-8");
    expect(page).toContain("import { TableQrScanner }");
    expect(page).toContain("<TableQrScanner />");
    expect(page).toContain("<TableTokenForm />");
  });
});

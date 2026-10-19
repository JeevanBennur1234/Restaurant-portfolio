import { describe, it, expect } from "vitest";
import { generateOpenApiDocument } from "@/server/api/openapi";

describe("OpenAPI Specification Generator", () => {
  const doc = generateOpenApiDocument();

  it("produces valid OpenAPI 3.0 document metadata", () => {
    expect(doc.openapi).toBe("3.0.3");
    expect(doc.info.title).toContain("DinePulse");
    expect(doc.info.version).toBe("1.0.0");
  });

  it("defines standard security schemes and envelope schemas", () => {
    expect(doc.components.securitySchemes.cookieAuth).toBeDefined();
    expect(doc.components.securitySchemes.tableToken).toBeDefined();
    expect(doc.components.schemas.EnvelopeSuccess).toBeDefined();
    expect(doc.components.schemas.EnvelopeError).toBeDefined();
  });

  it("contains every required v1 REST path", () => {
    const expectedPaths = [
      "/api/v1/health",
      "/api/v1/openapi.json",
      "/api/v1/auth/login",
      "/api/v1/auth/logout",
      "/api/v1/auth/me",
      "/api/v1/customer/tables/{token}/menu",
      "/api/v1/customer/tables/{token}/orders",
      "/api/v1/customer/orders/{id}",
      "/api/v1/customer/orders/{id}/payment/razorpay",
      "/api/v1/customer/orders/{id}/payment/verify",
      "/api/v1/customer/orders/{id}/payment/counter",
      "/api/v1/kitchen/tickets",
      "/api/v1/kitchen/orders/{id}/transition",
      "/api/v1/admin/orders",
      "/api/v1/admin/orders/{id}/cancel",
      "/api/v1/admin/categories",
      "/api/v1/admin/categories/{id}",
      "/api/v1/admin/items",
      "/api/v1/admin/items/{id}",
      "/api/v1/admin/items/{id}/availability",
      "/api/v1/admin/items/{id}/modifiers",
      "/api/v1/admin/items/{id}/modifiers/{modifierId}",
      "/api/v1/admin/tables",
      "/api/v1/admin/tables/{id}",
      "/api/v1/admin/tables/qr.pdf",
      "/api/v1/admin/reports",
      "/api/v1/admin/uploads",
    ];

    const definedPaths = Object.keys(doc.paths);
    for (const p of expectedPaths) {
      expect(definedPaths).toContain(p);
    }
  });
});

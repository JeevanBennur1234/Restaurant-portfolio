import { describe, it, expect, vi, beforeEach } from "vitest";

// 1. Mock environment and realtime before imports
vi.mock("@/server/env", () => ({
  env: {
    NODE_ENV: "test",
    DATABASE_URL: "postgres://mock",
    APP_URL: "http://localhost:3000",
  },
}));

vi.mock("@/server/realtime", () => ({
  publishRealtimeEvent: vi.fn().mockResolvedValue(undefined),
  getRestaurantChannel: vi.fn((id: string) => `restaurant:${id}`),
}));

vi.mock("@/server/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("@/server/auth", () => ({
  getStaffSession: vi.fn(),
}));

// 2. Mock database
vi.mock("@/server/db", () => {
  return {
    db: {
      query: {
        orders: {
          findFirst: vi.fn(),
        },
        payments: {
          findFirst: vi.fn(),
        },
        tables: {
          findFirst: vi.fn(),
        },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
      transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
        const mockTx = {
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
          }),
        };
        return cb(mockTx);
      }),
    },
  };
});

import { db } from "@/server/db";
import { publishRealtimeEvent, getRestaurantChannel } from "@/server/realtime";
import {
  formatReceiptNumber,
  formatBillNumber,
  buildReceiptData,
  getCustomerReceipt,
  getCustomerBillOrReceipt,
  getAdminBillOrReceipt,
  recordCounterPayment,
} from "@/server/services/billing";
import { generateReceiptPdf } from "@/server/services/receipt-pdf";
import type { Ctx, ServiceActor } from "@/server/services/result";
import { NextRequest } from "next/server";
import { getStaffSession } from "@/server/auth";
import { GET as getCustomerReceiptRoute } from "@/app/api/v1/customer/orders/[id]/receipt/route";
import { GET as getCustomerBillRoute } from "@/app/api/v1/customer/orders/[id]/bill/route";
import { GET as getCustomerReceiptPdfRoute } from "@/app/api/v1/customer/orders/[id]/receipt/pdf/route";
import { GET as getAdminBillRoute } from "@/app/api/v1/admin/orders/[id]/bill/route";
import { POST as postPayCounterRoute } from "@/app/api/v1/admin/orders/[id]/pay-counter/route";
import { GET as getAdminReceiptPdfRoute } from "@/app/api/v1/admin/orders/[id]/receipt/pdf/route";

describe("Billing & Receipt System", () => {
  const mockRestaurant = {
    id: "rest_masala_1",
    name: "Masala Lane",
  };

  const mockTable = {
    id: "table_7",
    tableNumber: "Table 7",
    qrToken: "token_table_7_valid",
  };

  const mockItems = [
    {
      id: "item_1",
      itemName: "Old Delhi Butter Chicken",
      itemPricePaise: 42000,
      quantity: 1,
      selectedModifiersJson: JSON.stringify([{ name: "Extra Gravy", pricePaise: 4000 }]),
      totalPaise: 46000,
      notes: "Less spicy please",
    },
    {
      id: "item_2",
      itemName: "Garlic Butter Naan",
      itemPricePaise: 6000,
      quantity: 2,
      selectedModifiersJson: null,
      totalPaise: 12000,
      notes: null,
    },
  ];

  // Subtotal = 46000 + 12000 = 58000
  // Tax (5%) = Math.round(58000 * 0.05) = 2900
  // Total = 58000 + 2900 = 60900 (INR 609.00)
  const baseOrder = {
    id: "order_101",
    restaurantId: "rest_masala_1",
    tableId: "table_7",
    orderNumber: "ORD-101",
    status: "preparing" as const,
    paymentStatus: "paid",
    paymentMethod: "razorpay",
    subtotalPaise: 58000,
    taxPaise: 2900,
    totalPaise: 60900,
    customerName: "Rohan Sharma",
    customerPhone: "+91 98765 43210",
    specialInstructions: "Table near the window",
    createdAt: new Date("2026-10-22T12:00:00Z"),
    updatedAt: new Date("2026-10-22T12:05:00Z"),
    table: mockTable,
    restaurant: mockRestaurant,
    items: mockItems,
    payments: [
      {
        id: "pay_1",
        status: "completed",
        provider: "razorpay",
        razorpayPaymentId: "pay_rzp_mock_123456",
        amountPaise: 60900,
        createdAt: new Date("2026-10-22T12:05:00Z"),
        updatedAt: new Date("2026-10-22T12:05:00Z"),
      },
    ],
  };

  const managerActor: ServiceActor = {
    userId: "staff_manager_1",
    username: "manager_arun",
    role: "manager",
    restaurantId: "rest_masala_1",
  };

  const kitchenActor: ServiceActor = {
    userId: "staff_kitchen_1",
    username: "chef_ramesh",
    role: "kitchen",
    restaurantId: "rest_masala_1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Receipt & Bill Number Identifiers", () => {
    it("generates deterministic and collision-safe receipt numbers", () => {
      const fixedDate = new Date("2026-10-22T12:00:00Z");
      const receiptNo = formatReceiptNumber("ORD-101", fixedDate);
      expect(receiptNo).toBe("ML-REC-202610-ORD-101");
    });

    it("generates bill numbers with order number prefix", () => {
      const billNo = formatBillNumber("ORD-101");
      expect(billNo).toBe("ML-BILL-ORD-101");
    });
  });

  describe("2. Build Receipt Data & Server-Side Financials", () => {
    it("splits 5% GST evenly into CGST (2.5%) and SGST (2.5%) in integer paise", () => {
      const receipt = buildReceiptData(baseOrder);

      expect(receipt.subtotalPaise).toBe(58000);
      expect(receipt.taxPaise).toBe(2900);
      expect(receipt.cgstPaise).toBe(1450);
      expect(receipt.sgstPaise).toBe(1450);
      expect(receipt.cgstPaise + receipt.sgstPaise).toBe(receipt.taxPaise);
      expect(receipt.totalPaise).toBe(receipt.subtotalPaise + receipt.taxPaise);
      expect(receipt.isPaid).toBe(true);
      expect(receipt.status).toBe("PAID_RECEIPT");
      expect(receipt.paymentReference).toBe("pay_rzp_mock_123456");
    });

    it("handles odd tax paise without rounding loss", () => {
      const orderWithOddTax = {
        ...baseOrder,
        subtotalPaise: 50500, // 5% = 25.25 -> 2525 paise -> Math.round is 2525
        taxPaise: 2525,
        totalPaise: 53025,
      };

      const receipt = buildReceiptData(orderWithOddTax);
      expect(receipt.cgstPaise).toBe(1262); // Math.floor(2525 / 2)
      expect(receipt.sgstPaise).toBe(1263); // 2525 - 1262
      expect(receipt.cgstPaise + receipt.sgstPaise).toBe(2525);
    });

    it("includes itemized modifiers and notes", () => {
      const receipt = buildReceiptData(baseOrder);
      expect(receipt.items).toHaveLength(2);
      expect(receipt.items[0].name).toBe("Old Delhi Butter Chicken");
      expect(receipt.items[0].modifiers).toHaveLength(1);
      expect(receipt.items[0].modifiers[0].name).toBe("Extra Gravy");
      expect(receipt.items[0].notes).toBe("Less spicy please");
    });

    it("formats status as UNPAID_BILL when order is unpaid", () => {
      const unpaidOrder = {
        ...baseOrder,
        paymentStatus: "counter",
        paymentMethod: null,
        payments: [],
      };

      const bill = buildReceiptData(unpaidOrder);
      expect(bill.isPaid).toBe(false);
      expect(bill.status).toBe("UNPAID_BILL");
      expect(bill.title).toBe("UNPAID BILL");
    });
  });

  describe("3. Customer Online Receipt API Security", () => {
    it("returns paid receipt when order is verified and paid", async () => {
      vi.mocked(db.query.orders.findFirst).mockResolvedValue(baseOrder as never);

      const ctx: Ctx = { db: db as never };
      const res = await getCustomerReceipt(ctx, {
        orderId: "order_101",
        token: "token_table_7_valid",
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.status).toBe("PAID_RECEIPT");
        expect(res.data.receiptNumber).toBe("ML-REC-202610-ORD-101");
        expect(res.data.restaurant.name).toBe("Masala Lane");
        expect(res.data.totalPaise).toBe(60900);
      }
    });

    it("STRICT SECURITY: Refuses to issue a paid receipt if order paymentStatus is not 'paid'", async () => {
      const unpaidOrder = {
        ...baseOrder,
        paymentStatus: "pending",
      };
      vi.mocked(db.query.orders.findFirst).mockResolvedValue(unpaidOrder as never);

      const ctx: Ctx = { db: db as never };
      const res = await getCustomerReceipt(ctx, {
        orderId: "order_101",
        token: "token_table_7_valid",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.status).toBe(400);
        expect(res.message).toContain("Digital receipt is only available after payment has been completed");
      }
    });

    it("rejects unauthorized access if table token does not match order table", async () => {
      vi.mocked(db.query.orders.findFirst).mockResolvedValue(baseOrder as never);

      const ctx: Ctx = { db: db as never };
      const res = await getCustomerReceipt(ctx, {
        orderId: "order_101",
        token: "attacker_token_for_another_table",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("FORBIDDEN");
        expect(res.status).toBe(403);
      }
    });
  });

  describe("3a. Customer Bill View", () => {
    it("allows a table-token customer to view an unpaid counter bill without changing payment state", async () => {
      const unpaidOrder = {
        ...baseOrder,
        paymentStatus: "counter",
        paymentMethod: "counter",
        payments: [],
      };
      vi.mocked(db.query.orders.findFirst).mockResolvedValue(unpaidOrder as never);

      const res = await getCustomerBillOrReceipt(
        { db: db as never },
        { orderId: "order_101", token: "token_table_7_valid" }
      );

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.status).toBe("UNPAID_BILL");
        expect(res.data.isPaid).toBe(false);
        expect(res.data.paymentMethod).toBe("counter");
      }
      expect(db.update).not.toHaveBeenCalled();
    });

    it("rejects a customer bill request when the table token does not match", async () => {
      vi.mocked(db.query.orders.findFirst).mockResolvedValue(baseOrder as never);

      const res = await getCustomerBillOrReceipt(
        { db: db as never },
        { orderId: "order_101", token: "wrong_table_token" }
      );

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("FORBIDDEN");
        expect(res.status).toBe(403);
      }
    });
  });

  describe("4. Manager Billing & Unpaid Bill Workflow", () => {
    it("allows manager to view unpaid bill without altering order payment status", async () => {
      const pendingOrder = {
        ...baseOrder,
        paymentStatus: "pending",
        payments: [],
      };
      vi.mocked(db.query.orders.findFirst).mockResolvedValue(pendingOrder as never);

      const ctx: Ctx = { db: db as never, actor: managerActor };
      const res = await getAdminBillOrReceipt(ctx, { orderId: "order_101" });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.status).toBe("UNPAID_BILL");
        expect(res.data.isPaid).toBe(false);
        expect(res.data.billNumber).toBe("ML-BILL-ORD-101");
      }

      // Assert that viewing bill never updated order state in database
      expect(db.update).not.toHaveBeenCalled();
    });

    it("rejects kitchen role from accessing admin billing", async () => {
      const ctx: Ctx = { db: db as never, actor: kitchenActor };
      const res = await getAdminBillOrReceipt(ctx, { orderId: "order_101" });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("UNAUTHENTICATED");
        expect(res.status).toBe(401);
      }
    });
  });

  describe("5. Manager Counter Payment Recording", () => {
    it("records counter cash payment, marks order paid, inserts payments and audit events, and broadcasts realtime events", async () => {
      const pendingOrder = {
        ...baseOrder,
        paymentStatus: "pending",
        paymentMethod: null,
        payments: [],
      };

      const paidOrder = {
        ...pendingOrder,
        paymentStatus: "paid",
        paymentMethod: "cash",
      };

      // Mock first lookup as pending, second lookup (post-tx) as paid
      vi.mocked(db.query.orders.findFirst)
        .mockResolvedValueOnce(pendingOrder as never)
        .mockResolvedValueOnce(paidOrder as never);

      const ctx: Ctx = { db: db as never, actor: managerActor };
      const res = await recordCounterPayment(ctx, {
        orderId: "order_101",
        paymentMethod: "cash",
        transactionRef: "CASH-REGISTER-01",
        note: "Paid exact change in INR",
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.status).toBe("PAID_RECEIPT");
        expect(res.data.isPaid).toBe(true);
        expect(res.data.paymentMethod).toBe("cash");
      }

      // Transaction executed
      expect(db.transaction).toHaveBeenCalled();

      // Realtime events published to kitchen and order channels
      expect(publishRealtimeEvent).toHaveBeenCalledWith(
        getRestaurantChannel("rest_masala_1"),
        "order.created",
        expect.objectContaining({ orderId: "order_101", paymentStatus: "paid" })
      );

      expect(publishRealtimeEvent).toHaveBeenCalledWith(
        "order:order_101",
        "order.paid",
        expect.objectContaining({ orderId: "order_101", paymentStatus: "paid" })
      );
    });

    it("IDEMPOTENCY: Safely handles repeat counter payment attempts without duplicating payments", async () => {
      vi.mocked(db.query.orders.findFirst).mockResolvedValue(baseOrder as never);

      const ctx: Ctx = { db: db as never, actor: managerActor };
      const res = await recordCounterPayment(ctx, {
        orderId: "order_101",
        paymentMethod: "cash",
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.status).toBe("PAID_RECEIPT");
      }
      // Since order was already paid, no new transaction was executed
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it("rejects counter payment for a cancelled order", async () => {
      const cancelledOrder = {
        ...baseOrder,
        status: "cancelled" as const,
        paymentStatus: "pending",
      };
      vi.mocked(db.query.orders.findFirst).mockResolvedValue(cancelledOrder as never);

      const ctx: Ctx = { db: db as never, actor: managerActor };
      const res = await recordCounterPayment(ctx, {
        orderId: "order_101",
        paymentMethod: "cash",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("CONFLICT");
        expect(res.status).toBe(400);
      }
    });
  });

  describe("6. PDF Generation (A4 & 80mm Thermal)", () => {
    it("generates valid A4 PDF receipt buffer with PDF header", async () => {
      const receipt = buildReceiptData(baseOrder);
      const pdfBuffer = await generateReceiptPdf(receipt, { format: "a4" });

      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(1000);
      // Valid PDF magic header
      expect(pdfBuffer.toString("utf8", 0, 5)).toBe("%PDF-");
    });

    it("generates valid 80mm thermal receipt PDF buffer with PDF header", async () => {
      const receipt = buildReceiptData(baseOrder);
      const pdfBuffer = await generateReceiptPdf(receipt, { format: "thermal" });

      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(500);
      expect(pdfBuffer.toString("utf8", 0, 5)).toBe("%PDF-");
    });

    it("generates valid A4 unpaid bill PDF buffer with unpaid bill title", async () => {
      const unpaidOrder = {
        ...baseOrder,
        paymentStatus: "counter",
        paymentMethod: null,
        payments: [],
      };
      const bill = buildReceiptData(unpaidOrder);
      const pdfBuffer = await generateReceiptPdf(bill, { format: "a4" });

      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.toString("utf8", 0, 5)).toBe("%PDF-");
    });
  });

  describe("7. HTTP API Route Handlers Integration", () => {
    const tableWithRest = {
      ...mockTable,
      restaurant: mockRestaurant,
    };

    it("GET /api/v1/customer/orders/[id]/receipt returns 200 with digital receipt for paid order", async () => {
      vi.mocked(db.query.tables.findFirst).mockResolvedValue(tableWithRest as never);
      vi.mocked(db.query.orders.findFirst).mockResolvedValue(baseOrder as never);

      const req = new NextRequest("http://localhost:3000/api/v1/customer/orders/order_101/receipt", {
        headers: {
          "x-table-token": "token_table_7_valid",
        },
      });

      const res = await getCustomerReceiptRoute(req, {
        params: Promise.resolve({ id: "order_101" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.receiptNumber).toBe("ML-REC-202610-ORD-101");
      expect(json.data.status).toBe("PAID_RECEIPT");
    });

    it("GET /api/v1/customer/orders/[id]/bill returns an unpaid bill for a valid table token", async () => {
      const unpaidOrder = { ...baseOrder, paymentStatus: "counter", paymentMethod: "counter" };
      vi.mocked(db.query.tables.findFirst).mockResolvedValue(tableWithRest as never);
      vi.mocked(db.query.orders.findFirst).mockResolvedValue(unpaidOrder as never);

      const req = new NextRequest("http://localhost:3000/api/v1/customer/orders/order_101/bill", {
        headers: { "x-table-token": "token_table_7_valid" },
      });
      const res = await getCustomerBillRoute(req, {
        params: Promise.resolve({ id: "order_101" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("UNPAID_BILL");
      expect(json.data.isPaid).toBe(false);
      expect(db.update).not.toHaveBeenCalled();
    });

    it("GET /api/v1/customer/orders/[id]/receipt returns 400 for unpaid order", async () => {
      const unpaidOrder = { ...baseOrder, paymentStatus: "pending" };
      vi.mocked(db.query.tables.findFirst).mockResolvedValue(tableWithRest as never);
      vi.mocked(db.query.orders.findFirst).mockResolvedValue(unpaidOrder as never);

      const req = new NextRequest("http://localhost:3000/api/v1/customer/orders/order_101/receipt", {
        headers: {
          "x-table-token": "token_table_7_valid",
        },
      });

      const res = await getCustomerReceiptRoute(req, {
        params: Promise.resolve({ id: "order_101" }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.message).toContain("Digital receipt is only available after payment has been completed");
    });

    it("GET /api/v1/customer/orders/[id]/receipt/pdf returns 200 application/pdf for paid order", async () => {
      vi.mocked(db.query.tables.findFirst).mockResolvedValue(tableWithRest as never);
      vi.mocked(db.query.orders.findFirst).mockResolvedValue(baseOrder as never);

      const req = new NextRequest(
        "http://localhost:3000/api/v1/customer/orders/order_101/receipt/pdf?format=a4&token=token_table_7_valid"
      );

      const res = await getCustomerReceiptPdfRoute(req, {
        params: Promise.resolve({ id: "order_101" }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
      expect(res.headers.get("content-disposition")).toContain("receipt-ORD-101.pdf");
      const buffer = await res.arrayBuffer();
      expect(buffer.byteLength).toBeGreaterThan(1000);
    });

    it("POST /api/v1/admin/orders/[id]/pay-counter records payment and returns 200 with receipt", async () => {
      vi.mocked(getStaffSession).mockResolvedValue({
        userId: "staff_manager_1",
        username: "manager_arun",
        role: "manager",
        restaurantId: "rest_masala_1",
        restaurantName: "Masala Lane",
        isDemo: false,
      });

      const pendingOrder = { ...baseOrder, paymentStatus: "pending", payments: [] };
      const paidOrder = { ...pendingOrder, paymentStatus: "paid", paymentMethod: "card" };

      vi.mocked(db.query.orders.findFirst)
        .mockResolvedValueOnce(pendingOrder as never)
        .mockResolvedValueOnce(paidOrder as never);

      const req = new NextRequest(
        "http://localhost:3000/api/v1/admin/orders/order_101/pay-counter",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            host: "localhost:3000",
            origin: "http://localhost:3000",
          },
          body: JSON.stringify({
            paymentMethod: "card",
            transactionRef: "POS-TXN-9876",
            note: "Paid via HDFC card machine",
          }),
        }
      );

      const res = await postPayCounterRoute(req, {
        params: Promise.resolve({ id: "order_101" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.paymentMethod).toBe("card");
      expect(json.data.status).toBe("PAID_RECEIPT");
    });

    it("GET /api/v1/admin/orders/[id]/bill returns 200 with unpaid bill for pending order", async () => {
      vi.mocked(getStaffSession).mockResolvedValue({
        userId: "staff_manager_1",
        username: "manager_arun",
        role: "manager",
        restaurantId: "rest_masala_1",
        restaurantName: "Masala Lane",
        isDemo: false,
      });

      const pendingOrder = { ...baseOrder, paymentStatus: "pending", payments: [] };
      vi.mocked(db.query.orders.findFirst).mockResolvedValue(pendingOrder as never);

      const req = new NextRequest("http://localhost:3000/api/v1/admin/orders/order_101/bill");

      const res = await getAdminBillRoute(req, {
        params: Promise.resolve({ id: "order_101" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("UNPAID_BILL");
      expect(json.data.billNumber).toBe("ML-BILL-ORD-101");
    });

    it("GET /api/v1/admin/orders/[id]/receipt/pdf returns 200 application/pdf for thermal format", async () => {
      vi.mocked(getStaffSession).mockResolvedValue({
        userId: "staff_manager_1",
        username: "manager_arun",
        role: "manager",
        restaurantId: "rest_masala_1",
        restaurantName: "Masala Lane",
        isDemo: false,
      });

      vi.mocked(db.query.orders.findFirst).mockResolvedValue(baseOrder as never);

      const req = new NextRequest(
        "http://localhost:3000/api/v1/admin/orders/order_101/receipt/pdf?format=thermal"
      );

      const res = await getAdminReceiptPdfRoute(req, {
        params: Promise.resolve({ id: "order_101" }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
      expect(res.headers.get("content-disposition")).toContain("receipt-ORD-101-thermal.pdf");
      const buffer = await res.arrayBuffer();
      expect(buffer.byteLength).toBeGreaterThan(500);
    });
  });
});

import type { OrderStatus } from "@/server/db/schema";

export interface DemoOrderItem {
  id: string;
  menuItemId: string | null;
  itemName: string;
  itemPricePaise: number;
  quantity: number;
  selectedModifiers: Array<{ id: string; name: string; pricePaise: number }>;
  totalPaise: number;
  notes: string | null;
}

export interface DemoOrder {
  id: string;
  restaurantId: string;
  tableId: string;
  tableNumber: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: "pending" | "paid" | "counter" | "failed";
  paymentMethod: "pay_now" | "counter" | null;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  customerName: string | null;
  customerPhone: string | null;
  specialInstructions: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: DemoOrderItem[];
  events: Array<{
    id: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    note: string | null;
    createdAt: Date;
  }>;
}

export interface DemoPayment {
  id: string;
  orderId: string;
  restaurantId: string;
  amountPaise: number;
  status: "pending" | "completed" | "failed" | "refunded";
  provider: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  razorpaySignature: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// In-memory global store preserved across Server Actions and HMR in demo mode
const globalForDemoOrders = globalThis as unknown as {
  demoOrders: Map<string, DemoOrder> | undefined;
  demoPayments: Map<string, DemoPayment> | undefined;
};

export const demoOrdersStore =
  globalForDemoOrders.demoOrders ?? new Map<string, DemoOrder>();

export const demoPaymentsStore =
  globalForDemoOrders.demoPayments ?? new Map<string, DemoPayment>();

if (process.env.NODE_ENV !== "production") {
  globalForDemoOrders.demoOrders = demoOrdersStore;
  globalForDemoOrders.demoPayments = demoPaymentsStore;
}

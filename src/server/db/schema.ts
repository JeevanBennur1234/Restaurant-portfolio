import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * Order status lifecycle enum:
 * placed -> accepted -> preparing -> ready -> served (or cancelled at valid stages)
 */
export const orderStatusEnum = pgEnum("order_status", [
  "placed",
  "accepted",
  "preparing",
  "ready",
  "served",
  "cancelled",
]);

export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];

/**
 * Staff roles enum
 */
export const staffRoleEnum = pgEnum("staff_role", [
  "kitchen",
  "manager",
  "admin",
]);

export type StaffRole = (typeof staffRoleEnum.enumValues)[number];

/**
 * Payment status enum
 */
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "completed",
  "failed",
  "refunded",
]);

export type PaymentStatus = (typeof paymentStatusEnum.enumValues)[number];

// ============================================================================
// 1. Restaurants
// ============================================================================
export const restaurants = pgTable("restaurants", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  currency: text("currency").notNull().default("INR"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ============================================================================
// 2. Tables
// ============================================================================
export const tables = pgTable(
  "tables",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    tableNumber: text("table_number").notNull(),
    capacity: integer("capacity").notNull().default(4),
    // Unguessable token embedded in guest QR code URL
    qrToken: text("qr_token").notNull().unique(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("tables_qr_token_idx").on(table.qrToken),
    index("tables_restaurant_id_idx").on(table.restaurantId),
  ]
);

// ============================================================================
// 3. Categories
// ============================================================================
export const categories = pgTable(
  "categories",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("categories_restaurant_id_idx").on(table.restaurantId),
    uniqueIndex("categories_restaurant_slug_idx").on(
      table.restaurantId,
      table.slug
    ),
  ]
);

// ============================================================================
// 4. Menu Items
// ============================================================================
export const menuItems = pgTable(
  "menu_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    // Price strictly stored as integer paise (e.g. 29900 paise = ₹299.00)
    pricePaise: integer("price_paise").notNull(),
    isVeg: boolean("is_veg").notNull().default(true),
    prepTimeMinutes: integer("prep_time_minutes").notNull().default(15),
    imageUrl: text("image_url"),
    isAvailable: boolean("is_available").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("menu_items_restaurant_id_idx").on(table.restaurantId),
    index("menu_items_category_id_idx").on(table.categoryId),
  ]
);

// ============================================================================
// 5. Modifiers
// ============================================================================
export const modifiers = pgTable(
  "modifiers",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    menuItemId: text("menu_item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    groupName: text("group_name").notNull(), // e.g. "Spice Level", "Portion"
    name: text("name").notNull(), // e.g. "Mild", "Medium", "Full Portion"
    pricePaise: integer("price_paise").notNull().default(0),
    isRequired: boolean("is_required").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("modifiers_menu_item_id_idx").on(table.menuItemId)]
);

// ============================================================================
// 6. Orders
// ============================================================================
export const orders = pgTable(
  "orders",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    tableId: text("table_id")
      .notNull()
      .references(() => tables.id, { onDelete: "cascade" }),
    orderNumber: text("order_number").notNull(),
    status: orderStatusEnum("status").notNull().default("placed"),
    // Financial fields computed only on server in integer paise
    subtotalPaise: integer("subtotal_paise").notNull().default(0),
    taxPaise: integer("tax_paise").notNull().default(0),
    totalPaise: integer("total_paise").notNull().default(0),
    paymentStatus: text("payment_status").notNull().default("pending"),
    paymentMethod: text("payment_method"),
    customerName: text("customer_name"),
    customerPhone: text("customer_phone"),
    specialInstructions: text("special_instructions"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Composite index on orders(status, created_at) requested
    index("orders_status_created_at_idx").on(table.status, table.createdAt),
    index("orders_restaurant_id_idx").on(table.restaurantId),
    index("orders_table_id_idx").on(table.tableId),
  ]
);

// ============================================================================
// 7. Order Items
// ============================================================================
export const orderItems = pgTable(
  "order_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    menuItemId: text("menu_item_id").references(() => menuItems.id, {
      onDelete: "set null",
    }),
    itemName: text("item_name").notNull(),
    itemPricePaise: integer("item_price_paise").notNull(),
    quantity: integer("quantity").notNull().default(1),
    // Array of selected modifiers formatted as JSON string
    selectedModifiersJson: text("selected_modifiers_json"),
    totalPaise: integer("total_paise").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("order_items_order_id_idx").on(table.orderId)]
);

// ============================================================================
// 8. Order Events
// ============================================================================
export const orderEvents = pgTable(
  "order_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: orderStatusEnum("from_status"),
    toStatus: orderStatusEnum("to_status").notNull(),
    note: text("note"),
    staffUserId: text("staff_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("order_events_order_id_idx").on(table.orderId),
    index("order_events_created_at_idx").on(table.createdAt),
  ]
);

// ============================================================================
// 9. Payments
// ============================================================================
export const payments = pgTable(
  "payments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    amountPaise: integer("amount_paise").notNull(),
    status: paymentStatusEnum("status").notNull().default("pending"),
    provider: text("provider").notNull().default("razorpay"),
    razorpayOrderId: text("razorpay_order_id"),
    razorpayPaymentId: text("razorpay_payment_id"),
    razorpaySignature: text("razorpay_signature"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("payments_order_id_idx").on(table.orderId),
    index("payments_restaurant_id_idx").on(table.restaurantId),
  ]
);

// ============================================================================
// 10. Staff Users
// ============================================================================
export const staffUsers = pgTable(
  "staff_users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    username: text("username").notNull().unique(),
    email: text("email"),
    passwordHash: text("password_hash").notNull(),
    role: staffRoleEnum("role").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("staff_users_restaurant_id_idx").on(table.restaurantId),
    uniqueIndex("staff_users_username_idx").on(table.username),
  ]
);

// ============================================================================
// Drizzle Relations
// ============================================================================
export const restaurantsRelations = relations(restaurants, ({ many }) => ({
  tables: many(tables),
  categories: many(categories),
  menuItems: many(menuItems),
  orders: many(orders),
  staffUsers: many(staffUsers),
}));

export const tablesRelations = relations(tables, ({ one, many }) => ({
  restaurant: one(restaurants, {
    fields: [tables.restaurantId],
    references: [restaurants.id],
  }),
  orders: many(orders),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  restaurant: one(restaurants, {
    fields: [categories.restaurantId],
    references: [restaurants.id],
  }),
  menuItems: many(menuItems),
}));

export const menuItemsRelations = relations(menuItems, ({ one, many }) => ({
  restaurant: one(restaurants, {
    fields: [menuItems.restaurantId],
    references: [restaurants.id],
  }),
  category: one(categories, {
    fields: [menuItems.categoryId],
    references: [categories.id],
  }),
  modifiers: many(modifiers),
}));

export const modifiersRelations = relations(modifiers, ({ one }) => ({
  menuItem: one(menuItems, {
    fields: [modifiers.menuItemId],
    references: [menuItems.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  restaurant: one(restaurants, {
    fields: [orders.restaurantId],
    references: [restaurants.id],
  }),
  table: one(tables, {
    fields: [orders.tableId],
    references: [tables.id],
  }),
  items: many(orderItems),
  events: many(orderEvents),
  payments: many(payments),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  menuItem: one(menuItems, {
    fields: [orderItems.menuItemId],
    references: [menuItems.id],
  }),
}));

export const orderEventsRelations = relations(orderEvents, ({ one }) => ({
  order: one(orders, {
    fields: [orderEvents.orderId],
    references: [orders.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, {
    fields: [payments.orderId],
    references: [orders.id],
  }),
  restaurant: one(restaurants, {
    fields: [payments.restaurantId],
    references: [restaurants.id],
  }),
}));

export const staffUsersRelations = relations(staffUsers, ({ one }) => ({
  restaurant: one(restaurants, {
    fields: [staffUsers.restaurantId],
    references: [restaurants.id],
  }),
}));

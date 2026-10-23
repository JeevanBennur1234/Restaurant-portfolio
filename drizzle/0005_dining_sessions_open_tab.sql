DO $$ BEGIN
 CREATE TYPE "dining_session_status" AS ENUM('active', 'bill_requested', 'closed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dining_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"table_id" text NOT NULL,
	"session_token" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"payment_status" text DEFAULT 'open' NOT NULL,
	"payment_method" text,
	"customer_name" text,
	"customer_phone" text,
	"subtotal_paise" integer DEFAULT 0 NOT NULL,
	"tax_paise" integer DEFAULT 0 NOT NULL,
	"total_paise" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "dining_sessions_session_token_unique" UNIQUE("session_token"),
	CONSTRAINT "dining_sessions_subtotal_paise_nonnegative" CHECK ("dining_sessions"."subtotal_paise" >= 0),
	CONSTRAINT "dining_sessions_tax_paise_nonnegative" CHECK ("dining_sessions"."tax_paise" >= 0),
	CONSTRAINT "dining_sessions_total_paise_nonnegative" CHECK ("dining_sessions"."total_paise" >= 0)
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "dining_session_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "round_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "dining_session_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dining_sessions" ADD CONSTRAINT "dining_sessions_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dining_sessions" ADD CONSTRAINT "dining_sessions_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_dining_session_id_dining_sessions_id_fk" FOREIGN KEY ("dining_session_id") REFERENCES "dining_sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_dining_session_id_dining_sessions_id_fk" FOREIGN KEY ("dining_session_id") REFERENCES "dining_sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dining_sessions_restaurant_id_idx" ON "dining_sessions" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dining_sessions_table_id_status_idx" ON "dining_sessions" USING btree ("table_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dining_sessions_session_token_idx" ON "dining_sessions" USING btree ("session_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_dining_session_id_idx" ON "orders" USING btree ("dining_session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_dining_session_id_idx" ON "payments" USING btree ("dining_session_id");

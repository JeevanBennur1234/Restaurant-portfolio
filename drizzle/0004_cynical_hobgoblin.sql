CREATE UNIQUE INDEX "tables_restaurant_active_table_number_idx" ON "tables" USING btree ("restaurant_id","table_number") WHERE "tables"."is_active" = true;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_price_paise_nonnegative" CHECK ("menu_items"."price_paise" >= 0);--> statement-breakpoint
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_price_paise_nonnegative" CHECK ("modifiers"."price_paise" >= 0);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_item_price_paise_nonnegative" CHECK ("order_items"."item_price_paise" >= 0);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_positive" CHECK ("order_items"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_total_paise_nonnegative" CHECK ("order_items"."total_paise" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_subtotal_paise_nonnegative" CHECK ("orders"."subtotal_paise" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tax_paise_nonnegative" CHECK ("orders"."tax_paise" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_paise_nonnegative" CHECK ("orders"."total_paise" >= 0);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_paise_nonnegative" CHECK ("payments"."amount_paise" >= 0);--> statement-breakpoint
ALTER TABLE "tables" ADD CONSTRAINT "tables_capacity_positive" CHECK ("tables"."capacity" > 0);
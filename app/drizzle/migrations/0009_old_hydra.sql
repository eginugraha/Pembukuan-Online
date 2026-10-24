DELETE FROM "journal_entries" WHERE "purchase_order_id" IS NOT NULL OR "invoice_id" IS NOT NULL;--> statement-breakpoint
DELETE FROM "purchase_order_lines";--> statement-breakpoint
DELETE FROM "purchase_orders";--> statement-breakpoint
DELETE FROM "document_number_counters" WHERE "prefix" = 'PO';--> statement-breakpoint
ALTER TABLE "journal_entries" DROP CONSTRAINT "journal_entries_invoice_id_invoices_id_fk";
--> statement-breakpoint
ALTER TABLE "journal_entries" DROP CONSTRAINT "journal_entries_purchase_order_id_purchase_orders_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_order_lines" DROP CONSTRAINT "purchase_order_lines_expense_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_payable_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_tax_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_orders" ALTER COLUMN "po_no" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "journal_entries" DROP COLUMN "invoice_id";--> statement-breakpoint
ALTER TABLE "journal_entries" DROP COLUMN "purchase_order_id";--> statement-breakpoint
ALTER TABLE "purchase_order_lines" DROP COLUMN "expense_account_id";--> statement-breakpoint
ALTER TABLE "purchase_orders" DROP COLUMN "payable_account_id";--> statement-breakpoint
ALTER TABLE "purchase_orders" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "purchase_orders" DROP COLUMN "tax_account_id";--> statement-breakpoint
DROP TYPE "public"."po_status";
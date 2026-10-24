DELETE FROM "journal_entries" WHERE "invoice_id" IS NOT NULL;--> statement-breakpoint
DELETE FROM "invoice_lines";--> statement-breakpoint
DELETE FROM "invoices";--> statement-breakpoint
DELETE FROM "document_number_counters" WHERE "prefix" = 'INV';--> statement-breakpoint
ALTER TABLE "invoice_lines" DROP CONSTRAINT "invoice_lines_revenue_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_receivable_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_tax_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "invoice_no" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoice_lines" DROP COLUMN "revenue_account_id";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "receivable_account_id";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "tax_account_id";--> statement-breakpoint
DROP TYPE "public"."invoice_status";
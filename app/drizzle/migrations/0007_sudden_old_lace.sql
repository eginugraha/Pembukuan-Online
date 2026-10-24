DELETE FROM "journal_entries" WHERE "advance_receipt_id" IS NOT NULL;--> statement-breakpoint
UPDATE "invoices" SET "paid_via_advance_receipt_id" = NULL;--> statement-breakpoint
DELETE FROM "advance_receipts";--> statement-breakpoint
DELETE FROM "document_number_counters" WHERE "prefix" = 'UM';--> statement-breakpoint
ALTER TABLE "advance_receipts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "advance_receipts" CASCADE;--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "paid_via_advance_receipt_id";--> statement-breakpoint
ALTER TABLE "journal_entries" DROP COLUMN "advance_receipt_id";--> statement-breakpoint
DROP TYPE "public"."advance_receipt_status";
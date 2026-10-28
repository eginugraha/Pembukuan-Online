CREATE TABLE "company_signers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"content" "bytea",
	"mime" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "last_signer_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_receipts" ADD COLUMN "last_signer_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "last_signer_id" uuid;--> statement-breakpoint
ALTER TABLE "company_signers" ADD CONSTRAINT "company_signers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_last_signer_id_company_signers_id_fk" FOREIGN KEY ("last_signer_id") REFERENCES "public"."company_signers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_last_signer_id_company_signers_id_fk" FOREIGN KEY ("last_signer_id") REFERENCES "public"."company_signers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_last_signer_id_company_signers_id_fk" FOREIGN KEY ("last_signer_id") REFERENCES "public"."company_signers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "company_signers" ("company_id", "name", "title", "content", "mime")
SELECT c."id", COALESCE(NULLIF(trim(c."signer_name"), ''), c."name"), NULLIF(trim(c."signer_title"), ''), a."content", a."mime"
FROM "companies" c
LEFT JOIN "company_assets" a ON a."company_id" = c."id" AND a."kind" = 'signature'
WHERE NULLIF(trim(c."signer_name"), '') IS NOT NULL OR NULLIF(trim(c."signer_title"), '') IS NOT NULL OR a."content" IS NOT NULL;--> statement-breakpoint
DELETE FROM "company_assets" WHERE "kind" = 'signature';--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN "signer_name";--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN "signer_title";--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN "signature_url";
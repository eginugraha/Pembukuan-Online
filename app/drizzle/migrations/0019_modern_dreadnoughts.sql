CREATE TYPE "public"."ar_ap_kind" AS ENUM('AR', 'AP');--> statement-breakpoint
CREATE TABLE "ar_ap_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" "ar_ap_kind" NOT NULL,
	"contact_id" uuid NOT NULL,
	"title" text NOT NULL,
	"total" numeric(18, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'IDR' NOT NULL,
	"has_terms" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ar_ap_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"term_no" integer NOT NULL,
	"name" text,
	"percent" numeric(5, 2) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"paid" boolean DEFAULT false NOT NULL,
	"invoice_id" uuid,
	"purchase_order_id" uuid,
	CONSTRAINT "ar_ap_terms_entry_no_uq" UNIQUE("entry_id","term_no"),
	CONSTRAINT "ar_ap_terms_one_doc_ck" CHECK ("ar_ap_terms"."invoice_id" IS NULL OR "ar_ap_terms"."purchase_order_id" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "ar_ap_entries" ADD CONSTRAINT "ar_ap_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_ap_entries" ADD CONSTRAINT "ar_ap_entries_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_ap_entries" ADD CONSTRAINT "ar_ap_entries_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_ap_terms" ADD CONSTRAINT "ar_ap_terms_entry_id_ar_ap_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."ar_ap_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_ap_terms" ADD CONSTRAINT "ar_ap_terms_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_ap_terms" ADD CONSTRAINT "ar_ap_terms_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ar_ap_terms_invoice_uq" ON "ar_ap_terms" USING btree ("invoice_id") WHERE "ar_ap_terms"."invoice_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ar_ap_terms_po_uq" ON "ar_ap_terms" USING btree ("purchase_order_id") WHERE "ar_ap_terms"."purchase_order_id" IS NOT NULL;
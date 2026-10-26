CREATE TABLE "company_assets" (
	"company_id" uuid NOT NULL,
	"kind" varchar(20) NOT NULL,
	"content" "bytea" NOT NULL,
	"mime" varchar(20) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_assets_company_id_kind_pk" PRIMARY KEY("company_id","kind")
);
--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "invoice_no" SET DATA TYPE varchar(50);--> statement-breakpoint
ALTER TABLE "purchase_orders" ALTER COLUMN "po_no" SET DATA TYPE varchar(50);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "code" varchar(15);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "phone" varchar(30);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "bank_name" varchar(100);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "bank_account_no" varchar(50);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "bank_account_holder" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "swift_code" varchar(11);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "signer_name" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "signer_title" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "signature_url" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "watermark_url" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "code" varchar(15);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "company_assets" ADD CONSTRAINT "company_assets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
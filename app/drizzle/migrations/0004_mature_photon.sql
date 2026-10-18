CREATE TABLE "company_logos" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"content" "bytea" NOT NULL,
	"mime" varchar(20) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "company_logos" ADD CONSTRAINT "company_logos_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
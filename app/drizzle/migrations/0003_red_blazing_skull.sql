ALTER TYPE "public"."journal_type" ADD VALUE 'CLOSING';--> statement-breakpoint
CREATE TABLE "fiscal_closings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"journal_id" uuid,
	"retained_earnings_account_id" uuid NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fiscal_closings_company_start_uq" UNIQUE("company_id","period_start")
);
--> statement-breakpoint
ALTER TABLE "fiscal_closings" ADD CONSTRAINT "fiscal_closings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_closings" ADD CONSTRAINT "fiscal_closings_journal_id_journal_entries_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journal_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_closings" ADD CONSTRAINT "fiscal_closings_retained_earnings_account_id_accounts_id_fk" FOREIGN KEY ("retained_earnings_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_closings" ADD CONSTRAINT "fiscal_closings_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
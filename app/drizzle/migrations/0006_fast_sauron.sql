ALTER TABLE "contacts" ADD COLUMN "attention" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "position" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "deleted_at" timestamp with time zone;
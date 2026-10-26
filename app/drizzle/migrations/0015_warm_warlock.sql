ALTER TABLE "purchase_orders" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "currency" varchar(3) DEFAULT 'IDR' NOT NULL;
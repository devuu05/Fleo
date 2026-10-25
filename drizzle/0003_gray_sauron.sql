ALTER TABLE "deals" ADD COLUMN "observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "gate" text;--> statement-breakpoint
ALTER TABLE "price_snapshots" ADD COLUMN "observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "price_snapshots" ADD COLUMN "gate" text;
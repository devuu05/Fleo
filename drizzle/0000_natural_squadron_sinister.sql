CREATE TABLE "deals" (
	"id" serial PRIMARY KEY NOT NULL,
	"route_id" integer NOT NULL,
	"cabin" text NOT NULL,
	"depart_date" text NOT NULL,
	"depart_month" text NOT NULL,
	"return_date" text DEFAULT '' NOT NULL,
	"price_inr" integer NOT NULL,
	"baseline_inr" integer NOT NULL,
	"pct_below" real NOT NULL,
	"savings_inr" integer NOT NULL,
	"airline" text,
	"stops" integer NOT NULL,
	"duration_minutes" integer,
	"is_error_fare" boolean DEFAULT false NOT NULL,
	"visa_warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deep_link" text,
	"source" text NOT NULL,
	"found_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"route_id" integer NOT NULL,
	"cabin" text NOT NULL,
	"depart_date" text NOT NULL,
	"depart_month" text NOT NULL,
	"return_date" text,
	"price_inr" integer NOT NULL,
	"airline" text,
	"stops" integer DEFAULT 0 NOT NULL,
	"duration_minutes" integer,
	"transit_countries" jsonb,
	"deep_link" text,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routes" (
	"id" serial PRIMARY KEY NOT NULL,
	"origin" text NOT NULL,
	"destination" text NOT NULL,
	"destination_city" text NOT NULL,
	"destination_country" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transit_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"country_code" text NOT NULL,
	"country_name" text NOT NULL,
	"note" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transit_rules_country_code_unique" UNIQUE("country_code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"is_premium" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deals_found_idx" ON "deals" USING btree ("found_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deals_unique_idx" ON "deals" USING btree ("route_id","cabin","depart_date","return_date");--> statement-breakpoint
CREATE INDEX "snap_baseline_idx" ON "price_snapshots" USING btree ("route_id","depart_month","cabin","fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "routes_od_idx" ON "routes" USING btree ("origin","destination");
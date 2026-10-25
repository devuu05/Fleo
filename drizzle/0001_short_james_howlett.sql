ALTER TABLE "users" ADD COLUMN "auth_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_auth_id_unique" UNIQUE("auth_id");
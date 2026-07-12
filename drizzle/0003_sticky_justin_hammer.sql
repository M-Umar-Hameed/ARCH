ALTER TABLE "notes" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "deleted_at" timestamp with time zone;
CREATE TABLE IF NOT EXISTS "forge_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ticket_id" uuid NOT NULL,
	"status" text NOT NULL,
	"stage" text NOT NULL,
	"plan_agent" text NOT NULL,
	"work_agent" text NOT NULL,
	"review_agent" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone
);

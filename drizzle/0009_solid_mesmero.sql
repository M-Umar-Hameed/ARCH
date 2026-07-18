CREATE TABLE IF NOT EXISTS "project_settings" (
	"project_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "project_settings_project_id_key_pk" PRIMARY KEY("project_id","key")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_settings" ADD CONSTRAINT "project_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

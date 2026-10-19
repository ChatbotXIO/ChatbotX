CREATE TABLE "WorkingHoursDateOverride" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"workingHoursId" bigint,
	"date" date NOT NULL,
	"name" text,
	"ranges" jsonb NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "WorkingHoursDateOverride_workspace_date_key" ON "WorkingHoursDateOverride" ("workspaceId","date") WHERE "workingHoursId" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "WorkingHoursDateOverride_schedule_date_key" ON "WorkingHoursDateOverride" ("workingHoursId","date") WHERE "workingHoursId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "WorkingHoursDateOverride_workspaceId_date_idx" ON "WorkingHoursDateOverride" ("workspaceId","date");--> statement-breakpoint
ALTER TABLE "WorkingHoursDateOverride" ADD CONSTRAINT "WorkingHoursDateOverride_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WorkingHoursDateOverride" ADD CONSTRAINT "WorkingHoursDateOverride_workingHoursId_workspaceId_fkey" FOREIGN KEY ("workingHoursId","workspaceId") REFERENCES "WorkingHours"("id","workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
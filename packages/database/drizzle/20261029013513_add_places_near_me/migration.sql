CREATE TABLE "PlaceCategory" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" text NOT NULL,
	"rank" integer DEFAULT 10 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PlaceLocation" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"categoryId" bigint,
	CONSTRAINT "PlaceLocation_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90),
	CONSTRAINT "PlaceLocation_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180)
);
--> statement-breakpoint
CREATE INDEX "PlaceCategory_workspaceId_idx" ON "PlaceCategory" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "PlaceCategory_workspaceId_name_key" ON "PlaceCategory" ("workspaceId",lower("name"));--> statement-breakpoint
CREATE INDEX "PlaceLocation_workspaceId_createdAt_idx" ON "PlaceLocation" ("workspaceId","createdAt");--> statement-breakpoint
CREATE INDEX "PlaceLocation_categoryId_idx" ON "PlaceLocation" ("categoryId");--> statement-breakpoint
ALTER TABLE "PlaceCategory" ADD CONSTRAINT "PlaceCategory_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PlaceLocation" ADD CONSTRAINT "PlaceLocation_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PlaceLocation" ADD CONSTRAINT "PlaceLocation_categoryId_PlaceCategory_id_fkey" FOREIGN KEY ("categoryId") REFERENCES "PlaceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
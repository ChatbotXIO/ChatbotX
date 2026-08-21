CREATE TABLE "DynamicImage" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"workspaceId" bigint NOT NULL,
	"customFieldId" bigint,
	"data" jsonb NOT NULL,
	"backgroundUrl" text,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "DynamicImage_workspaceId_name_key" ON "DynamicImage" ("workspaceId","name");--> statement-breakpoint
ALTER TABLE "DynamicImage" ADD CONSTRAINT "DynamicImage_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "DynamicImage" ADD CONSTRAINT "DynamicImage_customFieldId_CustomField_id_fkey" FOREIGN KEY ("customFieldId") REFERENCES "CustomField"("id") ON DELETE SET NULL ON UPDATE CASCADE;
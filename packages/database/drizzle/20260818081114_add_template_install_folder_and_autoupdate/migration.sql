ALTER TABLE "Template" ADD COLUMN "createInstallFolder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Template" ADD COLUMN "defaultAutoUpdate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "installFolderId" bigint;--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "autoUpdate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD COLUMN "sourceUpdatedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "TemplateInstallation" ADD CONSTRAINT "TemplateInstallation_installFolderId_Folder_id_fkey" FOREIGN KEY ("installFolderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
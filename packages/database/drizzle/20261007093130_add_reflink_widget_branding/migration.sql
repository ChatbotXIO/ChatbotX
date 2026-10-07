ALTER TABLE "Reflink" ADD COLUMN "widgetLogoFileId" bigint;--> statement-breakpoint
ALTER TABLE "Reflink" ADD COLUMN "widgetBrandName" text;--> statement-breakpoint
ALTER TABLE "Reflink" ADD COLUMN "widgetBrandUrl" text;--> statement-breakpoint
ALTER TABLE "Reflink" ADD CONSTRAINT "Reflink_widgetLogoFileId_MediaLibraryFile_id_fkey" FOREIGN KEY ("widgetLogoFileId") REFERENCES "MediaLibraryFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

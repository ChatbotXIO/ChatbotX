CREATE TYPE "SystemFieldType" AS ENUM('me');--> statement-breakpoint
ALTER TABLE "SystemField" ADD COLUMN "type" "SystemFieldType";--> statement-breakpoint
UPDATE "SystemField" SET "type" = 'me' WHERE "type" IS NULL;--> statement-breakpoint
ALTER TABLE "SystemField" ALTER COLUMN "type" SET NOT NULL;
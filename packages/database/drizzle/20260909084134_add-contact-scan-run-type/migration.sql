CREATE TYPE "coexistRunType" AS ENUM('coexist', 'contact_scan');--> statement-breakpoint
ALTER TABLE "CoexistSyncRun" ADD COLUMN "type" "coexistRunType" DEFAULT 'coexist'::"coexistRunType" NOT NULL;--> statement-breakpoint
ALTER TABLE "CoexistSyncRun" ADD COLUMN "scanFromAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "CoexistSyncRun" ADD COLUMN "requestedByUserId" bigint;--> statement-breakpoint
ALTER TABLE "CoexistSyncRun" ADD COLUMN "resumeCursor" text;--> statement-breakpoint
DROP INDEX "CoexistSyncRun_integration_init_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "CoexistSyncRun_integration_init_uq" ON "CoexistSyncRun" ("integrationId","channel") WHERE status = 'init' AND type = 'coexist';--> statement-breakpoint
CREATE UNIQUE INDEX "CoexistSyncRun_contact_scan_active_uq" ON "CoexistSyncRun" ("integrationId") WHERE type = 'contact_scan' AND status IN ('init', 'running');--> statement-breakpoint
CREATE INDEX "CoexistSyncRun_contact_scan_due_idx" ON "CoexistSyncRun" ("type","status","createdAt") WHERE type = 'contact_scan';--> statement-breakpoint
ALTER TABLE "CoexistSyncRun" ADD CONSTRAINT "CoexistSyncRun_requestedByUserId_User_id_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
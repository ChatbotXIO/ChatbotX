ALTER TYPE "broadcastStatus" ADD VALUE 'sending';--> statement-breakpoint
ALTER TABLE "Broadcast" ADD COLUMN IF NOT EXISTS "contactCount" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Broadcast_status_idx" ON "Broadcast" ("status");--> statement-breakpoint

update "Broadcast" set "contactCount" = (select count(*) from "ContactOnBroadcast" where "ContactOnBroadcast"."broadcastId" = "Broadcast"."id") where "contactCount" is null;--> statement-breakpoint

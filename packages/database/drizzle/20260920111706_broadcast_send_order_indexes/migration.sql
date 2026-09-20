DROP INDEX CONCURRENTLY IF EXISTS "ContactInbox_inboxId_id_idx";--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactInbox_inboxId_id_idx" ON "ContactInbox" USING btree ("inboxId","id");--> statement-breakpoint
DROP INDEX CONCURRENTLY IF EXISTS "ContactOnBroadcast_unsent_order_idx";--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContactOnBroadcast_unsent_order_idx" ON "ContactOnBroadcast" USING btree ("broadcastId","contactInboxId") WHERE "sent" = false AND "failedAt" IS NULL;--> statement-breakpoint
DROP INDEX CONCURRENTLY IF EXISTS "ContactOnBroadcast_unsent_idx";

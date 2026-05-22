ALTER TABLE "Contact" ADD COLUMN "broadcastSubscribedAt" timestamp(6) with time zone;--> statement-breakpoint
CREATE INDEX "idx_contact_broadcast_subscribed_at" ON "Contact" ("broadcastSubscribedAt");
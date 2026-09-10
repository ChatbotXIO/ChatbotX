CREATE TABLE "BroadcastTarget" (
	"broadcastId" bigint,
	"inboxId" bigint,
	"flowId" bigint,
	"templateId" bigint,
	"templateData" jsonb,
	CONSTRAINT "BroadcastTarget_pkey" PRIMARY KEY("broadcastId","inboxId")
);
--> statement-breakpoint
ALTER TABLE "Broadcast" ADD COLUMN "targetMode" text DEFAULT 'channel' NOT NULL;--> statement-breakpoint
CREATE INDEX "BroadcastTarget_inboxId_idx" ON "BroadcastTarget" ("inboxId");--> statement-breakpoint
CREATE INDEX "BroadcastTarget_flowId_idx" ON "BroadcastTarget" ("flowId");--> statement-breakpoint
ALTER TABLE "BroadcastTarget" ADD CONSTRAINT "BroadcastTarget_broadcastId_Broadcast_id_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "BroadcastTarget" ADD CONSTRAINT "BroadcastTarget_inboxId_Inbox_id_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "BroadcastTarget" ADD CONSTRAINT "BroadcastTarget_flowId_Flow_id_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
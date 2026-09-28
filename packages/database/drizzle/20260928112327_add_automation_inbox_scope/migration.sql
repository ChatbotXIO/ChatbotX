ALTER TABLE "CommentAutomation" ADD COLUMN "inboxId" bigint;--> statement-breakpoint
ALTER TABLE "IgStoryAutomation" ADD COLUMN "inboxId" bigint;--> statement-breakpoint
CREATE INDEX "CommentAutomation_inboxId_idx" ON "CommentAutomation" ("inboxId");--> statement-breakpoint
CREATE INDEX "IgStoryAutomation_inboxId_idx" ON "IgStoryAutomation" ("inboxId");--> statement-breakpoint
ALTER TABLE "CommentAutomation" ADD CONSTRAINT "CommentAutomation_inboxId_Inbox_id_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IgStoryAutomation" ADD CONSTRAINT "IgStoryAutomation_inboxId_Inbox_id_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "AnalyticsEmailTopic" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"topicId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"contactId" bigint,
	"conversationId" bigint,
	"contactInboxId" bigint,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"deliveredAt" timestamp(6) with time zone,
	"failedAt" timestamp(6) with time zone,
	"firstSeenAt" timestamp(6) with time zone,
	"lastSeenAt" timestamp(6) with time zone,
	"seenCount" integer DEFAULT 0 NOT NULL,
	"firstClickedAt" timestamp(6) with time zone,
	"lastClickedAt" timestamp(6) with time zone,
	"clickCount" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "AnalyticsEmailTopic_token_key" ON "AnalyticsEmailTopic" ("token");--> statement-breakpoint
CREATE INDEX "AnalyticsEmailTopic_topicId_idx" ON "AnalyticsEmailTopic" ("topicId");--> statement-breakpoint
CREATE INDEX "AnalyticsEmailTopic_workspaceId_topicId_idx" ON "AnalyticsEmailTopic" ("workspaceId","topicId");--> statement-breakpoint
ALTER TABLE "AnalyticsEmailTopic" ADD CONSTRAINT "AnalyticsEmailTopic_topicId_EmailTopic_id_fkey" FOREIGN KEY ("topicId") REFERENCES "EmailTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AnalyticsEmailTopic" ADD CONSTRAINT "AnalyticsEmailTopic_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AnalyticsEmailTopic" ADD CONSTRAINT "AnalyticsEmailTopic_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AnalyticsEmailTopic" ADD CONSTRAINT "AnalyticsEmailTopic_conversationId_Conversation_id_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AnalyticsEmailTopic" ADD CONSTRAINT "AnalyticsEmailTopic_contactInboxId_ContactInbox_id_fkey" FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnalyticsBotMessageEvent" ADD COLUMN "inboxId" bigint;--> statement-breakpoint
ALTER TABLE "AnalyticsContactEvent" ADD COLUMN "inboxId" bigint;--> statement-breakpoint
ALTER TABLE "AnalyticsContactEvent" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "AnalyticsConversationEvent" ADD COLUMN "inboxId" bigint;--> statement-breakpoint
ALTER TABLE "AnalyticsMessageEvent" ADD COLUMN "inboxId" bigint;
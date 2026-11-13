ALTER TABLE "IntegrationSmtp" ADD COLUMN "imapEnabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationSmtp" ADD COLUMN "imapHost" text;--> statement-breakpoint
ALTER TABLE "IntegrationSmtp" ADD COLUMN "imapPort" integer;--> statement-breakpoint
ALTER TABLE "IntegrationSmtp" ADD COLUMN "imapMailbox" text;--> statement-breakpoint
ALTER TABLE "IntegrationSmtp" ADD COLUMN "imapUidValidity" bigint;--> statement-breakpoint
ALTER TABLE "IntegrationSmtp" ADD COLUMN "imapLastUid" bigint;--> statement-breakpoint
ALTER TABLE "IntegrationSmtp" ADD COLUMN "lastPolledAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "IntegrationSmtp" ADD COLUMN "lastPollError" text;--> statement-breakpoint
ALTER TABLE "IntegrationSmtp" ADD COLUMN "imapNextPollAt" timestamp(6) with time zone;--> statement-breakpoint
CREATE INDEX "IntegrationSmtp_imapEnabled_lastPolledAt_idx" ON "IntegrationSmtp" ("lastPolledAt" NULLS FIRST) WHERE "imapEnabled";
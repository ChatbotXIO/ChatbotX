CREATE TYPE "threadControlEvent" AS ENUM('inboundReceived', 'standbyReceived', 'controlPassed', 'controlTaken', 'taken', 'released', 'passed', 'serviceSent', 'serviceRejected');--> statement-breakpoint
CREATE TYPE "threadControlState" AS ENUM('owned', 'standby', 'idle');--> statement-breakpoint
ALTER TABLE "ContactInbox" ADD COLUMN "threadControlState" "threadControlState";--> statement-breakpoint
ALTER TABLE "ContactInbox" ADD COLUMN "threadOwnerRole" text;--> statement-breakpoint
ALTER TABLE "ContactInbox" ADD COLUMN "threadControlUpdatedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "ContactInbox" ADD COLUMN "threadControlLastEvent" "threadControlEvent";--> statement-breakpoint
ALTER TABLE "Inbox" ADD COLUMN "threadControlSeenAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN "handoverResumeFlowId" bigint;--> statement-breakpoint
CREATE INDEX "IntegrationWhatsapp_handoverResumeFlowId_idx" ON "IntegrationWhatsapp" ("handoverResumeFlowId");--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD CONSTRAINT "IntegrationWhatsapp_handoverResumeFlowId_Flow_id_fkey" FOREIGN KEY ("handoverResumeFlowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
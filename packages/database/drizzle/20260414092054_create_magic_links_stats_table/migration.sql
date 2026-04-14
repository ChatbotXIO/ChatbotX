CREATE TABLE "MagicLinkContactStat" (
	"workspaceId" bigint NOT NULL,
	"linkId" bigint NOT NULL,
	"contactId" bigint,
	"contactInboxId" bigint NOT NULL,
	"occurredAt" timestamp(6) with time zone NOT NULL,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "MagicLinkContactStat_workspaceId_linkId_contactInboxId_idx" UNIQUE("workspaceId","linkId","contactInboxId")
);
--> statement-breakpoint
CREATE TABLE "MagicLinkStat" (
	"workspaceId" bigint NOT NULL,
	"linkId" bigint NOT NULL,
	"contactId" bigint NOT NULL,
	"contactInboxId" bigint NOT NULL,
	"occurredAt" timestamp(6) with time zone NOT NULL,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "MagicLinkStat_workspaceId_linkId_contactInboxId_occurredAt_idx" UNIQUE("workspaceId","linkId","contactInboxId","occurredAt")
);
--> statement-breakpoint
ALTER TABLE "MagicLinkContactStat" ADD CONSTRAINT "MagicLinkContactStat_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MagicLinkContactStat" ADD CONSTRAINT "MagicLinkContactStat_linkId_MagicLink_id_fkey" FOREIGN KEY ("linkId") REFERENCES "MagicLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MagicLinkStat" ADD CONSTRAINT "MagicLinkStat_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MagicLinkStat" ADD CONSTRAINT "MagicLinkStat_linkId_MagicLink_id_fkey" FOREIGN KEY ("linkId") REFERENCES "MagicLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
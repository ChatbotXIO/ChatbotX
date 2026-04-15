CREATE TABLE "RefLinkStat" (
	"workspaceId" bigint NOT NULL,
	"linkId" bigint NOT NULL,
	"contactId" bigint NOT NULL,
	"contactInboxId" bigint NOT NULL,
	"occurredAt" timestamp(6) with time zone NOT NULL,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "RefLinkStat_workspaceId_linkId_occurredAt_idx" ON "RefLinkStat" ("workspaceId","linkId","occurredAt");--> statement-breakpoint
ALTER TABLE "RefLinkStat" ADD CONSTRAINT "RefLinkStat_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "RefLinkStat" ADD CONSTRAINT "RefLinkStat_linkId_Reflink_id_fkey" FOREIGN KEY ("linkId") REFERENCES "Reflink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
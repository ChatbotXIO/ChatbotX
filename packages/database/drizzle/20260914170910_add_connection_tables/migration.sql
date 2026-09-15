CREATE TABLE "ConnectSession" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"provider" text NOT NULL,
	"purpose" text NOT NULL,
	"targetConnectionId" bigint,
	"actorUserId" bigint,
	"actorTokenId" bigint,
	"platformOwnerId" text,
	"originHost" text,
	"returnUrl" text,
	"stateNonceHash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"step" text DEFAULT 'authorize' NOT NULL,
	"nextAction" jsonb,
	"encryptedAuth" jsonb,
	"targets" jsonb NOT NULL,
	"claimedTargetIds" text[] NOT NULL,
	"resultConnectionIds" text[] NOT NULL,
	"results" jsonb NOT NULL,
	"errorCode" text,
	"expiresAt" timestamp(6) with time zone NOT NULL,
	"consumedAt" timestamp(6) with time zone,
	CONSTRAINT "ConnectSession_actor_exactly_one" CHECK ((("actorUserId" IS NOT NULL)::int + ("actorTokenId" IS NOT NULL)::int) = 1)
);
--> statement-breakpoint
CREATE TABLE "Connection" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"provider" text NOT NULL,
	"kind" text NOT NULL,
	"channel" text,
	"inboxId" bigint,
	"integrationId" bigint,
	"sourceId" text NOT NULL,
	"displayName" text NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"statusReason" text,
	"lastError" text,
	"authExpiresAt" timestamp(6) with time zone,
	"createdBy" bigint,
	"connectedAt" timestamp(6) with time zone,
	"disconnectedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE INDEX "ConnectSession_workspaceId_idx" ON "ConnectSession" ("workspaceId");--> statement-breakpoint
CREATE INDEX "ConnectSession_expiresAt_idx" ON "ConnectSession" ("expiresAt");--> statement-breakpoint
CREATE UNIQUE INDEX "ConnectSession_stateNonceHash_key" ON "ConnectSession" ("stateNonceHash");--> statement-breakpoint
CREATE INDEX "Connection_workspaceId_idx" ON "Connection" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "Connection_workspaceId_provider_sourceId_key" ON "Connection" ("workspaceId","provider","sourceId");--> statement-breakpoint
CREATE UNIQUE INDEX "Connection_inboxId_key" ON "Connection" ("inboxId");--> statement-breakpoint
CREATE UNIQUE INDEX "Connection_integrationId_key" ON "Connection" ("integrationId");--> statement-breakpoint
CREATE INDEX "Connection_status_authExpiresAt_idx" ON "Connection" ("status","authExpiresAt");--> statement-breakpoint
ALTER TABLE "ConnectSession" ADD CONSTRAINT "ConnectSession_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ConnectSession" ADD CONSTRAINT "ConnectSession_targetConnectionId_Connection_id_fkey" FOREIGN KEY ("targetConnectionId") REFERENCES "Connection"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ConnectSession" ADD CONSTRAINT "ConnectSession_actorUserId_User_id_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ConnectSession" ADD CONSTRAINT "ConnectSession_actorTokenId_WorkspaceApiToken_id_fkey" FOREIGN KEY ("actorTokenId") REFERENCES "WorkspaceApiToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_inboxId_Inbox_id_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_integrationId_Integration_id_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_createdBy_User_id_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
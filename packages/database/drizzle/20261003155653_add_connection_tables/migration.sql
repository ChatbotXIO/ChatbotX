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
	"targets" jsonb DEFAULT '[]' NOT NULL,
	"claimedTargetIds" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"resultConnectionIds" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"results" jsonb DEFAULT '[]' NOT NULL,
	"errorCode" text,
	"expiresAt" timestamp(6) with time zone NOT NULL,
	"consumedAt" timestamp(6) with time zone,
	CONSTRAINT "ConnectSession_actor_at_most_one" CHECK ((("actorUserId" IS NOT NULL)::int + ("actorTokenId" IS NOT NULL)::int) <= 1),
	CONSTRAINT "ConnectSession_status_check" CHECK ("status" IN ('pending', 'authorized', 'awaiting_selection', 'completed', 'failed', 'expired', 'cancelled')),
	CONSTRAINT "ConnectSession_purpose_check" CHECK ("purpose" IN ('connect', 'reconnect', 'facebook_ads', 'messaging_ads', 'lead_ads', 'meta_catalog')),
	CONSTRAINT "ConnectSession_errorCode_check" CHECK ("errorCode" IN ('state_mismatch', 'expired', 'provider_denied', 'exchange_failed', 'provider_error', 'no_candidates', 'already_connected', 'quota_exceeded', 'trial_expired', 'internal_error')),
	CONSTRAINT "ConnectSession_errorCode_terminal_failure_check" CHECK ("errorCode" IS NULL OR "status" IN ('failed', 'expired', 'cancelled')),
	CONSTRAINT "ConnectSession_terminal_consumedAt_check" CHECK (("status" IN ('completed', 'failed', 'expired', 'cancelled')) = ("consumedAt" IS NOT NULL)),
	CONSTRAINT "ConnectSession_terminal_clears_encryptedAuth_check" CHECK ("status" NOT IN ('completed', 'failed', 'expired', 'cancelled') OR "encryptedAuth" IS NULL),
	CONSTRAINT "ConnectSession_active_reconnect_requires_target_check" CHECK ("purpose" <> 'reconnect' OR "status" IN ('completed', 'failed', 'expired', 'cancelled') OR "targetConnectionId" IS NOT NULL)
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
	"disconnectedAt" timestamp(6) with time zone,
	CONSTRAINT "Connection_kind_relation_check" CHECK ((
        ("kind" = 'channel' AND "inboxId" IS NOT NULL AND "channel" IS NOT NULL)
        OR
        ("kind" = 'integration' AND "inboxId" IS NULL AND "channel" IS NULL AND "integrationId" IS NOT NULL)
      )),
	CONSTRAINT "Connection_inbox_integration_exclusive_check" CHECK (NOT ("inboxId" IS NOT NULL AND "integrationId" IS NOT NULL)),
	CONSTRAINT "Connection_kind_check" CHECK ("kind" IN ('channel', 'integration')),
	CONSTRAINT "Connection_status_check" CHECK ("status" IN ('connected', 'degraded', 'needs_reauth', 'paused', 'disconnected')),
	CONSTRAINT "Connection_statusReason_check" CHECK ("statusReason" IN ('manual', 'workspace_purge', 'trial_expired', 'tenant_suspended', 'token_revoked', 'provider_revoked', 'refresh_failed', 'verify_failed', 'quota_exceeded', 'orphaned_webhook')),
	CONSTRAINT "Connection_status_reason_check" CHECK (("status" = 'connected') = ("statusReason" IS NULL)),
	CONSTRAINT "Connection_disconnectedAt_check" CHECK (("status" = 'disconnected') = ("disconnectedAt" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX "ConnectSession_workspaceId_idx" ON "ConnectSession" ("workspaceId");--> statement-breakpoint
CREATE INDEX "ConnectSession_expiresAt_idx" ON "ConnectSession" ("expiresAt");--> statement-breakpoint
CREATE INDEX "ConnectSession_consumedAt_idx" ON "ConnectSession" ("consumedAt") WHERE "consumedAt" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ConnectSession_stateNonceHash_key" ON "ConnectSession" ("stateNonceHash");--> statement-breakpoint
CREATE UNIQUE INDEX "Connection_workspaceId_provider_sourceId_key" ON "Connection" ("workspaceId","provider","sourceId");--> statement-breakpoint
CREATE INDEX "Connection_provider_sourceId_idx" ON "Connection" ("provider","sourceId");--> statement-breakpoint
CREATE UNIQUE INDEX "Connection_inboxId_key" ON "Connection" ("inboxId");--> statement-breakpoint
CREATE UNIQUE INDEX "Connection_integrationId_key" ON "Connection" ("integrationId");--> statement-breakpoint
ALTER TABLE "ConnectSession" ADD CONSTRAINT "ConnectSession_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ConnectSession" ADD CONSTRAINT "ConnectSession_targetConnectionId_Connection_id_fkey" FOREIGN KEY ("targetConnectionId") REFERENCES "Connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ConnectSession" ADD CONSTRAINT "ConnectSession_actorUserId_User_id_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ConnectSession" ADD CONSTRAINT "ConnectSession_actorTokenId_WorkspaceApiToken_id_fkey" FOREIGN KEY ("actorTokenId") REFERENCES "WorkspaceApiToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_inboxId_Inbox_id_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_integrationId_Integration_id_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_createdBy_User_id_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
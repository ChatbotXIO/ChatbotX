ALTER TABLE "ConnectSession" ADD CONSTRAINT "ConnectSession_status_check" CHECK ("status" IN ('pending', 'authorized', 'awaiting_selection', 'completed', 'failed', 'expired', 'cancelled'));--> statement-breakpoint
ALTER TABLE "ConnectSession" ADD CONSTRAINT "ConnectSession_purpose_check" CHECK ("purpose" IN ('connect', 'reconnect', 'facebook_ads', 'messaging_ads', 'lead_ads', 'meta_catalog'));--> statement-breakpoint
ALTER TABLE "ConnectSession" ADD CONSTRAINT "ConnectSession_errorCode_check" CHECK ("errorCode" IN ('state_mismatch', 'expired', 'provider_denied', 'exchange_failed', 'provider_error', 'no_candidates', 'already_connected', 'quota_exceeded', 'trial_expired', 'internal_error'));--> statement-breakpoint
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_kind_relation_check" CHECK ((
        ("kind" = 'channel' AND "inboxId" IS NOT NULL AND "channel" IS NOT NULL)
        OR
        ("kind" = 'integration' AND "inboxId" IS NULL AND "channel" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_inbox_integration_exclusive_check" CHECK (NOT ("inboxId" IS NOT NULL AND "integrationId" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_kind_check" CHECK ("kind" IN ('channel', 'integration', 'sub_connection'));--> statement-breakpoint
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_status_check" CHECK ("status" IN ('connected', 'degraded', 'needs_reauth', 'paused', 'disconnected'));--> statement-breakpoint
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_statusReason_check" CHECK ("statusReason" IN ('manual', 'workspace_purge', 'trial_expired', 'tenant_suspended', 'token_revoked', 'provider_revoked', 'refresh_failed', 'verify_failed', 'quota_exceeded', 'orphaned_webhook'));
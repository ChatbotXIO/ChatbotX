-- Squashed CTWA migration (replaces 20260810154943_ctwa_whatsapp_capi_scope_cache,
-- 20260810163901_ads_conversion_rule, 20260810170224_ads_conversion_event,
-- 20260811083919_ctwa_conversion_indexes). Every statement is guarded so a
-- database that already ran the pre-squash migrations re-applies this as a no-op.
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN IF NOT EXISTS "hasCapiScope" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN IF NOT EXISTS "capiScopeCheckedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN IF NOT EXISTS "datasetId" text;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'adsConversionChannel' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE "adsConversionChannel" AS ENUM('whatsapp', 'facebook');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'adsConversionEventType' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE "adsConversionEventType" AS ENUM('lead', 'purchase');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'adsConversionCapiStatus' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE "adsConversionCapiStatus" AS ENUM('pending', 'sent', 'failed', 'skipped_no_scope', 'skipped_region');
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'adsConversionEventSource' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE "adsConversionEventSource" AS ENUM('automatic', 'rule');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "AdsConversionRule" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"channel" "adsConversionChannel" NOT NULL,
	"integrationWhatsappId" bigint,
	"integrationFacebookAdsId" bigint,
	"adAccountId" text,
	"eventType" "adsConversionEventType" NOT NULL,
	"trigger" jsonb NOT NULL,
	"markAs" text,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AdsConversionRule_workspaceId_channel_enabled_idx" ON "AdsConversionRule" ("workspaceId","channel","enabled");--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AdsConversionRule_workspaceId_Workspace_id_fkey'
      AND conrelid = '"AdsConversionRule"'::regclass
  ) THEN
    ALTER TABLE "AdsConversionRule" ADD CONSTRAINT "AdsConversionRule_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AdsConversionRule_k99JXbMObQIn_fkey'
      AND conrelid = '"AdsConversionRule"'::regclass
  ) THEN
    ALTER TABLE "AdsConversionRule" ADD CONSTRAINT "AdsConversionRule_k99JXbMObQIn_fkey" FOREIGN KEY ("integrationWhatsappId") REFERENCES "IntegrationWhatsapp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AdsConversionRule_fBmu8W26Mw5R_fkey'
      AND conrelid = '"AdsConversionRule"'::regclass
  ) THEN
    ALTER TABLE "AdsConversionRule" ADD CONSTRAINT "AdsConversionRule_fBmu8W26Mw5R_fkey" FOREIGN KEY ("integrationFacebookAdsId") REFERENCES "IntegrationFacebookAds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "AdsConversionEvent" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"integrationWhatsappId" bigint NOT NULL,
	"wabaId" text NOT NULL,
	"source" "adsConversionEventSource" NOT NULL,
	"eventType" "adsConversionEventType" NOT NULL,
	"ctwaClid" text NOT NULL,
	"adId" text,
	"contactInboxId" bigint,
	"currency" text,
	"value" numeric,
	"occurredAt" timestamp(6) with time zone NOT NULL,
	"sourceEventId" text NOT NULL,
	"capiStatus" "adsConversionCapiStatus" DEFAULT 'pending'::"adsConversionCapiStatus" NOT NULL,
	"capiSentAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "AdsConversionEvent_workspace_integration_source_sourceEventId_key" ON "AdsConversionEvent" ("workspaceId","integrationWhatsappId","source","sourceEventId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AdsConversionEvent_workspaceId_eventType_occurredAt_idx" ON "AdsConversionEvent" ("workspaceId","eventType","occurredAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AdsConversionEvent_workspaceId_adId_occurredAt_idx" ON "AdsConversionEvent" ("workspaceId","adId","occurredAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AdsConversionEvent_contactInboxId_idx" ON "AdsConversionEvent" ("contactInboxId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AdsConversionEvent_workspaceId_occurredAt_idx" ON "AdsConversionEvent" ("workspaceId","occurredAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ContactInbox_referral_ctwaClid_idx" ON "ContactInbox" (("referral"->>'ctwaClid')) WHERE "referral"->>'ctwaClid' IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IntegrationWhatsapp_workspaceId_idx" ON "IntegrationWhatsapp" ("workspaceId");--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AdsConversionEvent_workspaceId_Workspace_id_fkey'
      AND conrelid = '"AdsConversionEvent"'::regclass
  ) THEN
    ALTER TABLE "AdsConversionEvent" ADD CONSTRAINT "AdsConversionEvent_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AdsConversionEvent_IENNsXLBb1k1_fkey'
      AND conrelid = '"AdsConversionEvent"'::regclass
  ) THEN
    ALTER TABLE "AdsConversionEvent" ADD CONSTRAINT "AdsConversionEvent_IENNsXLBb1k1_fkey" FOREIGN KEY ("integrationWhatsappId") REFERENCES "IntegrationWhatsapp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AdsConversionEvent_contactInboxId_ContactInbox_id_fkey'
      AND conrelid = '"AdsConversionEvent"'::regclass
  ) THEN
    ALTER TABLE "AdsConversionEvent" ADD CONSTRAINT "AdsConversionEvent_contactInboxId_ContactInbox_id_fkey" FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

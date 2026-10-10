-- The feature shipped as three development migrations that were merged into this one.
-- A database that already ran them has these objects, so drop before creating; a clean
-- database has nothing to drop. Data in them is development data and is not kept.
DROP TABLE IF EXISTS "GoogleAdsConversionEvent" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "GoogleAdsSettings" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "IntegrationGoogleAds" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "googleAdsClickIdType" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "googleAdsEventSource" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "googleAdsEventStatus" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "googleAdsFailureStage" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "googleAdsProcessingStatus" CASCADE;--> statement-breakpoint
CREATE TYPE "googleAdsClickIdType" AS ENUM('gclid', 'gbraid');--> statement-breakpoint
CREATE TYPE "googleAdsEventSource" AS ENUM('flowStep', 'triggerAction');--> statement-breakpoint
CREATE TYPE "googleAdsEventStatus" AS ENUM('pending', 'sending', 'sent', 'processed', 'failed', 'skipped_no_account', 'skipped_expired');--> statement-breakpoint
CREATE TYPE "googleAdsFailureStage" AS ENUM('delivery', 'processing', 'timeout');--> statement-breakpoint
CREATE TYPE "googleAdsProcessingStatus" AS ENUM('processing', 'success', 'partial_success', 'failed', 'unknown', 'timed_out');--> statement-breakpoint
CREATE TABLE "GoogleAdsConversionEvent" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"integrationGoogleAdsId" bigint,
	"contactInboxId" bigint,
	"customerId" text NOT NULL,
	"loginCustomerId" text,
	"conversionCustomerId" text NOT NULL,
	"conversionActionId" text NOT NULL,
	"conversionActionName" text,
	"conversionActionCategory" text NOT NULL,
	"lookbackWindowDays" integer,
	"channel" text NOT NULL,
	"source" "googleAdsEventSource" NOT NULL,
	"scopeId" text NOT NULL,
	"clickIdType" "googleAdsClickIdType" NOT NULL,
	"clickId" text NOT NULL,
	"googleClickReceivedAt" timestamp(6) with time zone NOT NULL,
	"occurredAt" timestamp(6) with time zone NOT NULL,
	"value" numeric,
	"currency" text,
	"transactionId" text NOT NULL,
	"options" jsonb,
	"uploadMethod" text NOT NULL,
	"status" "googleAdsEventStatus" NOT NULL,
	"attempt" integer NOT NULL,
	"claimToken" text,
	"claimedAt" timestamp(6) with time zone,
	"requestId" text,
	"sentAt" timestamp(6) with time zone,
	"error" text,
	"failureStage" "googleAdsFailureStage",
	"processingStatus" "googleAdsProcessingStatus",
	"processingCheckedAt" timestamp(6) with time zone,
	"processingAttempts" integer NOT NULL,
	"nextProcessingCheckAt" timestamp(6) with time zone,
	"processingDetail" jsonb,
	CONSTRAINT "GoogleAdsConversionEvent_sent_requires_request_check" CHECK ("status" NOT IN ('sent', 'processed') OR ("requestId" IS NOT NULL AND "sentAt" IS NOT NULL)),
	CONSTRAINT "GoogleAdsConversionEvent_sending_requires_claim_check" CHECK ("status" <> 'sending' OR ("claimToken" IS NOT NULL AND "claimedAt" IS NOT NULL)),
	CONSTRAINT "GoogleAdsConversionEvent_processing_status_check" CHECK ("processingStatus" IS NULL OR "status" IN ('sent', 'processed', 'failed')),
	CONSTRAINT "GoogleAdsConversionEvent_failure_stage_check" CHECK ("failureStage" IS NULL OR "status" = 'failed'),
	CONSTRAINT "GoogleAdsConversionEvent_value_currency_check" CHECK (("value" IS NULL) = ("currency" IS NULL)),
	CONSTRAINT "GoogleAdsConversionEvent_value_non_negative_check" CHECK ("value" IS NULL OR "value" >= 0),
	CONSTRAINT "GoogleAdsConversionEvent_clickId_length_check" CHECK (length("clickId") BETWEEN 10 AND 512),
	CONSTRAINT "GoogleAdsConversionEvent_uploadMethod_check" CHECK ("uploadMethod" IN ('dataManager', 'legacy')),
	CONSTRAINT "GoogleAdsConversionEvent_attempt_check" CHECK ("attempt" >= 0 AND "processingAttempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "GoogleAdsSettings" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"settings" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "IntegrationGoogleAds" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"integrationId" bigint NOT NULL,
	"auth" jsonb NOT NULL,
	"customerId" text NOT NULL,
	"loginCustomerId" text,
	"descriptiveName" text,
	"currencyCode" text,
	"conversionCustomerId" text,
	"acceptedCustomerDataTerms" boolean,
	"conversionActions" jsonb,
	"conversionActionsSyncedAt" timestamp(6) with time zone,
	"setupError" text,
	"setupErrorAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "GoogleAdsConversionEvent_workspaceId_transactionId_key" ON "GoogleAdsConversionEvent" ("workspaceId","transactionId");--> statement-breakpoint
CREATE INDEX "GoogleAdsConversionEvent_workspaceId_occurredAt_idx" ON "GoogleAdsConversionEvent" ("workspaceId","occurredAt");--> statement-breakpoint
CREATE INDEX "GoogleAdsConversionEvent_workspaceId_status_idx" ON "GoogleAdsConversionEvent" ("workspaceId","status");--> statement-breakpoint
CREATE INDEX "GoogleAdsConversionEvent_contactInboxId_idx" ON "GoogleAdsConversionEvent" ("contactInboxId");--> statement-breakpoint
CREATE INDEX "GoogleAdsConversionEvent_status_nextProcessingCheckAt_idx" ON "GoogleAdsConversionEvent" ("status","nextProcessingCheckAt");--> statement-breakpoint
CREATE INDEX "GoogleAdsConversionEvent_status_claimedAt_idx" ON "GoogleAdsConversionEvent" ("status","claimedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "GoogleAdsSettings_workspaceId_key" ON "GoogleAdsSettings" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationGoogleAds_integrationId_key" ON "IntegrationGoogleAds" ("integrationId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationGoogleAds_workspaceId_key" ON "IntegrationGoogleAds" ("workspaceId");--> statement-breakpoint
ALTER TABLE "GoogleAdsConversionEvent" ADD CONSTRAINT "GoogleAdsConversionEvent_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "GoogleAdsConversionEvent" ADD CONSTRAINT "GoogleAdsConversionEvent_Ju5oh0fVmaLy_fkey" FOREIGN KEY ("integrationGoogleAdsId") REFERENCES "IntegrationGoogleAds"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "GoogleAdsConversionEvent" ADD CONSTRAINT "GoogleAdsConversionEvent_contactInboxId_ContactInbox_id_fkey" FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "GoogleAdsSettings" ADD CONSTRAINT "GoogleAdsSettings_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationGoogleAds" ADD CONSTRAINT "IntegrationGoogleAds_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationGoogleAds" ADD CONSTRAINT "IntegrationGoogleAds_integrationId_Integration_id_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
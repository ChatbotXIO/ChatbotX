SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TYPE "contactActivityReferenceType" ADD VALUE 'ad';
--> statement-breakpoint
ALTER TYPE "contactActivityType" ADD VALUE 'adClicked';
--> statement-breakpoint
CREATE TABLE "ContactReferralEvent" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"contactId" bigint NOT NULL,
	"contactInboxId" bigint NOT NULL,
	"channel" text NOT NULL,
	"type" text NOT NULL,
	"provider" text,
	"occurredAt" timestamp(6) with time zone NOT NULL,
	"adId" text,
	"campaignId" text,
	"adGroupId" text,
	"clickIdType" text,
	"clickId" text,
	"ref" text,
	"source" text,
	"sourceUrl" text,
	"metadata" jsonb,
	"dedupKey" text NOT NULL,
	CONSTRAINT "ContactReferralEvent_type_check" CHECK ("type" IN ('ad', 'refLink', 'shortLink', 'qr')),
	CONSTRAINT "ContactReferralEvent_provider_check" CHECK ("provider" IS NULL OR "provider" IN ('meta', 'google')),
	CONSTRAINT "ContactReferralEvent_clickIdType_check" CHECK ("clickIdType" IS NULL OR "clickIdType" IN ('ctwa', 'gclid', 'gbraid')),
	CONSTRAINT "ContactReferralEvent_clickId_check" CHECK (("clickId" IS NULL) = ("clickIdType" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "AdsConversionEvent" ADD COLUMN "referralEventId" bigint;
--> statement-breakpoint
ALTER TABLE "GoogleAdsConversionEvent" ADD COLUMN "referralEventId" bigint;
--> statement-breakpoint
CREATE UNIQUE INDEX "ContactReferralEvent_workspaceId_contactInboxId_dedupKey_key" ON "ContactReferralEvent" ("workspaceId","contactInboxId","dedupKey");
--> statement-breakpoint
CREATE INDEX "ContactReferralEvent_contactInboxId_idx" ON "ContactReferralEvent" ("contactInboxId");
--> statement-breakpoint
CREATE INDEX "ContactReferralEvent_workspaceId_contactId_occurredAt_idx" ON "ContactReferralEvent" ("workspaceId","contactId","occurredAt");
--> statement-breakpoint
CREATE INDEX "ContactReferralEvent_workspaceId_type_occurredAt_idx" ON "ContactReferralEvent" ("workspaceId","type","occurredAt") WHERE "adId" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "AdsConversionEvent" ADD CONSTRAINT "AdsConversionEvent_referralEventId_ContactReferralEvent_id_fkey" FOREIGN KEY ("referralEventId") REFERENCES "ContactReferralEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE "ContactReferralEvent" ADD CONSTRAINT "ContactReferralEvent_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "ContactReferralEvent" ADD CONSTRAINT "ContactReferralEvent_contactInboxId_ContactInbox_id_fkey" FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "GoogleAdsConversionEvent" ADD CONSTRAINT "GoogleAdsConversionEvent_0EWR38dBZsuA_fkey" FOREIGN KEY ("referralEventId") REFERENCES "ContactReferralEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

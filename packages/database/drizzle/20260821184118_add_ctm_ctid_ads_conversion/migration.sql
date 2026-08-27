ALTER TABLE "AdsConversionEvent" ADD COLUMN "channel" "adsConversionChannel" DEFAULT 'whatsapp'::"adsConversionChannel" NOT NULL;--> statement-breakpoint
ALTER TABLE "AdsConversionEvent" ADD COLUMN "integrationMessengerId" bigint;--> statement-breakpoint
ALTER TABLE "AdsConversionEvent" ADD COLUMN "integrationInstagramId" bigint;--> statement-breakpoint
ALTER TABLE "AdsConversionRule" ADD COLUMN "integrationMessengerId" bigint;--> statement-breakpoint
ALTER TABLE "AdsConversionRule" ADD COLUMN "integrationInstagramId" bigint;--> statement-breakpoint
ALTER TABLE "AdsConversionEvent" ALTER COLUMN "integrationWhatsappId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "AdsConversionEvent" ALTER COLUMN "wabaId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "AdsConversionEvent" ALTER COLUMN "ctwaClid" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "AdsConversionEvent_ws_whatsapp_source_sourceEventId_key" ON "AdsConversionEvent" ("workspaceId","integrationWhatsappId","source","sourceEventId") WHERE "channel" = 'whatsapp';--> statement-breakpoint
CREATE UNIQUE INDEX "AdsConversionEvent_ws_messenger_source_sourceEventId_key" ON "AdsConversionEvent" ("workspaceId","integrationMessengerId","source","sourceEventId") WHERE "channel" = 'messenger';--> statement-breakpoint
CREATE UNIQUE INDEX "AdsConversionEvent_ws_instagram_source_sourceEventId_key" ON "AdsConversionEvent" ("workspaceId","integrationInstagramId","source","sourceEventId") WHERE "channel" = 'instagram';--> statement-breakpoint
CREATE INDEX "ContactInbox_referral_adId_idx" ON "ContactInbox" (("referral"->>'adId')) WHERE "referral"->>'adId' IS NOT NULL AND "referral"->>'source' = 'ADS';--> statement-breakpoint
ALTER TABLE "AdsConversionEvent" ADD CONSTRAINT "AdsConversionEvent_yeTDEtvJMs4H_fkey" FOREIGN KEY ("integrationMessengerId") REFERENCES "IntegrationMessenger"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AdsConversionEvent" ADD CONSTRAINT "AdsConversionEvent_1X1qUqZpm24x_fkey" FOREIGN KEY ("integrationInstagramId") REFERENCES "IntegrationInstagram"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AdsConversionRule" ADD CONSTRAINT "AdsConversionRule_3zzAptVRRuZD_fkey" FOREIGN KEY ("integrationMessengerId") REFERENCES "IntegrationMessenger"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AdsConversionRule" ADD CONSTRAINT "AdsConversionRule_HUibBtSUZbML_fkey" FOREIGN KEY ("integrationInstagramId") REFERENCES "IntegrationInstagram"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AdsConversionEvent" ADD CONSTRAINT "AdsConversionEvent_channel_integration_check" CHECK (("channel" = 'whatsapp' AND "integrationWhatsappId" IS NOT NULL AND "ctwaClid" IS NOT NULL AND "wabaId" IS NOT NULL) OR ("channel" = 'messenger' AND "integrationMessengerId" IS NOT NULL) OR ("channel" = 'instagram' AND "integrationInstagramId" IS NOT NULL));
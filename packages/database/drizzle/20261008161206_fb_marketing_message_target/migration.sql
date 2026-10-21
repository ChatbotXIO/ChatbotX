ALTER TABLE "FacebookMarketingMessage" ADD COLUMN "targetType" text DEFAULT 'optIn' NOT NULL;--> statement-breakpoint
ALTER TABLE "FacebookMarketingMessage" ADD COLUMN "audienceId" bigint;--> statement-breakpoint
CREATE INDEX "FacebookMarketingMessage_audienceId_idx" ON "FacebookMarketingMessage" ("audienceId");--> statement-breakpoint
ALTER TABLE "FacebookMarketingMessage" ADD CONSTRAINT "FacebookMarketingMessage_3m4P7t9wgiEX_fkey" FOREIGN KEY ("audienceId") REFERENCES "FacebookMarketingMessageAudience"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
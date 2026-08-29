ALTER TABLE "AdsConversionEvent" ADD COLUMN "orderId" text;--> statement-breakpoint
ALTER TABLE "AdsConversionEvent" ADD COLUMN "contents" jsonb;--> statement-breakpoint
ALTER TABLE "Workspace" ADD COLUMN "capiLimitedDataUse" boolean DEFAULT false NOT NULL;

SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "ContactInbox" ADD COLUMN "lastStoryId" text;--> statement-breakpoint
ALTER TABLE "FacebookLeadAdsLead" ADD COLUMN "formId" text;--> statement-breakpoint
ALTER TABLE "FacebookLeadAdsLead" ADD COLUMN "formName" text;--> statement-breakpoint
ALTER TABLE "FacebookLeadAdsLead" ADD COLUMN "adgroupId" text;

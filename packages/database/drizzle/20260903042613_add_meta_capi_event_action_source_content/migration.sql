ALTER TABLE "MetaCapiEvent" ADD COLUMN "actionSource" text DEFAULT 'business_messaging' NOT NULL;--> statement-breakpoint
ALTER TABLE "MetaCapiEvent" ADD COLUMN "contentType" text;--> statement-breakpoint
ALTER TABLE "MetaCapiEvent" ADD COLUMN "contentIds" jsonb;--> statement-breakpoint
ALTER TABLE "MetaCapiEvent" ADD CONSTRAINT "MetaCapiEvent_actionSource_check" CHECK ("actionSource" IN ('business_messaging', 'email', 'phone_call', 'chat', 'physical_store', 'system_generated', 'other'));--> statement-breakpoint
ALTER TABLE "MetaCapiEvent" ADD CONSTRAINT "MetaCapiEvent_contentType_check" CHECK ("contentType" IN ('product', 'product_group'));
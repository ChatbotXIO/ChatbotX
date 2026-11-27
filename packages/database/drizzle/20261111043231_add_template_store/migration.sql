CREATE TABLE "TemplateStoreCategory" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"tenantId" bigint NOT NULL,
	"name" text NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	"createdBy" bigint
);
--> statement-breakpoint
CREATE TABLE "TemplateStoreListingCategory" (
	"listingId" bigint,
	"categoryId" bigint,
	CONSTRAINT "TemplateStoreListingCategory_pkey" PRIMARY KEY("listingId","categoryId")
);
--> statement-breakpoint
CREATE TABLE "TemplateStoreListing" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"tenantId" bigint NOT NULL,
	"templateId" bigint NOT NULL,
	"createdBy" bigint
);
--> statement-breakpoint
CREATE UNIQUE INDEX "TemplateStoreCategory_tenantId_name_key" ON "TemplateStoreCategory" ("tenantId",lower("name"));--> statement-breakpoint
CREATE INDEX "TemplateStoreCategory_tenantId_rank_id_idx" ON "TemplateStoreCategory" ("tenantId","rank","id");--> statement-breakpoint
CREATE INDEX "TemplateStoreCategory_createdBy_idx" ON "TemplateStoreCategory" ("createdBy") WHERE "createdBy" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "TemplateStoreListingCategory_categoryId_idx" ON "TemplateStoreListingCategory" ("categoryId");--> statement-breakpoint
CREATE UNIQUE INDEX "TemplateStoreListing_tenantId_templateId_key" ON "TemplateStoreListing" ("tenantId","templateId");--> statement-breakpoint
CREATE INDEX "TemplateStoreListing_templateId_idx" ON "TemplateStoreListing" ("templateId");--> statement-breakpoint
CREATE INDEX "TemplateStoreListing_createdBy_idx" ON "TemplateStoreListing" ("createdBy") WHERE "createdBy" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "TemplateStoreCategory" ADD CONSTRAINT "TemplateStoreCategory_tenantId_Tenant_id_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TemplateStoreCategory" ADD CONSTRAINT "TemplateStoreCategory_createdBy_User_id_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TemplateStoreListingCategory" ADD CONSTRAINT "TemplateStoreListingCategory_6NRhid3zrtxN_fkey" FOREIGN KEY ("listingId") REFERENCES "TemplateStoreListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TemplateStoreListingCategory" ADD CONSTRAINT "TemplateStoreListingCategory_8ENSsaBUskGb_fkey" FOREIGN KEY ("categoryId") REFERENCES "TemplateStoreCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TemplateStoreListing" ADD CONSTRAINT "TemplateStoreListing_tenantId_Tenant_id_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TemplateStoreListing" ADD CONSTRAINT "TemplateStoreListing_templateId_Template_id_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TemplateStoreListing" ADD CONSTRAINT "TemplateStoreListing_createdBy_User_id_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TYPE "metaCatalogAuthMode" AS ENUM('oauth', 'fbe');--> statement-breakpoint
CREATE TYPE "metaCatalogConnectionStatus" AS ENUM('active', 'invalid');--> statement-breakpoint
CREATE TYPE "metaCatalogSyncScope" AS ENUM('all', 'category', 'selected');--> statement-breakpoint
CREATE TYPE "metaCatalogSyncStatus" AS ENUM('queued', 'running', 'succeeded', 'partial', 'failed');--> statement-breakpoint
ALTER TYPE "importType" ADD VALUE 'products';--> statement-breakpoint
CREATE TABLE "ProductCategory" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" text NOT NULL,
	"rank" integer DEFAULT 10 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "IntegrationMetaCatalog" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"integrationId" bigint NOT NULL,
	"catalogId" text,
	"catalogName" text,
	"businessId" text,
	"encryptedAuth" jsonb NOT NULL,
	"authMode" "metaCatalogAuthMode" DEFAULT 'oauth'::"metaCatalogAuthMode" NOT NULL,
	"tokenExpiresAt" timestamp(6) with time zone,
	"status" "metaCatalogConnectionStatus" DEFAULT 'active'::"metaCatalogConnectionStatus" NOT NULL,
	"currency" text DEFAULT 'VND' NOT NULL,
	"storeUrl" text
);
--> statement-breakpoint
CREATE TABLE "MetaCatalogItem" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"integrationMetaCatalogId" bigint NOT NULL,
	"productId" bigint NOT NULL,
	"retailerId" text NOT NULL,
	"lastSyncedFingerprint" text,
	"lastSyncedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "MetaCatalogSyncRun" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"integrationMetaCatalogId" bigint NOT NULL,
	"status" "metaCatalogSyncStatus" DEFAULT 'queued'::"metaCatalogSyncStatus" NOT NULL,
	"scope" "metaCatalogSyncScope" DEFAULT 'all'::"metaCatalogSyncScope" NOT NULL,
	"categoryId" bigint,
	"selectedProductIds" jsonb DEFAULT '[]' NOT NULL,
	"handles" jsonb DEFAULT '[]' NOT NULL,
	"totalCount" integer DEFAULT 0 NOT NULL,
	"succeededCount" integer DEFAULT 0 NOT NULL,
	"failedCount" integer DEFAULT 0 NOT NULL,
	"skippedCount" integer DEFAULT 0 NOT NULL,
	"itemErrors" jsonb DEFAULT '[]' NOT NULL,
	"skippedItems" jsonb DEFAULT '[]' NOT NULL,
	"pollAttempt" integer DEFAULT 0 NOT NULL,
	"error" text,
	"startedAt" timestamp(6) with time zone,
	"finishedAt" timestamp(6) with time zone
);
--> statement-breakpoint
ALTER TABLE "Import" ADD COLUMN "errorSample" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "Product" ADD COLUMN "categoryId" bigint;--> statement-breakpoint
CREATE INDEX "ProductCategory_workspaceId_idx" ON "ProductCategory" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "ProductCategory_workspaceId_name_key" ON "ProductCategory" ("workspaceId","name");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationMetaCatalog_integrationId_key" ON "IntegrationMetaCatalog" ("integrationId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationMetaCatalog_workspaceId_key" ON "IntegrationMetaCatalog" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "MetaCatalogItem_integration_retailer_key" ON "MetaCatalogItem" ("integrationMetaCatalogId","retailerId");--> statement-breakpoint
CREATE UNIQUE INDEX "MetaCatalogItem_integration_product_key" ON "MetaCatalogItem" ("integrationMetaCatalogId","productId");--> statement-breakpoint
CREATE INDEX "MetaCatalogItem_productId_idx" ON "MetaCatalogItem" ("productId");--> statement-breakpoint
CREATE UNIQUE INDEX "MetaCatalogSyncRun_active_idx" ON "MetaCatalogSyncRun" ("workspaceId") WHERE "status" IN ('queued', 'running');--> statement-breakpoint
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_ProductCategory_id_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationMetaCatalog" ADD CONSTRAINT "IntegrationMetaCatalog_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationMetaCatalog" ADD CONSTRAINT "IntegrationMetaCatalog_integrationId_Integration_id_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MetaCatalogItem" ADD CONSTRAINT "MetaCatalogItem_wJXyKUssR08y_fkey" FOREIGN KEY ("integrationMetaCatalogId") REFERENCES "IntegrationMetaCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MetaCatalogItem" ADD CONSTRAINT "MetaCatalogItem_productId_Product_id_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MetaCatalogSyncRun" ADD CONSTRAINT "MetaCatalogSyncRun_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MetaCatalogSyncRun" ADD CONSTRAINT "MetaCatalogSyncRun_8PnmCJ0uISUd_fkey" FOREIGN KEY ("integrationMetaCatalogId") REFERENCES "IntegrationMetaCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MetaCatalogSyncRun" ADD CONSTRAINT "MetaCatalogSyncRun_categoryId_ProductCategory_id_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

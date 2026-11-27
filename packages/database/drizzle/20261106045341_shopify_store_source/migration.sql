CREATE TYPE "shopifyCheckoutMethod" AS ENUM('webCheckout', 'inApp');--> statement-breakpoint
CREATE TYPE "shopifyAuthKind" AS ENUM('token', 'clientCredentials');--> statement-breakpoint
CREATE TYPE "shopifyConnectionStatus" AS ENUM('active', 'invalid');--> statement-breakpoint
CREATE TYPE "shopifySyncStatus" AS ENUM('idle', 'queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "fulfillmentStatus" AS ENUM('unfulfilled', 'partial', 'fulfilled');--> statement-breakpoint
CREATE TYPE "productStatus" AS ENUM('active', 'draft', 'unlisted');--> statement-breakpoint
CREATE TYPE "storeSource" AS ENUM('chatbotx', 'shopify');--> statement-breakpoint
ALTER TYPE "orderSource" ADD VALUE 'shopify';--> statement-breakpoint
CREATE TABLE "IntegrationShopify" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"shopDomain" text NOT NULL,
	"shopName" text,
	"currency" text NOT NULL,
	"authKind" "shopifyAuthKind" NOT NULL,
	"encryptedAuth" jsonb NOT NULL,
	"webhookSubscriptionIds" jsonb NOT NULL,
	"status" "shopifyConnectionStatus" DEFAULT 'active'::"shopifyConnectionStatus" NOT NULL,
	"statusReason" text,
	"syncStatus" "shopifySyncStatus" DEFAULT 'idle'::"shopifySyncStatus" NOT NULL,
	"syncError" text,
	"lastSyncedAt" timestamp(6) with time zone,
	"productCount" integer DEFAULT 0 NOT NULL,
	"orderCount" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "DiscountCode" ADD COLUMN "source" "storeSource" DEFAULT 'chatbotx'::"storeSource" NOT NULL;--> statement-breakpoint
ALTER TABLE "DiscountCode" ADD COLUMN "externalId" text;--> statement-breakpoint
ALTER TABLE "EcommerceSettings" ADD COLUMN "storeSource" "storeSource" DEFAULT 'chatbotx'::"storeSource" NOT NULL;--> statement-breakpoint
ALTER TABLE "EcommerceSettings" ADD COLUMN "shopifyCheckoutMethod" "shopifyCheckoutMethod" DEFAULT 'webCheckout'::"shopifyCheckoutMethod" NOT NULL;--> statement-breakpoint
ALTER TABLE "EcommerceSettings" ADD COLUMN "shopifyAutoApplyDiscounts" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "Order" ADD COLUMN "externalId" text;--> statement-breakpoint
ALTER TABLE "Order" ADD COLUMN "externalName" text;--> statement-breakpoint
ALTER TABLE "Order" ADD COLUMN "fulfillmentStatus" "fulfillmentStatus";--> statement-breakpoint
ALTER TABLE "Order" ADD COLUMN "trackingCompany" text;--> statement-breakpoint
ALTER TABLE "Order" ADD COLUMN "trackingNumber" text;--> statement-breakpoint
ALTER TABLE "Order" ADD COLUMN "trackingUrl" text;--> statement-breakpoint
ALTER TABLE "Product" ADD COLUMN "status" "productStatus" DEFAULT 'active'::"productStatus" NOT NULL;--> statement-breakpoint
ALTER TABLE "Product" ADD COLUMN "source" "storeSource" DEFAULT 'chatbotx'::"storeSource" NOT NULL;--> statement-breakpoint
ALTER TABLE "Product" ADD COLUMN "externalId" text;--> statement-breakpoint
ALTER TABLE "Product" ADD COLUMN "externalHandle" text;--> statement-breakpoint
ALTER TABLE "Product" ADD COLUMN "externalVariantId" text;--> statement-breakpoint
ALTER TABLE "ProductCategory" ADD COLUMN "source" "storeSource" DEFAULT 'chatbotx'::"storeSource" NOT NULL;--> statement-breakpoint
ALTER TABLE "ProductVariant" ADD COLUMN "sku" text;--> statement-breakpoint
ALTER TABLE "ProductVariant" ADD COLUMN "inventoryQuantity" integer;--> statement-breakpoint
ALTER TABLE "ProductVariant" ADD COLUMN "externalId" text;--> statement-breakpoint
ALTER TABLE "ProductVariant" ADD COLUMN "externalInventoryItemId" text;--> statement-breakpoint
ALTER TABLE "Vendor" ADD COLUMN "source" "storeSource" DEFAULT 'chatbotx'::"storeSource" NOT NULL;--> statement-breakpoint
DROP INDEX "DiscountCode_workspaceId_code_key";--> statement-breakpoint
CREATE UNIQUE INDEX "DiscountCode_workspaceId_code_key" ON "DiscountCode" ("workspaceId","source",lower("code"));--> statement-breakpoint
DROP INDEX "Vendor_workspaceId_name_key";--> statement-breakpoint
CREATE UNIQUE INDEX "Vendor_workspaceId_name_key" ON "Vendor" ("workspaceId","source",lower("name"));--> statement-breakpoint
ALTER TABLE "ProductCategory" DROP CONSTRAINT "ProductCategory_workspaceId_parent_name_key";--> statement-breakpoint
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_workspaceId_parent_name_key" UNIQUE NULLS NOT DISTINCT("workspaceId","source","parentId","name");--> statement-breakpoint
CREATE UNIQUE INDEX "DiscountCode_workspaceId_source_externalId_key" ON "DiscountCode" ("workspaceId","source","externalId") WHERE "externalId" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationShopify_workspaceId_key" ON "IntegrationShopify" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "Order_workspaceId_externalId_key" ON "Order" ("workspaceId","externalId") WHERE "externalId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "Order_workspaceId_source_createdAt_idx" ON "Order" ("workspaceId","source","createdAt" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "Product_workspaceId_source_externalId_key" ON "Product" ("workspaceId","source","externalId") WHERE "externalId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ProductVariant_externalInventoryItemId_idx" ON "ProductVariant" ("externalInventoryItemId") WHERE "externalInventoryItemId" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationShopify" ADD CONSTRAINT "IntegrationShopify_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
-- `status` replaces the on/off switch: a product switched off becomes a draft.
-- Shopify products sync their status from Shopify; none exist before this.
UPDATE "Product" SET "status" = 'draft' WHERE NOT "isActive";--> statement-breakpoint
ALTER TABLE "Product" DROP COLUMN "isActive";

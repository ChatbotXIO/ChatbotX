-- Shopify's checkout settings and connection statuses become shared by every
-- external store: renamed in place, so saved values and defaults are kept.
ALTER TYPE "shopifyCheckoutMethod" RENAME TO "externalCheckoutMethod";--> statement-breakpoint
ALTER TYPE "shopifyConnectionStatus" RENAME TO "externalStoreConnectionStatus";--> statement-breakpoint
ALTER TYPE "shopifySyncStatus" RENAME TO "externalStoreSyncStatus";--> statement-breakpoint
ALTER TABLE "EcommerceSettings" RENAME COLUMN "shopifyCheckoutMethod" TO "externalCheckoutMethod";--> statement-breakpoint
ALTER TABLE "EcommerceSettings" RENAME COLUMN "shopifyAutoApplyDiscounts" TO "externalAutoApplyDiscounts";--> statement-breakpoint
ALTER TYPE "orderSource" ADD VALUE 'woocommerce';--> statement-breakpoint
ALTER TYPE "storeSource" ADD VALUE 'woocommerce';--> statement-breakpoint
CREATE TABLE "IntegrationWoocommerce" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"siteUrl" text NOT NULL,
	"storeName" text,
	"currency" text NOT NULL,
	"encryptedAuth" jsonb NOT NULL,
	"webhookIds" jsonb NOT NULL,
	"status" "externalStoreConnectionStatus" DEFAULT 'active'::"externalStoreConnectionStatus" NOT NULL,
	"statusReason" text,
	"syncStatus" "externalStoreSyncStatus" DEFAULT 'idle'::"externalStoreSyncStatus" NOT NULL,
	"syncError" text,
	"lastSyncedAt" timestamp(6) with time zone,
	"productCount" integer DEFAULT 0 NOT NULL,
	"orderCount" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationWoocommerce_workspaceId_key" ON "IntegrationWoocommerce" ("workspaceId");--> statement-breakpoint
ALTER TABLE "IntegrationWoocommerce" ADD CONSTRAINT "IntegrationWoocommerce_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

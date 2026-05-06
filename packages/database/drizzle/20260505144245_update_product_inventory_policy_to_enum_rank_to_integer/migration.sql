CREATE TABLE "Product" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"shortDescription" text,
	"longDescription" text,
	"price" double precision DEFAULT 0 NOT NULL,
	"taxes" double precision DEFAULT 0 NOT NULL,
	"discount" double precision DEFAULT 0 NOT NULL,
	"sku" text,
	"inventoryPolicy" text DEFAULT 'dont_track' NOT NULL,
	"images" jsonb DEFAULT '[]' NOT NULL,
	"tags" jsonb DEFAULT '[]' NOT NULL,
	"vendor" text,
	"rank" text DEFAULT 'default' NOT NULL,
	"category" text,
	"subcategory" text,
	"isSearchable" boolean DEFAULT true NOT NULL,
	"allowSpecialRequest" boolean DEFAULT false NOT NULL,
	"isAddonOnly" boolean DEFAULT false NOT NULL,
	"workspaceId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ProductAddon" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"productId" bigint NOT NULL,
	"addonProductId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ProductVariant" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"productId" bigint NOT NULL,
	"combination" jsonb NOT NULL,
	"price" double precision DEFAULT 0 NOT NULL,
	"isEnabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ProductVariantOption" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"productId" bigint NOT NULL,
	"name" text NOT NULL,
	"values" jsonb DEFAULT '[]' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "Product_workspaceId_idx" ON "Product" ("workspaceId");--> statement-breakpoint
CREATE INDEX "ProductAddon_productId_idx" ON "ProductAddon" ("productId");--> statement-breakpoint
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant" ("productId");--> statement-breakpoint
CREATE INDEX "ProductVariantOption_productId_idx" ON "ProductVariantOption" ("productId");--> statement-breakpoint
ALTER TABLE "Product" ADD CONSTRAINT "Product_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ProductAddon" ADD CONSTRAINT "ProductAddon_productId_Product_id_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ProductAddon" ADD CONSTRAINT "ProductAddon_addonProductId_Product_id_fkey" FOREIGN KEY ("addonProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_Product_id_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ProductVariantOption" ADD CONSTRAINT "ProductVariantOption_productId_Product_id_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint

ALTER TABLE "ProductAddon" DROP CONSTRAINT IF EXISTS "ProductAddon_addonProductId_Product_id_fkey";--> statement-breakpoint
ALTER TABLE "ProductAddon" DROP COLUMN IF EXISTS "addonProductId";--> statement-breakpoint
ALTER TABLE "ProductAddon" ADD COLUMN IF NOT EXISTS "name" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "ProductAddon" ADD COLUMN IF NOT EXISTS "maxSelections" integer NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE "ProductAddon" ADD COLUMN IF NOT EXISTS "addonProductIds" jsonb NOT NULL DEFAULT '[]';

ALTER TABLE "Product" ADD COLUMN "inventoryQuantity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "Product" ADD COLUMN "allowOutOfStockPurchase" boolean DEFAULT false NOT NULL;

ALTER TABLE "Product" ADD COLUMN "isActive" boolean DEFAULT true NOT NULL;

CREATE TYPE "inventoryPolicy" AS ENUM('dont_track', 'track');--> statement-breakpoint
ALTER TABLE "Product" ALTER COLUMN "inventoryPolicy" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "Product" ALTER COLUMN "inventoryPolicy" SET DATA TYPE "inventoryPolicy" USING "inventoryPolicy"::"inventoryPolicy";--> statement-breakpoint
ALTER TABLE "Product" ALTER COLUMN "inventoryPolicy" SET DEFAULT 'dont_track'::"inventoryPolicy";--> statement-breakpoint
ALTER TABLE "Product" ALTER COLUMN "rank" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "Product" ALTER COLUMN "rank" SET DATA TYPE integer USING "rank"::integer;--> statement-breakpoint
ALTER TABLE "Product" ALTER COLUMN "rank" SET DEFAULT 10;--> statement-breakpoint
ALTER TABLE "ProductVariantOption" ALTER COLUMN "position" SET DEFAULT 10;

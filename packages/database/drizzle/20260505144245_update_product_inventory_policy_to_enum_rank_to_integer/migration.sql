CREATE TYPE "inventoryPolicy" AS ENUM('dont_track', 'track');--> statement-breakpoint
ALTER TABLE "Product" ALTER COLUMN "inventoryPolicy" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "Product" ALTER COLUMN "inventoryPolicy" SET DATA TYPE "inventoryPolicy" USING "inventoryPolicy"::"inventoryPolicy";--> statement-breakpoint
ALTER TABLE "Product" ALTER COLUMN "inventoryPolicy" SET DEFAULT 'dont_track'::"inventoryPolicy";--> statement-breakpoint
ALTER TABLE "Product" ALTER COLUMN "rank" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "Product" ALTER COLUMN "rank" SET DATA TYPE integer USING "rank"::integer;--> statement-breakpoint
ALTER TABLE "Product" ALTER COLUMN "rank" SET DEFAULT 10;--> statement-breakpoint
ALTER TABLE "ProductVariantOption" ALTER COLUMN "position" SET DEFAULT 10;
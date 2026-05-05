ALTER TABLE "ProductAddon" DROP CONSTRAINT IF EXISTS "ProductAddon_addonProductId_Product_id_fkey";--> statement-breakpoint
ALTER TABLE "ProductAddon" DROP COLUMN IF EXISTS "addonProductId";--> statement-breakpoint
ALTER TABLE "ProductAddon" ADD COLUMN IF NOT EXISTS "name" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "ProductAddon" ADD COLUMN IF NOT EXISTS "maxSelections" integer NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE "ProductAddon" ADD COLUMN IF NOT EXISTS "addonProductIds" jsonb NOT NULL DEFAULT '[]';

ALTER TABLE "Product" ADD COLUMN "inventoryQuantity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "Product" ADD COLUMN "allowOutOfStockPurchase" boolean DEFAULT false NOT NULL;
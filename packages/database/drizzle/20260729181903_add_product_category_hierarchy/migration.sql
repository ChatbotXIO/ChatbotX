DROP INDEX "ProductCategory_workspaceId_name_key";--> statement-breakpoint
ALTER TABLE "Product" ADD COLUMN "subcategoryId" bigint;--> statement-breakpoint
ALTER TABLE "ProductCategory" ADD COLUMN "parentId" bigint;--> statement-breakpoint
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_workspaceId_parent_name_key" UNIQUE NULLS NOT DISTINCT("workspaceId","parentId","name");--> statement-breakpoint
CREATE INDEX "ProductCategory_parentId_idx" ON "ProductCategory" ("parentId");--> statement-breakpoint
ALTER TABLE "Product" ADD CONSTRAINT "Product_subcategoryId_ProductCategory_id_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_parentId_ProductCategory_id_fkey" FOREIGN KEY ("parentId") REFERENCES "ProductCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
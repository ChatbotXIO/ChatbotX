CREATE TYPE "discountAppliesTo" AS ENUM('entireOrder', 'category', 'products');--> statement-breakpoint
CREATE TYPE "discountEligibility" AS ENUM('everyone', 'specificCustomers');--> statement-breakpoint
CREATE TYPE "discountMinimumType" AS ENUM('none', 'amount', 'quantity');--> statement-breakpoint
CREATE TYPE "discountType" AS ENUM('percentage', 'fixedAmount', 'freeShipping');--> statement-breakpoint
CREATE TYPE "checkoutMode" AS ENUM('default', 'externalLink', 'flow', 'productPage');--> statement-breakpoint
CREATE TYPE "currencyPosition" AS ENUM('left', 'leftSpace', 'right', 'rightSpace');--> statement-breakpoint
CREATE TYPE "orderConfirmationMode" AS ENUM('default', 'flow', 'none');--> statement-breakpoint
CREATE TYPE "productImageSize" AS ENUM('bigSquare', 'mediumRectangle');--> statement-breakpoint
CREATE TYPE "shippingMode" AS ENUM('none', 'delivery', 'pickup', 'deliveryAndPickup');--> statement-breakpoint
CREATE TYPE "webshopProductView" AS ENUM('list', 'listWithoutImage', 'card', 'cardSquare', 'image', 'imageSquare');--> statement-breakpoint
CREATE TYPE "orderActorType" AS ENUM('user', 'apiToken', 'system', 'contact');--> statement-breakpoint
CREATE TYPE "orderSource" AS ENUM('webshop', 'api', 'manual');--> statement-breakpoint
CREATE TYPE "orderStatus" AS ENUM('pending', 'accepted', 'shipped', 'concluded', 'cancelled');--> statement-breakpoint
CREATE TYPE "paymentMethod" AS ENUM('cod');--> statement-breakpoint
CREATE TYPE "paymentStatus" AS ENUM('unpaid', 'paid', 'refunded');--> statement-breakpoint
CREATE TYPE "shippingType" AS ENUM('delivery', 'pickup');--> statement-breakpoint
CREATE TABLE "Cart" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"contactId" bigint NOT NULL,
	"contactInboxId" bigint,
	"items" jsonb NOT NULL,
	"discountCode" text,
	"lastActivityAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"abandonedNotifiedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "DiscountCode" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"code" text NOT NULL,
	"autoApply" boolean DEFAULT false NOT NULL,
	"discountType" "discountType" NOT NULL,
	"discountValue" numeric(19,4) DEFAULT '0' NOT NULL,
	"appliesTo" "discountAppliesTo" DEFAULT 'entireOrder'::"discountAppliesTo" NOT NULL,
	"categoryId" bigint,
	"productIds" jsonb NOT NULL,
	"minimumType" "discountMinimumType" DEFAULT 'none'::"discountMinimumType" NOT NULL,
	"minimumValue" numeric(19,4) DEFAULT '0' NOT NULL,
	"usageLimit" integer,
	"usedCount" integer DEFAULT 0 NOT NULL,
	"oncePerCustomer" boolean DEFAULT false NOT NULL,
	"eligibility" "discountEligibility" DEFAULT 'everyone'::"discountEligibility" NOT NULL,
	"customerFilter" jsonb,
	"startsAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"endsAt" timestamp(6) with time zone,
	"isActive" boolean DEFAULT true NOT NULL,
	CONSTRAINT "DiscountCode_usedCount_check" CHECK ("usedCount" >= 0 AND ("usageLimit" IS NULL OR "usedCount" <= "usageLimit"))
);
--> statement-breakpoint
CREATE TABLE "EcommerceOpenHours" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" text NOT NULL,
	"ranges" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "EcommerceOrderCounter" (
	"workspaceId" bigint PRIMARY KEY,
	"lastNumber" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "EcommerceSettings" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"orderingAvailable" boolean NOT NULL,
	"webshopProductView" "webshopProductView" NOT NULL,
	"openHoursId" bigint,
	"searchProducts" boolean NOT NULL,
	"facebookPixelId" text,
	"abandonedCartDelayMinutes" integer,
	"abandonedCartFlowId" bigint,
	"productButtons" jsonb NOT NULL,
	"productImageSize" "productImageSize" NOT NULL,
	"allowRateOrders" boolean NOT NULL,
	"notifyOnCartStatusChange" boolean NOT NULL,
	"paymentMethods" jsonb NOT NULL,
	"currency" text NOT NULL,
	"currencyPosition" "currencyPosition" NOT NULL,
	"currencySymbol" text,
	"serviceFeePercent" numeric(19,4) NOT NULL,
	"shippingType" "shippingMode" NOT NULL,
	"storeAddress" text,
	"shippingCountries" jsonb NOT NULL,
	"defaultShippingCountry" text,
	"deliveryCost" numeric(19,4) NOT NULL,
	"checkoutMode" "checkoutMode" NOT NULL,
	"checkoutLink" text,
	"checkoutFlowId" bigint,
	"minimumOrderValue" numeric(19,4) NOT NULL,
	"orderConfirmationMode" "orderConfirmationMode" DEFAULT 'default'::"orderConfirmationMode" NOT NULL,
	"orderConfirmationFlowId" bigint,
	"requireName" boolean NOT NULL,
	"requireEmail" boolean NOT NULL,
	"requirePhone" boolean NOT NULL,
	"requireState" boolean NOT NULL,
	"requireZip" boolean NOT NULL,
	CONSTRAINT "EcommerceSettings_serviceFeePercent_check" CHECK ("serviceFeePercent" >= 0 AND "serviceFeePercent" <= 100)
);
--> statement-breakpoint
CREATE TABLE "DiscountCodeRedemption" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"discountCodeId" bigint NOT NULL,
	"orderId" bigint NOT NULL,
	"contactId" bigint,
	"amount" numeric(19,4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "OrderItem" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"orderId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"productId" bigint,
	"variantId" bigint,
	"vendorId" bigint,
	"categoryId" bigint,
	"name" text NOT NULL,
	"variantLabel" text,
	"combination" jsonb,
	"sku" text,
	"retailerId" text,
	"imageUrl" text,
	"vendorName" text,
	"unitPrice" numeric(19,4) NOT NULL,
	"quantity" integer NOT NULL,
	"stockTaken" integer DEFAULT 0 NOT NULL,
	"discountPercent" numeric(19,4) NOT NULL,
	"taxPercent" numeric(19,4) NOT NULL,
	"discountTotal" numeric(19,4) NOT NULL,
	"taxTotal" numeric(19,4) NOT NULL,
	"lineTotal" numeric(19,4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Order" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"number" bigint NOT NULL,
	"contactId" bigint,
	"contactInboxId" bigint,
	"inboxId" bigint,
	"conversationId" bigint,
	"channel" text,
	"source" "orderSource" NOT NULL,
	"status" "orderStatus" DEFAULT 'pending'::"orderStatus" NOT NULL,
	"paymentMethod" "paymentMethod" DEFAULT 'cod'::"paymentMethod" NOT NULL,
	"paymentStatus" "paymentStatus" DEFAULT 'unpaid'::"paymentStatus" NOT NULL,
	"currency" text NOT NULL,
	"subtotal" numeric(19,4) NOT NULL,
	"discountTotal" numeric(19,4) NOT NULL,
	"shippingTotal" numeric(19,4) NOT NULL,
	"serviceFeeTotal" numeric(19,4) NOT NULL,
	"taxTotal" numeric(19,4) NOT NULL,
	"couponDiscount" numeric(19,4) DEFAULT '0' NOT NULL,
	"total" numeric(19,4) NOT NULL,
	"discountCodeId" bigint,
	"discountCode" text,
	"customerName" text,
	"customerEmail" text,
	"customerPhone" text,
	"shippingType" "shippingType",
	"shippingAddress" jsonb,
	"note" text,
	"rating" integer,
	"ratingComment" text,
	"acceptedAt" timestamp(6) with time zone,
	"shippedAt" timestamp(6) with time zone,
	"concludedAt" timestamp(6) with time zone,
	"cancelledAt" timestamp(6) with time zone,
	"cancelReason" text
);
--> statement-breakpoint
CREATE TABLE "OrderStatusHistory" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"orderId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"fromStatus" "orderStatus",
	"toStatus" "orderStatus" NOT NULL,
	"actorType" "orderActorType" NOT NULL,
	"actorUserId" bigint,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "Vendor" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" text NOT NULL,
	"shortDescription" text,
	"phone" text,
	"storeAddress" text,
	"imageUrl" text,
	"isActive" boolean DEFAULT true NOT NULL,
	"discountPercent" numeric(19,4) DEFAULT '0' NOT NULL,
	"minimumOrderValue" numeric(19,4) DEFAULT '0' NOT NULL,
	"openHoursId" bigint,
	"categoryId" bigint,
	"subcategoryId" bigint,
	"rank" integer DEFAULT 10 NOT NULL,
	CONSTRAINT "Vendor_discountPercent_check" CHECK ("discountPercent" >= 0 AND "discountPercent" <= 100)
);
--> statement-breakpoint
ALTER TABLE "Product" ADD COLUMN "vendorId" bigint;--> statement-breakpoint
ALTER TABLE "ProductCategory" ADD COLUMN "imageUrl" text;--> statement-breakpoint
ALTER TABLE "ProductCategory" ADD COLUMN "isVisible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "Cart_workspaceId_contactId_key" ON "Cart" ("workspaceId","contactId");--> statement-breakpoint
CREATE INDEX "Cart_contactId_idx" ON "Cart" ("contactId");--> statement-breakpoint
CREATE INDEX "Cart_contactInboxId_idx" ON "Cart" ("contactInboxId");--> statement-breakpoint
CREATE INDEX "Cart_abandoned_scan_idx" ON "Cart" ("lastActivityAt") WHERE "abandonedNotifiedAt" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "DiscountCode_workspaceId_code_key" ON "DiscountCode" ("workspaceId",lower("code"));--> statement-breakpoint
CREATE INDEX "DiscountCode_categoryId_idx" ON "DiscountCode" ("categoryId");--> statement-breakpoint
CREATE INDEX "EcommerceOpenHours_workspaceId_idx" ON "EcommerceOpenHours" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "EcommerceSettings_workspaceId_key" ON "EcommerceSettings" ("workspaceId");--> statement-breakpoint
CREATE INDEX "EcommerceSettings_openHoursId_idx" ON "EcommerceSettings" ("openHoursId");--> statement-breakpoint
CREATE INDEX "EcommerceSettings_abandonedCartFlowId_idx" ON "EcommerceSettings" ("abandonedCartFlowId");--> statement-breakpoint
CREATE INDEX "EcommerceSettings_checkoutFlowId_idx" ON "EcommerceSettings" ("checkoutFlowId");--> statement-breakpoint
CREATE INDEX "EcommerceSettings_orderConfirmationFlowId_idx" ON "EcommerceSettings" ("orderConfirmationFlowId");--> statement-breakpoint
CREATE UNIQUE INDEX "DiscountCodeRedemption_orderId_key" ON "DiscountCodeRedemption" ("orderId");--> statement-breakpoint
CREATE INDEX "DiscountCodeRedemption_discountCodeId_contactId_idx" ON "DiscountCodeRedemption" ("discountCodeId","contactId");--> statement-breakpoint
CREATE INDEX "DiscountCodeRedemption_contactId_idx" ON "DiscountCodeRedemption" ("contactId");--> statement-breakpoint
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem" ("orderId");--> statement-breakpoint
CREATE INDEX "OrderItem_workspaceId_productId_idx" ON "OrderItem" ("workspaceId","productId");--> statement-breakpoint
CREATE INDEX "OrderItem_workspaceId_vendorId_idx" ON "OrderItem" ("workspaceId","vendorId");--> statement-breakpoint
CREATE INDEX "OrderItem_variantId_idx" ON "OrderItem" ("variantId");--> statement-breakpoint
CREATE INDEX "OrderItem_categoryId_idx" ON "OrderItem" ("categoryId");--> statement-breakpoint
CREATE UNIQUE INDEX "Order_workspaceId_number_key" ON "Order" ("workspaceId","number");--> statement-breakpoint
CREATE INDEX "Order_workspaceId_createdAt_idx" ON "Order" ("workspaceId","createdAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "Order_workspaceId_status_idx" ON "Order" ("workspaceId","status");--> statement-breakpoint
CREATE INDEX "Order_contactId_idx" ON "Order" ("contactId");--> statement-breakpoint
CREATE INDEX "Order_contactInboxId_idx" ON "Order" ("contactInboxId");--> statement-breakpoint
CREATE INDEX "Order_inboxId_idx" ON "Order" ("inboxId");--> statement-breakpoint
CREATE INDEX "Order_conversationId_idx" ON "Order" ("conversationId");--> statement-breakpoint
CREATE INDEX "Order_discountCodeId_idx" ON "Order" ("discountCodeId");--> statement-breakpoint
CREATE INDEX "OrderStatusHistory_orderId_createdAt_idx" ON "OrderStatusHistory" ("orderId","createdAt");--> statement-breakpoint
CREATE INDEX "OrderStatusHistory_workspaceId_idx" ON "OrderStatusHistory" ("workspaceId");--> statement-breakpoint
CREATE INDEX "OrderStatusHistory_actorUserId_idx" ON "OrderStatusHistory" ("actorUserId");--> statement-breakpoint
CREATE INDEX "Product_vendorId_idx" ON "Product" ("vendorId");--> statement-breakpoint
CREATE INDEX "Vendor_workspaceId_idx" ON "Vendor" ("workspaceId");--> statement-breakpoint
CREATE INDEX "Vendor_openHoursId_idx" ON "Vendor" ("openHoursId");--> statement-breakpoint
CREATE INDEX "Vendor_categoryId_idx" ON "Vendor" ("categoryId");--> statement-breakpoint
CREATE INDEX "Vendor_subcategoryId_idx" ON "Vendor" ("subcategoryId");--> statement-breakpoint
CREATE UNIQUE INDEX "Vendor_workspaceId_name_key" ON "Vendor" ("workspaceId",lower("name"));--> statement-breakpoint
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_contactInboxId_ContactInbox_id_fkey" FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "DiscountCode" ADD CONSTRAINT "DiscountCode_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "DiscountCode" ADD CONSTRAINT "DiscountCode_categoryId_ProductCategory_id_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "EcommerceOpenHours" ADD CONSTRAINT "EcommerceOpenHours_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "EcommerceOrderCounter" ADD CONSTRAINT "EcommerceOrderCounter_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "EcommerceSettings" ADD CONSTRAINT "EcommerceSettings_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "EcommerceSettings" ADD CONSTRAINT "EcommerceSettings_openHoursId_EcommerceOpenHours_id_fkey" FOREIGN KEY ("openHoursId") REFERENCES "EcommerceOpenHours"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "EcommerceSettings" ADD CONSTRAINT "EcommerceSettings_abandonedCartFlowId_Flow_id_fkey" FOREIGN KEY ("abandonedCartFlowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "EcommerceSettings" ADD CONSTRAINT "EcommerceSettings_checkoutFlowId_Flow_id_fkey" FOREIGN KEY ("checkoutFlowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "EcommerceSettings" ADD CONSTRAINT "EcommerceSettings_orderConfirmationFlowId_Flow_id_fkey" FOREIGN KEY ("orderConfirmationFlowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "DiscountCodeRedemption" ADD CONSTRAINT "DiscountCodeRedemption_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "DiscountCodeRedemption" ADD CONSTRAINT "DiscountCodeRedemption_discountCodeId_DiscountCode_id_fkey" FOREIGN KEY ("discountCodeId") REFERENCES "DiscountCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "DiscountCodeRedemption" ADD CONSTRAINT "DiscountCodeRedemption_orderId_Order_id_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "DiscountCodeRedemption" ADD CONSTRAINT "DiscountCodeRedemption_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_Order_id_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_Product_id_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_ProductVariant_id_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_vendorId_Vendor_id_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_categoryId_ProductCategory_id_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Order" ADD CONSTRAINT "Order_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Order" ADD CONSTRAINT "Order_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Order" ADD CONSTRAINT "Order_contactInboxId_ContactInbox_id_fkey" FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Order" ADD CONSTRAINT "Order_inboxId_Inbox_id_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Order" ADD CONSTRAINT "Order_conversationId_Conversation_id_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Order" ADD CONSTRAINT "Order_discountCodeId_DiscountCode_id_fkey" FOREIGN KEY ("discountCodeId") REFERENCES "DiscountCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_Order_id_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_actorUserId_User_id_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Product" ADD CONSTRAINT "Product_vendorId_Vendor_id_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_openHoursId_EcommerceOpenHours_id_fkey" FOREIGN KEY ("openHoursId") REFERENCES "EcommerceOpenHours"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_categoryId_ProductCategory_id_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_subcategoryId_ProductCategory_id_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
-- The vendor was free text until this release. Give every name still in use a
-- real row and point the product at it before the text column goes, so no
-- workspace loses its vendors. Names that differ only in case or surrounding
-- spaces become one vendor, matching the case-insensitive unique index. Ids
-- continue above the highest one already handed out, the same way the
-- category backfill did.
INSERT INTO "Vendor" ("id", "workspaceId", "name")
SELECT
  GREATEST(
    (SELECT COALESCE(MAX("id"), 0) FROM "Vendor"),
    (SELECT COALESCE(MAX("id"), 0) FROM "Product")
  ) + row_number() OVER (ORDER BY named."workspaceId", named."name"),
  named."workspaceId",
  named."name"
FROM (
  SELECT DISTINCT ON (p."workspaceId", lower(btrim(p."vendor")))
    p."workspaceId",
    btrim(p."vendor") AS "name"
  FROM "Product" p
  WHERE btrim(COALESCE(p."vendor", '')) <> ''
  ORDER BY p."workspaceId", lower(btrim(p."vendor")), btrim(p."vendor")
) named;--> statement-breakpoint
UPDATE "Product" p
SET "vendorId" = v."id"
FROM "Vendor" v
WHERE p."vendorId" IS NULL
  AND v."workspaceId" = p."workspaceId"
  AND lower(v."name") = lower(btrim(p."vendor"));--> statement-breakpoint
ALTER TABLE "Product" DROP COLUMN "vendor";

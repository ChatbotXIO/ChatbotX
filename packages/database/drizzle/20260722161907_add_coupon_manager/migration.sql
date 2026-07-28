CREATE TYPE "couponTopicStatus" AS ENUM('active', 'archived');--> statement-breakpoint
ALTER TYPE "importType" ADD VALUE 'coupons';--> statement-breakpoint
CREATE TABLE "Coupon" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"topicId" bigint NOT NULL,
	"code" text NOT NULL,
	"issuedContactId" bigint,
	"issuedAt" timestamp(6) with time zone,
	"usedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "CouponTopic" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"expiresAt" timestamp(6) with time zone,
	"status" "couponTopicStatus" DEFAULT 'active'::"couponTopicStatus" NOT NULL,
	"deletedAt" timestamp(6) with time zone,
	"hasEverHadCoupon" boolean DEFAULT false NOT NULL,
	"createdById" bigint
);
--> statement-breakpoint
ALTER TABLE "Import" ALTER COLUMN "inboxId" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "Coupon_workspaceId_code_key" ON "Coupon" ("workspaceId","code");--> statement-breakpoint
CREATE UNIQUE INDEX "Coupon_workspaceId_topicId_issuedContactId_key" ON "Coupon" ("workspaceId","topicId","issuedContactId") WHERE "issuedContactId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "Coupon_workspaceId_topicId_idx" ON "Coupon" ("workspaceId","topicId");--> statement-breakpoint
CREATE INDEX "Coupon_workspaceId_topicId_issuedContactId_idx" ON "Coupon" ("workspaceId","topicId","issuedContactId");--> statement-breakpoint
CREATE INDEX "Coupon_issuedContactId_idx" ON "Coupon" ("issuedContactId");--> statement-breakpoint
CREATE INDEX "Coupon_issuedAt_idx" ON "Coupon" ("issuedAt");--> statement-breakpoint
CREATE INDEX "Coupon_usedAt_idx" ON "Coupon" ("usedAt");--> statement-breakpoint
CREATE INDEX "Coupon_workspaceId_code_idx" ON "Coupon" ("workspaceId","code");--> statement-breakpoint
CREATE INDEX "Coupon_workspaceId_topicId_issuedContactId_usedAt_idx" ON "Coupon" ("workspaceId","topicId","issuedContactId","usedAt");--> statement-breakpoint
CREATE INDEX "CouponTopic_workspaceId_status_deletedAt_idx" ON "CouponTopic" ("workspaceId","status","deletedAt");--> statement-breakpoint
CREATE INDEX "CouponTopic_workspaceId_expiresAt_idx" ON "CouponTopic" ("workspaceId","expiresAt");--> statement-breakpoint
CREATE UNIQUE INDEX "CouponTopic_workspaceId_name_idx" ON "CouponTopic" ("workspaceId", lower("name")) WHERE "deletedAt" IS NULL;--> statement-breakpoint
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_topicId_CouponTopic_id_fkey" FOREIGN KEY ("topicId") REFERENCES "CouponTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_issuedContactId_Contact_id_fkey" FOREIGN KEY ("issuedContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "CouponTopic" ADD CONSTRAINT "CouponTopic_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "CouponTopic" ADD CONSTRAINT "CouponTopic_createdById_User_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

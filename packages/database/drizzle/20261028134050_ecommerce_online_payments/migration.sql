CREATE TYPE "onlinePaymentProvider" AS ENUM('stripe', 'paypal');--> statement-breakpoint
CREATE TYPE "orderPaymentStatus" AS ENUM('open', 'paid', 'expired', 'refunded');--> statement-breakpoint
ALTER TYPE "paymentMethod" ADD VALUE IF NOT EXISTS 'stripe';--> statement-breakpoint
ALTER TYPE "paymentMethod" ADD VALUE IF NOT EXISTS 'paypal';--> statement-breakpoint
CREATE TABLE "EcommercePaymentProvider" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"provider" "onlinePaymentProvider" NOT NULL,
	"livemode" boolean NOT NULL,
	"accountLabel" text,
	"externalAccountId" text,
	"platformCredentialId" bigint,
	"secret" jsonb,
	"webhookEndpointId" text
);
--> statement-breakpoint
CREATE TABLE "OrderPayment" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"orderId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"provider" "onlinePaymentProvider" NOT NULL,
	"providerReference" text NOT NULL,
	"transactionId" text,
	"refundId" text,
	"amount" numeric(19,4) NOT NULL,
	"currency" text NOT NULL,
	"status" "orderPaymentStatus" DEFAULT 'open'::"orderPaymentStatus" NOT NULL,
	"livemode" boolean NOT NULL,
	"checkoutUrl" text NOT NULL,
	"expiresAt" timestamp(6) with time zone NOT NULL,
	"paidAt" timestamp(6) with time zone,
	"refundedAt" timestamp(6) with time zone
);
--> statement-breakpoint
ALTER TABLE "Order" ADD COLUMN "paymentExpiresAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "Order" ADD COLUMN "paidAt" timestamp(6) with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "EcommercePaymentProvider_workspaceId_provider_key" ON "EcommercePaymentProvider" ("workspaceId","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "EcommercePaymentProvider_platformCredentialId_account_key" ON "EcommercePaymentProvider" ("platformCredentialId","externalAccountId") WHERE "externalAccountId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "EcommercePaymentProvider_externalAccountId_idx" ON "EcommercePaymentProvider" ("externalAccountId");--> statement-breakpoint
CREATE UNIQUE INDEX "OrderPayment_provider_providerReference_key" ON "OrderPayment" ("provider","providerReference");--> statement-breakpoint
CREATE INDEX "OrderPayment_orderId_idx" ON "OrderPayment" ("orderId");--> statement-breakpoint
CREATE INDEX "OrderPayment_workspaceId_idx" ON "OrderPayment" ("workspaceId");--> statement-breakpoint
CREATE INDEX "OrderPayment_open_expiresAt_idx" ON "OrderPayment" ("expiresAt") WHERE "status" = 'open';--> statement-breakpoint
CREATE INDEX "Order_paymentExpiresAt_idx" ON "Order" ("paymentExpiresAt") WHERE "status" = 'pending' AND "paymentStatus" = 'unpaid' AND "paymentExpiresAt" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "EcommercePaymentProvider" ADD CONSTRAINT "EcommercePaymentProvider_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "EcommercePaymentProvider" ADD CONSTRAINT "EcommercePaymentProvider_eOJU9fhqr8NU_fkey" FOREIGN KEY ("platformCredentialId") REFERENCES "PlatformCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "OrderPayment" ADD CONSTRAINT "OrderPayment_orderId_Order_id_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "OrderPayment" ADD CONSTRAINT "OrderPayment_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
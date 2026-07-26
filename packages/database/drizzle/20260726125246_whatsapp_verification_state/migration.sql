CREATE TYPE "public"."whatsappRegistrationStatus" AS ENUM('pending_verification', 'registered', 'failed');--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN "registrationStatus" "whatsappRegistrationStatus" DEFAULT 'registered' NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ALTER COLUMN "registrationStatus" SET DEFAULT 'pending_verification';--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD COLUMN "registrationError" jsonb;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD CONSTRAINT "IntegrationWhatsapp_registrationStatus_error_consistent" CHECK (("registrationStatus" <> 'failed' OR "registrationError" IS NOT NULL)
      AND ("registrationStatus" <> 'registered' OR "registrationError" IS NULL));

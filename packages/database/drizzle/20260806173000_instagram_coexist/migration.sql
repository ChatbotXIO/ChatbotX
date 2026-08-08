ALTER TYPE "coexistChannel" ADD VALUE 'instagram';--> statement-breakpoint
ALTER TABLE "IntegrationInstagram" ADD COLUMN "coexistEnabled" boolean DEFAULT false NOT NULL;

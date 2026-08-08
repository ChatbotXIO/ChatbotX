CREATE TYPE "automatedResponseType" AS ENUM('inbound', 'outbound');--> statement-breakpoint
ALTER TABLE "AutomatedResponse" ADD COLUMN "type" "automatedResponseType" DEFAULT 'inbound'::"automatedResponseType" NOT NULL;
ALTER TYPE "folderType" ADD VALUE 'outboundAutomatedResponse';

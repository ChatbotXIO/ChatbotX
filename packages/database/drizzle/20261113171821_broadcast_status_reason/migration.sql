CREATE TYPE "broadcastStatusReason" AS ENUM('accountPolicyBlocked', 'accountSendRestricted');--> statement-breakpoint
ALTER TABLE "Broadcast" ADD COLUMN "statusReason" "broadcastStatusReason";--> statement-breakpoint
ALTER TABLE "Broadcast" ADD COLUMN "statusErrorMessage" text;--> statement-breakpoint
ALTER TABLE "Broadcast" ADD COLUMN "statusInboxId" bigint;
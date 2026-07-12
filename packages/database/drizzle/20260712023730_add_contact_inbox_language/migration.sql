ALTER TABLE "ContactInbox" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "ContactInbox" ALTER COLUMN "firstInteractionAt" SET DATA TYPE timestamp(6) with time zone USING "firstInteractionAt"::timestamp(6) with time zone;

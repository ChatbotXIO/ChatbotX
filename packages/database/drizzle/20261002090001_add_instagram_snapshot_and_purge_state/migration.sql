SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TYPE "contactInboxInstagramSnapshotState" AS ENUM('pending', 'captured', 'unavailable', 'failed');--> statement-breakpoint
ALTER TABLE "ContactInbox" ADD COLUMN "igFollow" boolean;--> statement-breakpoint
ALTER TABLE "ContactInbox" ADD COLUMN "igFollowing" boolean;--> statement-breakpoint
ALTER TABLE "ContactInbox" ADD COLUMN "igVerified" boolean;--> statement-breakpoint
ALTER TABLE "ContactInbox" ADD COLUMN "igFollowers" integer;--> statement-breakpoint
ALTER TABLE "ContactInbox" ADD COLUMN "igSnapshotState" "contactInboxInstagramSnapshotState";--> statement-breakpoint
ALTER TABLE "ContactInbox" ADD COLUMN "igSnapshotAttempts" integer;--> statement-breakpoint
ALTER TABLE "ContactInbox" ADD COLUMN "igSnapshotNextAttemptAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "Workspace" ADD COLUMN "purgeStartedAt" timestamp(6) with time zone;

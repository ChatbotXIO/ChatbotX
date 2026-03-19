ALTER TABLE "Contact" RENAME COLUMN "lastSeenAt" TO "lastReadAt";--> statement-breakpoint
ALTER TABLE "Conversation" RENAME COLUMN "contactLastSeenAt" TO "contactLastReadAt";--> statement-breakpoint
ALTER TABLE "Conversation" RENAME COLUMN "agentLastSeenAt" TO "agentLastReadAt";--> statement-breakpoint
ALTER TABLE "Account" ALTER COLUMN "accessTokenExpiresAt" SET DATA TYPE timestamp(6) with time zone USING "accessTokenExpiresAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "Account" ALTER COLUMN "refreshTokenExpiresAt" SET DATA TYPE timestamp(6) with time zone USING "refreshTokenExpiresAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "AnalyticsManifestStatus" ALTER COLUMN "createdAt" SET DATA TYPE timestamp(6) with time zone USING "createdAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "AnalyticsManifestStatus" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp(6) with time zone USING "updatedAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "AuditLog" ALTER COLUMN "createdAt" SET DATA TYPE timestamp(6) with time zone USING "createdAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "AuditLog" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp(6) with time zone USING "updatedAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "Broadcast" ALTER COLUMN "schedulesAt" SET DATA TYPE timestamp(6) with time zone USING "schedulesAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "Condition" ALTER COLUMN "createdAt" SET DATA TYPE timestamp(6) with time zone USING "createdAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "ContactInbox" ALTER COLUMN "createdAt" SET DATA TYPE timestamp(6) with time zone USING "createdAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "ContactInbox" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp(6) with time zone USING "updatedAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "Contact" ALTER COLUMN "lastReadAt" SET DATA TYPE timestamp(6) with time zone USING "lastReadAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "Contact" ALTER COLUMN "blockedAt" SET DATA TYPE timestamp(6) with time zone USING "blockedAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "Conversation" ALTER COLUMN "archivedAt" SET DATA TYPE timestamp(6) with time zone USING "archivedAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "Conversation" ALTER COLUMN "contactLastReadAt" SET DATA TYPE timestamp(6) with time zone USING "contactLastReadAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "Conversation" ALTER COLUMN "agentLastReadAt" SET DATA TYPE timestamp(6) with time zone USING "agentLastReadAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "Conversation" ALTER COLUMN "lastActivityAt" SET DATA TYPE timestamp(6) with time zone USING "lastActivityAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "Conversation" ALTER COLUMN "adminRepliedAt" SET DATA TYPE timestamp(6) with time zone USING "adminRepliedAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "Conversation" ALTER COLUMN "contactRepliedAt" SET DATA TYPE timestamp(6) with time zone USING "contactRepliedAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "InboxContactStats" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp(6) with time zone USING "updatedAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "Invitation" ALTER COLUMN "expiresAt" SET DATA TYPE timestamp(6) with time zone USING "expiresAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "jwks" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Session" ALTER COLUMN "expiresAt" SET DATA TYPE timestamp(6) with time zone USING "expiresAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "TriggerContactHistory" ALTER COLUMN "createdAt" SET DATA TYPE timestamp(6) with time zone USING "createdAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "TriggerContactHistory" ALTER COLUMN "firstEnteredAt" SET DATA TYPE timestamp(6) with time zone USING "firstEnteredAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "TriggerContactHistory" ALTER COLUMN "firstEnteredAt" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "TriggerExecution" ALTER COLUMN "createdAt" SET DATA TYPE timestamp(6) with time zone USING "createdAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "TriggerExecution" ALTER COLUMN "executedAt" SET DATA TYPE timestamp(6) with time zone USING "executedAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "Trigger" ALTER COLUMN "createdAt" SET DATA TYPE timestamp(6) with time zone USING "createdAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "Trigger" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp(6) with time zone USING "updatedAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "TriggerStats" ALTER COLUMN "createdAt" SET DATA TYPE timestamp(6) with time zone USING "createdAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "TriggerStats" ALTER COLUMN "date" SET DATA TYPE timestamp(6) with time zone USING "date"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "Verification" ALTER COLUMN "expiresAt" SET DATA TYPE timestamp(6) with time zone USING "expiresAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "Webhook" ALTER COLUMN "createdAt" SET DATA TYPE timestamp(6) with time zone USING "createdAt"::timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "Webhook" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp(6) with time zone USING "updatedAt"::timestamp(6) with time zone;
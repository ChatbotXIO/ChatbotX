CREATE TYPE "leaderboardPlatform" AS ENUM('messenger', 'instagram', 'whatsapp', 'zalo', 'telegram', 'email', 'gamification');--> statement-breakpoint
CREATE TYPE "leaderboardStatus" AS ENUM('draft', 'active', 'paused', 'finished');--> statement-breakpoint
CREATE TYPE "leaderboardAuditAction" AS ENUM('adjust', 'resetOne', 'resetAll', 'ban', 'unban');--> statement-breakpoint
CREATE TYPE "leaderboardScoreSource" AS ENUM('rule', 'flow', 'referral', 'manual', 'reset');--> statement-breakpoint
CREATE TYPE "telegramBotChatStatus" AS ENUM('creator', 'administrator', 'member', 'restricted', 'left', 'kicked');--> statement-breakpoint
CREATE TYPE "telegramChatType" AS ENUM('private', 'group', 'supergroup', 'channel');--> statement-breakpoint
CREATE TABLE "Leaderboard" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"coverImageUrl" text DEFAULT '' NOT NULL,
	"startsAt" timestamp(6) with time zone NOT NULL,
	"endsAt" timestamp(6) with time zone NOT NULL,
	"status" "leaderboardStatus" DEFAULT 'draft'::"leaderboardStatus" NOT NULL,
	"platform" "leaderboardPlatform" NOT NULL,
	"inboxId" bigint,
	"minigameId" bigint,
	"scope" jsonb NOT NULL,
	"rules" jsonb NOT NULL,
	"followersOnly" boolean DEFAULT false NOT NULL,
	"tagIds" jsonb NOT NULL,
	"resetTime" text DEFAULT '22:00' NOT NULL,
	"cooldownSeconds" integer DEFAULT 0 NOT NULL,
	"referralWelcomeFlowId" bigint,
	"rewardSettings" jsonb NOT NULL,
	"rewardsTriggeredAt" timestamp(6) with time zone,
	"finishedAt" timestamp(6) with time zone,
	"deletedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "LeaderboardAuditLog" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"leaderboardId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"contactId" bigint,
	"action" "leaderboardAuditAction" NOT NULL,
	"delta" integer DEFAULT 0 NOT NULL,
	"actorUserId" bigint,
	"reason" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "LeaderboardParticipant" (
	"leaderboardId" bigint,
	"contactId" bigint,
	"workspaceId" bigint NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"isBanned" boolean DEFAULT false NOT NULL,
	"referrerContactId" bigint,
	"scoredAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"dailyBucket" date,
	"dailyCounts" jsonb NOT NULL,
	"breakdown" jsonb NOT NULL,
	"lastActivityAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "LeaderboardParticipant_pkey" PRIMARY KEY("leaderboardId","contactId")
);
--> statement-breakpoint
CREATE TABLE "LeaderboardScoreEvent" (
	"id" bigint,
	"createdAt" timestamp(6) with time zone DEFAULT now(),
	"leaderboardId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"contactId" bigint NOT NULL,
	"delta" integer NOT NULL,
	"source" "leaderboardScoreSource" NOT NULL,
	"rule" text,
	"sourceRef" text,
	CONSTRAINT "LeaderboardScoreEvent_pkey" PRIMARY KEY("createdAt","id")
) PARTITION BY RANGE ("createdAt");
--> statement-breakpoint
-- Hand-written (drizzle-kit cannot express partitioning, same as
-- ContactActiveHourly): monthly RANGE partitions on "createdAt".
-- Safety-net DEFAULT partition so an INSERT never fails when the
-- maintainLeaderboardPartitions cron has not yet created a month; the cron
-- keeps explicit partitions two months ahead, so this stays empty.
CREATE TABLE IF NOT EXISTS "LeaderboardScoreEvent_default"
  PARTITION OF "LeaderboardScoreEvent" DEFAULT;
--> statement-breakpoint
-- Current month + 2 ahead. Bounds carry an explicit +00 offset because the
-- column is timestamptz: a bare date literal would be read in the session
-- time zone and misalign the months.
DO $$
DECLARE
  m date := date_trunc('month', NOW() AT TIME ZONE 'UTC')::date;
  stop date := (date_trunc('month', NOW() AT TIME ZONE 'UTC') + INTERVAL '3 month')::date;
BEGIN
  WHILE m < stop LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS "LeaderboardScoreEvent_%s" PARTITION OF "LeaderboardScoreEvent" FOR VALUES FROM (%L) TO (%L)',
      to_char(m, 'YYYY_MM'), m::text || ' 00:00:00+00', (m + INTERVAL '1 month')::date::text || ' 00:00:00+00'
    );
    m := (m + INTERVAL '1 month')::date;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE TABLE "TelegramChat" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"inboxId" bigint NOT NULL,
	"chatId" text NOT NULL,
	"title" text,
	"type" "telegramChatType" NOT NULL,
	"botStatus" "telegramBotChatStatus" NOT NULL
);
--> statement-breakpoint
CREATE INDEX "Leaderboard_workspaceId_status_idx" ON "Leaderboard" ("workspaceId","status");--> statement-breakpoint
CREATE INDEX "Leaderboard_inboxId_idx" ON "Leaderboard" ("inboxId");--> statement-breakpoint
CREATE INDEX "Leaderboard_minigameId_idx" ON "Leaderboard" ("minigameId");--> statement-breakpoint
CREATE INDEX "LeaderboardAuditLog_leaderboardId_createdAt_idx" ON "LeaderboardAuditLog" ("leaderboardId","createdAt" DESC);--> statement-breakpoint
CREATE INDEX "LeaderboardParticipant_ranking_idx" ON "LeaderboardParticipant" ("leaderboardId","score" DESC NULLS LAST,"scoredAt") WHERE NOT "isBanned";--> statement-breakpoint
CREATE INDEX "LeaderboardParticipant_leaderboardId_referrerContactId_idx" ON "LeaderboardParticipant" ("leaderboardId","referrerContactId");--> statement-breakpoint
CREATE INDEX "LeaderboardParticipant_contactId_idx" ON "LeaderboardParticipant" ("contactId");--> statement-breakpoint
CREATE INDEX "LeaderboardScoreEvent_leaderboardId_createdAt_idx" ON "LeaderboardScoreEvent" ("leaderboardId","createdAt" DESC);--> statement-breakpoint
CREATE INDEX "LeaderboardScoreEvent_leaderboardId_contactId_createdAt_idx" ON "LeaderboardScoreEvent" ("leaderboardId","contactId","createdAt" DESC);--> statement-breakpoint
CREATE INDEX "LeaderboardScoreEvent_workspaceId_idx" ON "LeaderboardScoreEvent" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "TelegramChat_inboxId_chatId_key" ON "TelegramChat" ("inboxId","chatId");--> statement-breakpoint
CREATE INDEX "TelegramChat_workspaceId_idx" ON "TelegramChat" ("workspaceId");--> statement-breakpoint
ALTER TABLE "Leaderboard" ADD CONSTRAINT "Leaderboard_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Leaderboard" ADD CONSTRAINT "Leaderboard_inboxId_Inbox_id_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Leaderboard" ADD CONSTRAINT "Leaderboard_minigameId_Minigame_id_fkey" FOREIGN KEY ("minigameId") REFERENCES "Minigame"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Leaderboard" ADD CONSTRAINT "Leaderboard_referralWelcomeFlowId_Flow_id_fkey" FOREIGN KEY ("referralWelcomeFlowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "LeaderboardAuditLog" ADD CONSTRAINT "LeaderboardAuditLog_leaderboardId_Leaderboard_id_fkey" FOREIGN KEY ("leaderboardId") REFERENCES "Leaderboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "LeaderboardAuditLog" ADD CONSTRAINT "LeaderboardAuditLog_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "LeaderboardAuditLog" ADD CONSTRAINT "LeaderboardAuditLog_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "LeaderboardAuditLog" ADD CONSTRAINT "LeaderboardAuditLog_actorUserId_User_id_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "LeaderboardParticipant" ADD CONSTRAINT "LeaderboardParticipant_leaderboardId_Leaderboard_id_fkey" FOREIGN KEY ("leaderboardId") REFERENCES "Leaderboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "LeaderboardParticipant" ADD CONSTRAINT "LeaderboardParticipant_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "LeaderboardParticipant" ADD CONSTRAINT "LeaderboardParticipant_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "LeaderboardParticipant" ADD CONSTRAINT "LeaderboardParticipant_referrerContactId_Contact_id_fkey" FOREIGN KEY ("referrerContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TelegramChat" ADD CONSTRAINT "TelegramChat_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TelegramChat" ADD CONSTRAINT "TelegramChat_inboxId_Inbox_id_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
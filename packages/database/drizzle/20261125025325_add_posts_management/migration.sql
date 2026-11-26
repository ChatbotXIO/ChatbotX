CREATE TYPE "channelPostContentType" AS ENUM('text', 'photo', 'video', 'reel', 'carousel', 'story', 'live', 'link', 'audio', 'other');--> statement-breakpoint
CREATE TYPE "channelPostLiveStatus" AS ENUM('scheduled', 'live', 'ended');--> statement-breakpoint
CREATE TYPE "channelPostSyncStatus" AS ENUM('idle', 'queued', 'running', 'failed');--> statement-breakpoint
CREATE TYPE "publishDestinationStatus" AS ENUM('ok', 'permissionMissing');--> statement-breakpoint
CREATE TYPE "socialAccountStatus" AS ENUM('connected', 'needsReauth', 'disconnected');--> statement-breakpoint
CREATE TYPE "socialDestinationKind" AS ENUM('page', 'profile');--> statement-breakpoint
CREATE TYPE "socialProvider" AS ENUM('facebook', 'instagram', 'threads', 'tiktok');--> statement-breakpoint
CREATE TYPE "socialContentType" AS ENUM('text', 'link', 'image', 'video', 'carousel', 'reel', 'story');--> statement-breakpoint
CREATE TYPE "socialMediaKind" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TYPE "socialPostCreatedVia" AS ENUM('ui', 'api', 'feed');--> statement-breakpoint
CREATE TYPE "socialPostPartKind" AS ENUM('threadPart', 'firstComment');--> statement-breakpoint
CREATE TYPE "socialPostPartStatus" AS ENUM('pending', 'publishing', 'processing', 'published', 'failed', 'needsReview');--> statement-breakpoint
CREATE TYPE "socialPostScheduleMode" AS ENUM('custom', 'queue');--> statement-breakpoint
CREATE TYPE "socialPostStatus" AS ENUM('draft', 'scheduled', 'publishing', 'published', 'partiallyPublished', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "socialPostTargetStatus" AS ENUM('pending', 'publishing', 'processing', 'published', 'failed', 'cancelled', 'needsReview');--> statement-breakpoint
CREATE TYPE "socialPostFeedItemOutcome" AS ENUM('created', 'skippedOld', 'skippedInvalid', 'skippedFiltered', 'skippedNoImage');--> statement-breakpoint
CREATE TYPE "socialPostFeedTemplateSyntax" AS ENUM('legacy', 'v2');--> statement-breakpoint
CREATE TYPE "socialPostFeedMediaMode" AS ENUM('auto', 'field', 'none');--> statement-breakpoint
CREATE TYPE "socialPostFeedPostAs" AS ENUM('photo', 'link', 'text');--> statement-breakpoint
CREATE TYPE "socialPostFeedNoImageFallback" AS ENUM('link', 'text', 'skip');--> statement-breakpoint
CREATE TYPE "socialPostFeedMode" AS ENUM('draft', 'queue');--> statement-breakpoint
CREATE TYPE "socialPostFeedStatus" AS ENUM('active', 'paused', 'error');--> statement-breakpoint
CREATE TYPE "socialPostRecurrenceOutcome" AS ENUM('created', 'skipped', 'missed', 'excluded');--> statement-breakpoint
CREATE TYPE "socialPostSnippetKind" AS ENUM('signature', 'hashtags', 'text');--> statement-breakpoint
CREATE TABLE "ChannelPostSync" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"inboxId" bigint NOT NULL,
	"channel" text NOT NULL,
	"status" "channelPostSyncStatus" DEFAULT 'idle'::"channelPostSyncStatus" NOT NULL,
	"resumeCursor" text,
	"backfillCompletedAt" timestamp(6) with time zone,
	"lastSyncedAt" timestamp(6) with time zone,
	"nextSyncAt" timestamp(6) with time zone,
	"lastRequestedAt" timestamp(6) with time zone,
	"lastHeartbeatAt" timestamp(6) with time zone,
	"claimToken" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"syncedCount" integer DEFAULT 0 NOT NULL,
	"lastError" text,
	"lastErrorCategory" text
);
--> statement-breakpoint
CREATE TABLE "ChannelPostToPostTopic" (
	"channelPostId" bigint,
	"postTopicId" bigint,
	CONSTRAINT "ChannelPostToPostTopic_pkey" PRIMARY KEY("channelPostId","postTopicId")
);
--> statement-breakpoint
CREATE TABLE "PostTopic" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" text NOT NULL,
	"color" text
);
--> statement-breakpoint
CREATE TABLE "PublishDestination" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"provider" "socialProvider" NOT NULL,
	"inboxId" bigint,
	"socialAccountDestinationId" bigint,
	"grantedScopes" text[],
	"publishStatus" "publishDestinationStatus" DEFAULT 'ok'::"publishDestinationStatus" NOT NULL,
	"missingScopes" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"statusTokenFingerprint" text,
	"checkedAt" timestamp(6) with time zone,
	"avatar" text,
	"avatarFetchedAt" timestamp(6) with time zone,
	"lastPublishStartedAt" timestamp(6) with time zone,
	"pausedUntil" timestamp(6) with time zone,
	"pauseReason" text,
	"consecutiveLimitErrors" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "PublishDestination_binding_check" CHECK (num_nonnulls("inboxId", "socialAccountDestinationId") = 1),
	CONSTRAINT "PublishDestination_tiktok_check" CHECK (("provider" = 'tiktok') = ("socialAccountDestinationId" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "PublishDestinationSchedule" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"publishDestinationId" bigint NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"slots" jsonb DEFAULT '[{"weekday":0,"enabled":false,"times":[]},{"weekday":1,"enabled":false,"times":[]},{"weekday":2,"enabled":false,"times":[]},{"weekday":3,"enabled":false,"times":[]},{"weekday":4,"enabled":false,"times":[]},{"weekday":5,"enabled":false,"times":[]},{"weekday":6,"enabled":false,"times":[]}]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "SocialAccountDestination" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"socialAccountId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"kind" "socialDestinationKind" NOT NULL,
	"externalId" text NOT NULL,
	"name" text NOT NULL,
	"username" text,
	"avatar" text,
	"accessToken" jsonb,
	"isActive" boolean DEFAULT true NOT NULL,
	"lastSyncedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "SocialAccount" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"provider" "socialProvider" NOT NULL,
	"externalAccountId" text NOT NULL,
	"displayName" text NOT NULL,
	"username" text,
	"avatar" text,
	"accessToken" jsonb,
	"refreshToken" jsonb,
	"tokenExpiresAt" timestamp(6) with time zone,
	"grantedScopes" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"status" "socialAccountStatus" DEFAULT 'connected'::"socialAccountStatus" NOT NULL,
	"statusReason" text,
	"lastVerifiedAt" timestamp(6) with time zone,
	"connectedById" bigint,
	"refreshLeaseExpiresAt" timestamp(6) with time zone,
	CONSTRAINT "SocialAccount_tiktok_check" CHECK ("provider" = 'tiktok')
);
--> statement-breakpoint
CREATE TABLE "SocialPostMedia" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"socialPostId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"altText" text,
	"durationMs" integer,
	"height" integer,
	"kind" "socialMediaKind" NOT NULL,
	"mediaLibraryFileId" bigint,
	"mimeType" text NOT NULL,
	"path" text NOT NULL,
	"position" integer NOT NULL,
	"size" integer NOT NULL,
	"width" integer
);
--> statement-breakpoint
CREATE TABLE "SocialPost" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"text" text,
	"linkUrl" text,
	"status" "socialPostStatus" DEFAULT 'draft'::"socialPostStatus" NOT NULL,
	"createdById" bigint,
	"createdVia" "socialPostCreatedVia" DEFAULT 'ui'::"socialPostCreatedVia" NOT NULL,
	"idempotencyKey" text,
	"idempotencyRequestHash" text,
	"completedAt" timestamp(6) with time zone,
	"parentSocialPostId" bigint,
	"occurrenceAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "SocialPostTargetMedia" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"socialPostTargetId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"altText" text,
	"durationMs" integer,
	"height" integer,
	"kind" "socialMediaKind" NOT NULL,
	"mediaLibraryFileId" bigint,
	"mimeType" text NOT NULL,
	"path" text NOT NULL,
	"position" integer NOT NULL,
	"size" integer NOT NULL,
	"width" integer
);
--> statement-breakpoint
CREATE TABLE "SocialPostTarget" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"socialPostId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"publishDestinationId" bigint NOT NULL,
	"provider" "socialProvider" NOT NULL,
	"contentType" "socialContentType" NOT NULL,
	"textOverride" text,
	"overridesMedia" boolean DEFAULT false NOT NULL,
	"options" jsonb DEFAULT '{}' NOT NULL,
	"status" "socialPostTargetStatus" DEFAULT 'pending'::"socialPostTargetStatus" NOT NULL,
	"scheduleMode" "socialPostScheduleMode" DEFAULT 'custom'::"socialPostScheduleMode" NOT NULL,
	"scheduledAt" timestamp(6) with time zone,
	"timezone" text,
	"queueSlotAt" timestamp(6) with time zone,
	"nextAttemptAt" timestamp(6) with time zone,
	"leaseExpiresAt" timestamp(6) with time zone,
	"attemptCount" integer DEFAULT 0 NOT NULL,
	"rateLimitAttempts" integer DEFAULT 0 NOT NULL,
	"publishStartedAt" timestamp(6) with time zone,
	"continuation" jsonb,
	"errorCategory" text,
	"errorCode" text,
	"errorMessage" text,
	"externalPostId" text,
	"permalink" text,
	"publishedAt" timestamp(6) with time zone,
	"removedAt" timestamp(6) with time zone,
	"channelPostId" bigint,
	"quotaChargePending" boolean DEFAULT false NOT NULL,
	"quotaChargedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "SocialPostTargetPart" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"socialPostTargetId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"position" integer NOT NULL,
	"kind" "socialPostPartKind" DEFAULT 'threadPart'::"socialPostPartKind" NOT NULL,
	"text" text NOT NULL,
	"status" "socialPostPartStatus" DEFAULT 'pending'::"socialPostPartStatus" NOT NULL,
	"nextAttemptAt" timestamp(6) with time zone,
	"leaseExpiresAt" timestamp(6) with time zone,
	"attemptCount" integer DEFAULT 0 NOT NULL,
	"rateLimitAttempts" integer DEFAULT 0 NOT NULL,
	"publishStartedAt" timestamp(6) with time zone,
	"continuation" jsonb,
	"errorCategory" text,
	"errorCode" text,
	"errorMessage" text,
	"externalPostId" text,
	"permalink" text,
	"publishedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "SocialPostToPostTopic" (
	"socialPostId" bigint,
	"postTopicId" bigint,
	CONSTRAINT "SocialPostToPostTopic_pkey" PRIMARY KEY("socialPostId","postTopicId")
);
--> statement-breakpoint
CREATE TABLE "SocialPostFeedDestination" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"feedId" bigint NOT NULL,
	"publishDestinationId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "SocialPostFeedItem" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"feedId" bigint NOT NULL,
	"itemKey" text NOT NULL,
	"title" text,
	"link" text,
	"publishedAt" timestamp(6) with time zone,
	"outcome" "socialPostFeedItemOutcome" NOT NULL,
	"reason" text,
	"imageUrl" text,
	"imageSource" text,
	"imageError" text,
	"droppedDestinationIds" jsonb,
	"socialPostId" bigint
);
--> statement-breakpoint
CREATE TABLE "SocialPostFeed" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" text NOT NULL,
	"feedUrl" text NOT NULL,
	"status" "socialPostFeedStatus" DEFAULT 'active'::"socialPostFeedStatus" NOT NULL,
	"intervalMinutes" integer DEFAULT 60 NOT NULL,
	"nextCheckAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"leaseExpiresAt" timestamp(6) with time zone,
	"lastCheckedAt" timestamp(6) with time zone,
	"lastManualCheckAt" timestamp(6) with time zone,
	"etag" text,
	"lastModified" text,
	"consecutiveFailures" integer DEFAULT 0 NOT NULL,
	"lastErrorCode" text,
	"textTemplate" text DEFAULT '{{ title }}
{{ link }}' NOT NULL,
	"signatureId" bigint,
	"mode" "socialPostFeedMode" DEFAULT 'draft'::"socialPostFeedMode" NOT NULL,
	"maxItemsPerRun" integer DEFAULT 5 NOT NULL,
	"dailyCap" integer DEFAULT 10 NOT NULL,
	"startedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"primedAt" timestamp(6) with time zone,
	"createdById" bigint,
	"aiWrite" boolean DEFAULT false NOT NULL,
	"aiInstructions" text,
	"aiIntegrationId" text,
	"aiModel" text,
	"postLatestOnFirstCheck" boolean DEFAULT false NOT NULL,
	"templateSyntax" "socialPostFeedTemplateSyntax" DEFAULT 'v2'::"socialPostFeedTemplateSyntax" NOT NULL,
	"mediaMode" "socialPostFeedMediaMode" DEFAULT 'none'::"socialPostFeedMediaMode" NOT NULL,
	"mediaField" text,
	"mediaLibraryFileIds" jsonb DEFAULT '[]' NOT NULL,
	"postAs" "socialPostFeedPostAs" DEFAULT 'text'::"socialPostFeedPostAs" NOT NULL,
	"noImageFallback" "socialPostFeedNoImageFallback" DEFAULT 'text'::"socialPostFeedNoImageFallback" NOT NULL,
	"filters" jsonb,
	"templatesByProvider" jsonb DEFAULT '{}' NOT NULL,
	"fetchArticleImage" boolean DEFAULT false NOT NULL,
	"lastRunSummary" jsonb
);
--> statement-breakpoint
CREATE TABLE "SocialPostRecurrence" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"socialPostId" bigint NOT NULL,
	"rule" jsonb NOT NULL,
	"nextRunAt" timestamp(6) with time zone,
	"accountedThroughAt" timestamp(6) with time zone,
	"occurrenceCount" integer DEFAULT 0 NOT NULL,
	"pausedAt" timestamp(6) with time zone,
	"endedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "SocialPostRecurrenceOccurrence" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"recurrenceId" bigint NOT NULL,
	"localSlot" text NOT NULL,
	"occurrenceAt" timestamp(6) with time zone NOT NULL,
	"outcome" "socialPostRecurrenceOutcome" NOT NULL,
	"socialPostId" bigint
);
--> statement-breakpoint
CREATE TABLE "SocialPostSnippet" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"kind" "socialPostSnippetKind" NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "SocialPostTargetSetDestination" (
	"workspaceId" bigint NOT NULL,
	"targetSetId" bigint,
	"publishDestinationId" bigint,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "SocialPostTargetSetDestination_pkey" PRIMARY KEY("targetSetId","publishDestinationId")
);
--> statement-breakpoint
CREATE TABLE "SocialPostTargetSet" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ChannelPostMetricDaily" (
	"workspaceId" bigint NOT NULL,
	"day" date NOT NULL,
	"channelPostId" bigint NOT NULL,
	"inboxId" bigint NOT NULL,
	"channel" text NOT NULL,
	"commentsCount" bigint,
	"reactionsCount" bigint,
	"sharesCount" bigint,
	"engagementCount" bigint,
	"viewsCount" bigint,
	"commentsGain" bigint DEFAULT 0 NOT NULL,
	"reactionsGain" bigint DEFAULT 0 NOT NULL,
	"sharesGain" bigint DEFAULT 0 NOT NULL,
	"engagementGain" bigint DEFAULT 0 NOT NULL,
	"viewsGain" bigint DEFAULT 0 NOT NULL,
	"isBaseline" boolean DEFAULT false NOT NULL,
	"observedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ChannelPostMetricDaily_pkey" PRIMARY KEY("workspaceId","day","channelPostId")
) PARTITION BY RANGE ("day");
--> statement-breakpoint
-- Hand-written (drizzle-kit cannot express partitioning, same as ContactActiveHourly and
-- LeaderboardScoreEvent): monthly RANGE partitions on "day" (a date, so plain date bounds).
-- Safety-net DEFAULT partition so an INSERT never fails when the maintainChannelPostMetricPartitions
-- cron has not yet created a month; the cron keeps explicit partitions two months ahead.
CREATE TABLE IF NOT EXISTS "ChannelPostMetricDaily_default"
  PARTITION OF "ChannelPostMetricDaily" DEFAULT;
--> statement-breakpoint
-- Previous month (a snapshot of the first day of a month, or a sync lagging a day behind UTC, can
-- still land there) + current month + 2 ahead.
DO $$
DECLARE
  m date := (date_trunc('month', NOW() AT TIME ZONE 'UTC') - INTERVAL '1 month')::date;
  stop date := (date_trunc('month', NOW() AT TIME ZONE 'UTC') + INTERVAL '3 month')::date;
BEGIN
  WHILE m < stop LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS "ChannelPostMetricDaily_%s" PARTITION OF "ChannelPostMetricDaily" FOR VALUES FROM (%L) TO (%L)',
      to_char(m, 'YYYY_MM'), m::text, (m + INTERVAL '1 month')::date::text
    );
    m := (m + INTERVAL '1 month')::date;
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE "ChannelPost" ADD COLUMN "contentType" "channelPostContentType";--> statement-breakpoint
ALTER TABLE "ChannelPost" ADD COLUMN "liveStatus" "channelPostLiveStatus";--> statement-breakpoint
ALTER TABLE "ChannelPost" ADD COLUMN "liveStatusObservedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "ChannelPost" ADD COLUMN "liveRecheckAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "ChannelPost" ADD COLUMN "commentsCount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ChannelPost" ADD COLUMN "reactionsCount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ChannelPost" ADD COLUMN "sharesCount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ChannelPost" ADD COLUMN "engagementCount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ChannelPost" ADD COLUMN "metricsKnownMask" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ChannelPost" ADD COLUMN "phoneCommentsCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ChannelPost" ADD COLUMN "viewsCount" bigint;--> statement-breakpoint
ALTER TABLE "ChannelPost" ADD COLUMN "metricsFetchedAt" timestamp(6) with time zone;--> statement-breakpoint
ALTER TABLE "ChannelPost" ADD COLUMN "hideComments" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ChannelPost" ADD COLUMN "hidePhoneComments" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ChannelPost" ADD COLUMN "skipComments" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ChannelPost" ADD COLUMN "authorName" text;--> statement-breakpoint
ALTER TABLE "ChannelPost" ADD COLUMN "authorExternalId" text;--> statement-breakpoint
ALTER TABLE "ChannelPost" ADD COLUMN "removedAt" timestamp(6) with time zone;--> statement-breakpoint
CREATE INDEX "ChannelPostMetricDaily_workspaceId_channelPostId_day_idx" ON "ChannelPostMetricDaily" ("workspaceId","channelPostId","day");--> statement-breakpoint
CREATE INDEX "ChannelPostMetricDaily_workspaceId_inboxId_day_idx" ON "ChannelPostMetricDaily" ("workspaceId","inboxId","day");--> statement-breakpoint
CREATE UNIQUE INDEX "ChannelPostSync_inboxId_key" ON "ChannelPostSync" ("inboxId");--> statement-breakpoint
CREATE INDEX "ChannelPostSync_workspaceId_idx" ON "ChannelPostSync" ("workspaceId");--> statement-breakpoint
CREATE INDEX "ChannelPostSync_due_idx" ON "ChannelPostSync" ("nextSyncAt","id") WHERE "status" IN ('idle', 'queued');--> statement-breakpoint
CREATE INDEX "ChannelPostSync_stalled_idx" ON "ChannelPostSync" ("lastHeartbeatAt","id") WHERE "status" = 'running';--> statement-breakpoint
CREATE INDEX "ChannelPostSync_parked_notConnected_idx" ON "ChannelPostSync" ("id") WHERE "status" = 'idle' AND "lastErrorCategory" = 'notConnected';--> statement-breakpoint
CREATE INDEX "ChannelPostToPostTopic_postTopicId_idx" ON "ChannelPostToPostTopic" ("postTopicId");--> statement-breakpoint
CREATE UNIQUE INDEX "PostTopic_workspaceId_name_key" ON "PostTopic" ("workspaceId","name");--> statement-breakpoint
CREATE INDEX "PublishDestination_workspaceId_idx" ON "PublishDestination" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "PublishDestination_inboxId_key" ON "PublishDestination" ("inboxId") WHERE "inboxId" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "PublishDestination_socialAccountDestinationId_key" ON "PublishDestination" ("socialAccountDestinationId") WHERE "socialAccountDestinationId" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "PublishDestinationSchedule_destination_key" ON "PublishDestinationSchedule" ("publishDestinationId");--> statement-breakpoint
CREATE INDEX "PublishDestinationSchedule_workspaceId_idx" ON "PublishDestinationSchedule" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "SocialAccountDestination_socialAccountId_externalId_key" ON "SocialAccountDestination" ("socialAccountId","externalId");--> statement-breakpoint
CREATE INDEX "SocialAccountDestination_workspaceId_idx" ON "SocialAccountDestination" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "SocialAccount_workspaceId_provider_externalAccountId_key" ON "SocialAccount" ("workspaceId","provider","externalAccountId");--> statement-breakpoint
CREATE INDEX "SocialAccount_connectedById_idx" ON "SocialAccount" ("connectedById") WHERE "connectedById" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "SocialAccount_tokenExpiresAt_idx" ON "SocialAccount" ("tokenExpiresAt") WHERE "status" = 'connected';--> statement-breakpoint
CREATE UNIQUE INDEX "SocialPostMedia_socialPostId_position_key" ON "SocialPostMedia" ("socialPostId","position");--> statement-breakpoint
CREATE INDEX "SocialPostMedia_workspaceId_idx" ON "SocialPostMedia" ("workspaceId");--> statement-breakpoint
CREATE INDEX "SocialPostMedia_mediaLibraryFileId_idx" ON "SocialPostMedia" ("mediaLibraryFileId") WHERE "mediaLibraryFileId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "SocialPost_workspaceId_createdAt_id_idx" ON "SocialPost" ("workspaceId","createdAt" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "SocialPost_workspaceId_status_idx" ON "SocialPost" ("workspaceId","status");--> statement-breakpoint
CREATE UNIQUE INDEX "SocialPost_workspaceId_idempotencyKey_key" ON "SocialPost" ("workspaceId","idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "SocialPost_createdById_idx" ON "SocialPost" ("createdById") WHERE "createdById" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "SocialPost_parentSocialPostId_idx" ON "SocialPost" ("parentSocialPostId") WHERE "parentSocialPostId" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "SocialPost_parentSocialPostId_occurrenceAt_key" ON "SocialPost" ("parentSocialPostId","occurrenceAt") WHERE "parentSocialPostId" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "SocialPostTargetMedia_socialPostTargetId_position_key" ON "SocialPostTargetMedia" ("socialPostTargetId","position");--> statement-breakpoint
CREATE INDEX "SocialPostTargetMedia_workspaceId_idx" ON "SocialPostTargetMedia" ("workspaceId");--> statement-breakpoint
CREATE INDEX "SocialPostTargetMedia_mediaLibraryFileId_idx" ON "SocialPostTargetMedia" ("mediaLibraryFileId") WHERE "mediaLibraryFileId" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "SocialPostTarget_socialPostId_destination_key" ON "SocialPostTarget" ("socialPostId","publishDestinationId");--> statement-breakpoint
CREATE INDEX "SocialPostTarget_workspaceId_idx" ON "SocialPostTarget" ("workspaceId");--> statement-breakpoint
CREATE INDEX "SocialPostTarget_publishDestinationId_idx" ON "SocialPostTarget" ("publishDestinationId");--> statement-breakpoint
CREATE INDEX "SocialPostTarget_due_idx" ON "SocialPostTarget" ("nextAttemptAt","id") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "SocialPostTarget_lease_idx" ON "SocialPostTarget" ("leaseExpiresAt","id") WHERE "status" IN ('publishing', 'processing');--> statement-breakpoint
CREATE UNIQUE INDEX "SocialPostTarget_destination_queueSlotAt_key" ON "SocialPostTarget" ("publishDestinationId","queueSlotAt") WHERE "queueSlotAt" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "SocialPostTarget_workspaceId_scheduledAt_idx" ON "SocialPostTarget" ("workspaceId","scheduledAt") WHERE "scheduledAt" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "SocialPostTarget_channelPostId_idx" ON "SocialPostTarget" ("channelPostId") WHERE "channelPostId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "SocialPostTarget_quotaChargePending_idx" ON "SocialPostTarget" ("id") WHERE "quotaChargePending";--> statement-breakpoint
CREATE UNIQUE INDEX "SocialPostTargetPart_socialPostTargetId_position_key" ON "SocialPostTargetPart" ("socialPostTargetId","position");--> statement-breakpoint
CREATE UNIQUE INDEX "SocialPostTargetPart_firstComment_key" ON "SocialPostTargetPart" ("socialPostTargetId") WHERE "kind" = 'firstComment';--> statement-breakpoint
CREATE INDEX "SocialPostTargetPart_workspaceId_idx" ON "SocialPostTargetPart" ("workspaceId");--> statement-breakpoint
CREATE INDEX "SocialPostTargetPart_due_idx" ON "SocialPostTargetPart" ("nextAttemptAt","id") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "SocialPostTargetPart_lease_idx" ON "SocialPostTargetPart" ("leaseExpiresAt","id") WHERE "status" IN ('publishing', 'processing');--> statement-breakpoint
CREATE INDEX "SocialPostToPostTopic_postTopicId_idx" ON "SocialPostToPostTopic" ("postTopicId");--> statement-breakpoint
CREATE UNIQUE INDEX "SocialPostFeedDestination_feedId_destinationId_key" ON "SocialPostFeedDestination" ("feedId","publishDestinationId");--> statement-breakpoint
CREATE INDEX "SocialPostFeedDestination_destinationId_idx" ON "SocialPostFeedDestination" ("publishDestinationId");--> statement-breakpoint
CREATE INDEX "SocialPostFeedDestination_workspaceId_idx" ON "SocialPostFeedDestination" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "SocialPostFeedItem_feedId_itemKey_key" ON "SocialPostFeedItem" ("feedId","itemKey");--> statement-breakpoint
CREATE INDEX "SocialPostFeedItem_feedId_createdAt_idx" ON "SocialPostFeedItem" ("feedId","createdAt" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "SocialPostFeedItem_workspaceId_idx" ON "SocialPostFeedItem" ("workspaceId");--> statement-breakpoint
CREATE INDEX "SocialPostFeedItem_socialPostId_idx" ON "SocialPostFeedItem" ("socialPostId") WHERE "socialPostId" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "SocialPostFeed_workspaceId_feedUrl_key" ON "SocialPostFeed" ("workspaceId","feedUrl");--> statement-breakpoint
CREATE INDEX "SocialPostFeed_due_idx" ON "SocialPostFeed" ("nextCheckAt","id") WHERE "status" = 'active';--> statement-breakpoint
CREATE INDEX "SocialPostFeed_signatureId_idx" ON "SocialPostFeed" ("signatureId") WHERE "signatureId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "SocialPostFeed_createdById_idx" ON "SocialPostFeed" ("createdById") WHERE "createdById" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "SocialPostRecurrence_socialPostId_key" ON "SocialPostRecurrence" ("socialPostId");--> statement-breakpoint
CREATE INDEX "SocialPostRecurrence_workspaceId_idx" ON "SocialPostRecurrence" ("workspaceId");--> statement-breakpoint
CREATE INDEX "SocialPostRecurrence_due_idx" ON "SocialPostRecurrence" ("nextRunAt","id") WHERE "endedAt" IS NULL AND "pausedAt" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "SocialPostRecurrenceOccurrence_recurrenceId_localSlot_occurrenceAt_key" ON "SocialPostRecurrenceOccurrence" ("recurrenceId","localSlot","occurrenceAt");--> statement-breakpoint
CREATE INDEX "SocialPostRecurrenceOccurrence_recurrenceId_occurrenceAt_idx" ON "SocialPostRecurrenceOccurrence" ("recurrenceId","occurrenceAt" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "SocialPostRecurrenceOccurrence_workspaceId_idx" ON "SocialPostRecurrenceOccurrence" ("workspaceId");--> statement-breakpoint
CREATE INDEX "SocialPostRecurrenceOccurrence_socialPostId_idx" ON "SocialPostRecurrenceOccurrence" ("socialPostId") WHERE "socialPostId" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "SocialPostSnippet_workspaceId_name_key" ON "SocialPostSnippet" ("workspaceId","name");--> statement-breakpoint
CREATE INDEX "SocialPostTargetSetDestination_workspaceId_idx" ON "SocialPostTargetSetDestination" ("workspaceId");--> statement-breakpoint
CREATE INDEX "SocialPostTargetSetDestination_destinationId_idx" ON "SocialPostTargetSetDestination" ("publishDestinationId");--> statement-breakpoint
CREATE UNIQUE INDEX "SocialPostTargetSet_workspaceId_name_key" ON "SocialPostTargetSet" ("workspaceId","name");--> statement-breakpoint
ALTER TABLE "ChannelPostSync" ADD CONSTRAINT "ChannelPostSync_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ChannelPostSync" ADD CONSTRAINT "ChannelPostSync_inboxId_Inbox_id_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ChannelPostToPostTopic" ADD CONSTRAINT "ChannelPostToPostTopic_channelPostId_ChannelPost_id_fkey" FOREIGN KEY ("channelPostId") REFERENCES "ChannelPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ChannelPostToPostTopic" ADD CONSTRAINT "ChannelPostToPostTopic_postTopicId_PostTopic_id_fkey" FOREIGN KEY ("postTopicId") REFERENCES "PostTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PostTopic" ADD CONSTRAINT "PostTopic_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PublishDestination" ADD CONSTRAINT "PublishDestination_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PublishDestination" ADD CONSTRAINT "PublishDestination_inboxId_Inbox_id_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PublishDestination" ADD CONSTRAINT "PublishDestination_mKNaIthfKh3k_fkey" FOREIGN KEY ("socialAccountDestinationId") REFERENCES "SocialAccountDestination"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PublishDestinationSchedule" ADD CONSTRAINT "PublishDestinationSchedule_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PublishDestinationSchedule" ADD CONSTRAINT "PublishDestinationSchedule_1tAF0maUExgt_fkey" FOREIGN KEY ("publishDestinationId") REFERENCES "PublishDestination"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialAccountDestination" ADD CONSTRAINT "SocialAccountDestination_socialAccountId_SocialAccount_id_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialAccountDestination" ADD CONSTRAINT "SocialAccountDestination_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_connectedById_User_id_fkey" FOREIGN KEY ("connectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostMedia" ADD CONSTRAINT "SocialPostMedia_socialPostId_SocialPost_id_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostMedia" ADD CONSTRAINT "SocialPostMedia_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostMedia" ADD CONSTRAINT "SocialPostMedia_mediaLibraryFileId_MediaLibraryFile_id_fkey" FOREIGN KEY ("mediaLibraryFileId") REFERENCES "MediaLibraryFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_createdById_User_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_parentSocialPostId_SocialPost_id_fkey" FOREIGN KEY ("parentSocialPostId") REFERENCES "SocialPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostTargetMedia" ADD CONSTRAINT "SocialPostTargetMedia_vSjPZOVF6bZH_fkey" FOREIGN KEY ("socialPostTargetId") REFERENCES "SocialPostTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostTargetMedia" ADD CONSTRAINT "SocialPostTargetMedia_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostTargetMedia" ADD CONSTRAINT "SocialPostTargetMedia_GrhbD3C9bddV_fkey" FOREIGN KEY ("mediaLibraryFileId") REFERENCES "MediaLibraryFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostTarget" ADD CONSTRAINT "SocialPostTarget_socialPostId_SocialPost_id_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostTarget" ADD CONSTRAINT "SocialPostTarget_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostTarget" ADD CONSTRAINT "SocialPostTarget_ey7N7e0vV6dF_fkey" FOREIGN KEY ("publishDestinationId") REFERENCES "PublishDestination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostTarget" ADD CONSTRAINT "SocialPostTarget_channelPostId_ChannelPost_id_fkey" FOREIGN KEY ("channelPostId") REFERENCES "ChannelPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostTargetPart" ADD CONSTRAINT "SocialPostTargetPart_7Xobty49Mzsw_fkey" FOREIGN KEY ("socialPostTargetId") REFERENCES "SocialPostTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostTargetPart" ADD CONSTRAINT "SocialPostTargetPart_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostToPostTopic" ADD CONSTRAINT "SocialPostToPostTopic_socialPostId_SocialPost_id_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostToPostTopic" ADD CONSTRAINT "SocialPostToPostTopic_postTopicId_PostTopic_id_fkey" FOREIGN KEY ("postTopicId") REFERENCES "PostTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostFeedDestination" ADD CONSTRAINT "SocialPostFeedDestination_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostFeedDestination" ADD CONSTRAINT "SocialPostFeedDestination_feedId_SocialPostFeed_id_fkey" FOREIGN KEY ("feedId") REFERENCES "SocialPostFeed"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostFeedDestination" ADD CONSTRAINT "SocialPostFeedDestination_j41Ilb0Zj37o_fkey" FOREIGN KEY ("publishDestinationId") REFERENCES "PublishDestination"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostFeedItem" ADD CONSTRAINT "SocialPostFeedItem_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostFeedItem" ADD CONSTRAINT "SocialPostFeedItem_feedId_SocialPostFeed_id_fkey" FOREIGN KEY ("feedId") REFERENCES "SocialPostFeed"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostFeedItem" ADD CONSTRAINT "SocialPostFeedItem_socialPostId_SocialPost_id_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostFeed" ADD CONSTRAINT "SocialPostFeed_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostFeed" ADD CONSTRAINT "SocialPostFeed_signatureId_SocialPostSnippet_id_fkey" FOREIGN KEY ("signatureId") REFERENCES "SocialPostSnippet"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostFeed" ADD CONSTRAINT "SocialPostFeed_createdById_User_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostRecurrence" ADD CONSTRAINT "SocialPostRecurrence_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostRecurrence" ADD CONSTRAINT "SocialPostRecurrence_socialPostId_SocialPost_id_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostRecurrenceOccurrence" ADD CONSTRAINT "SocialPostRecurrenceOccurrence_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostRecurrenceOccurrence" ADD CONSTRAINT "SocialPostRecurrenceOccurrence_WXGgCGtrtjK2_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "SocialPostRecurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostRecurrenceOccurrence" ADD CONSTRAINT "SocialPostRecurrenceOccurrence_socialPostId_SocialPost_id_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostSnippet" ADD CONSTRAINT "SocialPostSnippet_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostTargetSetDestination" ADD CONSTRAINT "SocialPostTargetSetDestination_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostTargetSetDestination" ADD CONSTRAINT "SocialPostTargetSetDestination_i2MJcrbZRK9s_fkey" FOREIGN KEY ("targetSetId") REFERENCES "SocialPostTargetSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostTargetSetDestination" ADD CONSTRAINT "SocialPostTargetSetDestination_r5mvx3giLpVf_fkey" FOREIGN KEY ("publishDestinationId") REFERENCES "PublishDestination"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SocialPostTargetSet" ADD CONSTRAINT "SocialPostTargetSet_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
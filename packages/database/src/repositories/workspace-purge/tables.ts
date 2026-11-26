export const HEAVY_WORKSPACE_TABLES = [
  "ErrorLog",
  "AuditLog",
  "InboundWebhookRequest",
  "CommentAutomationEvent",
  "CommentAutomationReply",
  "CommentModerationLog",
  "TriggerStat",
  "FlowNodeStat",
  "MagicLinkStat",
  "RefLinkStat",
  "MetaCapiEvent",
  "AdsConversionEvent",
  "GoogleAdsConversionEvent",
  // Parent of the two conversion tables (SET NULL), so it drains after them.
  "ContactReferralEvent",
  "LeaderboardAuditLog",
  "LeaderboardParticipant",
  "AIConversationEmbedding",
  "AIEmbedding",
  // Items before their run; mappings can reach tens of thousands per page.
  "ContactSyncRunItem",
  "ContactSyncRun",
  "ContactSyncMapping",
  "TriggerExecution",
  "FlowRun",
  "FlowVersion",
  "ContactOnSmartDelay",
  // The feed ledger before the posts it points at (its post link is SET NULL):
  // one row per feed item, the one feed table that grows without bound.
  "SocialPostFeedItem",
  // The recurring-post ledger first, then its series (the ledger's post link is
  // SET NULL, the series' is CASCADE), before the posts themselves.
  "SocialPostRecurrenceOccurrence",
  "SocialPostRecurrence",
  // The dependents of a publish destination that cascade from it (feed members,
  // target-set members, the posting schedule): drained in bounded batches before
  // the targets and the binding, so the binding's own delete cascades nothing large.
  "SocialPostFeedDestination",
  "SocialPostTargetSetDestination",
  "PublishDestinationSchedule",
  // Target media cascades from its target; targets drain before their
  // destination (RESTRICT) and before the post (CASCADE).
  // Parts cascade from their target too and drain first: a long thread is the
  // one child table that can hold many rows per target.
  "SocialPostTargetPart",
  "SocialPostTargetMedia",
  "SocialPostTarget",
  // The binding itself, after the targets that RESTRICT it and its dependents.
  "PublishDestination",
  // After their targets, before the post itself: files and, last, the posts.
  // (The topic links drain earlier, in `PARTITIONED_WORKSPACE_TABLES`, joined
  // through their post: that table has no `workspaceId` of its own.)
  "SocialPostMedia",
  // Up to 10,000 per workspace; the post link is SET NULL, so order is free,
  // but draining them here keeps the final cascade small.
  "SocialPost",
  // Every post of every connected page is synced (backfill), so this is a
  // high-volume table. Its topic links drain earlier (partitioned stage); the
  // targets that point at it (SET NULL) drained above, so no per-row SET NULL.
  "ChannelPost",
  // Child of Conversation (cascade), so it drains before it.
  "MessageTranslation",
  // Child of Conversation (cascade), so it drains before it.
  "ConversationParticipant",
  "Conversation",
  "Contact",
] as const

export const PARTITIONED_WORKSPACE_TABLES = [
  {
    // No `workspaceId` column: selected through the post, and drained before the
    // heavy stage deletes the posts.
    primaryKey: ["socialPostId", "postTopicId"],
    selector: "socialPostWorkspace",
    table: "SocialPostToPostTopic",
  },
  {
    // Same shape as the social-post links: no `workspaceId`, selected through
    // the channel post (which has one and is drained in the heavy stage).
    primaryKey: ["channelPostId", "postTopicId"],
    selector: "channelPostWorkspace",
    table: "ChannelPostToPostTopic",
  },
  {
    primaryKey: ["broadcastId", "contactId"],
    selector: "broadcastWorkspace",
    table: "ContactOnBroadcast",
  },
  {
    primaryKey: ["id", "workspaceId"],
    selector: "workspace",
    table: "SequenceDispatch",
  },
  {
    // Append-only pipeline history with no contact FK: drained here so the
    // final workspace delete does not cascade millions of rows at once.
    primaryKey: ["id", "workspaceId"],
    selector: "workspace",
    table: "PipelineItemActivity",
  },
  {
    // No FKs: drained here so the final workspace delete has nothing to scan.
    primaryKey: [
      "workspaceId",
      "sourceType",
      "sourceId",
      "infoType",
      "contactId",
    ],
    selector: "workspace",
    table: "ContactInfoCapture",
  },
  {
    primaryKey: ["workspaceId", "hourBucket", "contactInboxId"],
    selector: "workspace",
    table: "ContactActiveHourly",
  },
  {
    primaryKey: ["workspaceId", "periodStart", "contactInboxId"],
    selector: "workspace",
    table: "ContactActiveMonthly",
  },
  {
    // Post-metric snapshots: no FKs, monthly partitions, drained by workspace
    // before the final delete (the posts they describe are never hard-deleted).
    primaryKey: ["workspaceId", "day", "channelPostId"],
    selector: "workspace",
    table: "ChannelPostMetricDaily",
  },
] as const

export const WORKSPACE_ANALYTICS_HYPERTABLES = [
  "AnalyticsAgentResponseEvent",
  "AnalyticsBotMessageEvent",
  "AnalyticsContactEvent",
  "AnalyticsConversationEvent",
  "AnalyticsMessageEvent",
] as const
export const NO_FK_WORKSPACE_TABLES = [
  {
    stage: "ctid",
    table: "CoexistSyncRun",
  },
  {
    stage: "contactActivity",
    table: "ContactActivity",
  },
  {
    stage: "contactActivity",
    table: "ContactKeywordMessage",
  },
  {
    stage: "contactActivity",
    table: "ContactState",
  },
  {
    stage: "ctid",
    table: "FlowAnalyticsSession",
  },
  {
    stage: "partitioned",
    table: "ContactInfoCapture",
  },
  {
    stage: "partitioned",
    table: "ContactActiveHourly",
  },
  {
    stage: "partitioned",
    table: "ContactActiveMonthly",
  },
  {
    stage: "partitioned",
    table: "ChannelPostMetricDaily",
  },
  {
    stage: "ctid",
    table: "MessageCleanup",
  },
  { stage: "contactInboxPost", table: "ContactInboxPost" },
  {
    stage: "leaderboard",
    table: "LeaderboardScoreEvent",
  },
  { stage: "hypertable", table: "Message" },
  { stage: "hypertable", table: "Attachment" },
  { stage: "retainedBilling", table: "WorkspaceMac" },
  {
    stage: "retainedBilling",
    table: "WorkspaceBotMessageUsage",
  },
  {
    stage: "retainedBilling",
    table: "WorkspaceDeletionRecord",
  },
  // Not billing: "retained" is the point — the trail of who deleted a workspace
  // must outlive it, so this table is never drained (same stage as the above).
  {
    stage: "retainedBilling",
    table: "ResourceDeletionLog",
  },
] as const

export type HeavyWorkspaceTable = (typeof HEAVY_WORKSPACE_TABLES)[number]
export type PartitionedWorkspaceTable =
  (typeof PARTITIONED_WORKSPACE_TABLES)[number]
export type WorkspaceAnalyticsHypertable =
  (typeof WORKSPACE_ANALYTICS_HYPERTABLES)[number]
export type NoFkWorkspaceTable =
  (typeof NO_FK_WORKSPACE_TABLES)[number]["table"]
export type WorkspacePurgeTable =
  | HeavyWorkspaceTable
  | NoFkWorkspaceTable
  | PartitionedWorkspaceTable["table"]
  | WorkspaceAnalyticsHypertable

export const HEAVY_WORKSPACE_TABLES = [
  "ErrorLog",
  "AuditLog",
  "InboundWebhookRequest",
  "CommentAutomationEvent",
  "CommentAutomationReply",
  "TriggerStat",
  "FlowNodeStat",
  "MagicLinkStat",
  "RefLinkStat",
  "MetaCapiEvent",
  "AdsConversionEvent",
  "GoogleAdsConversionEvent",
  "LeaderboardAuditLog",
  "LeaderboardParticipant",
  "AIConversationEmbedding",
  "AIEmbedding",
  "TriggerExecution",
  "FlowRun",
  "FlowVersion",
  "ContactOnSmartDelay",
  "Conversation",
  "Contact",
] as const

export const PARTITIONED_WORKSPACE_TABLES = [
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
    primaryKey: ["workspaceId", "hourBucket", "contactInboxId"],
    selector: "workspace",
    table: "ContactActiveHourly",
  },
  {
    primaryKey: ["workspaceId", "periodStart", "contactInboxId"],
    selector: "workspace",
    table: "ContactActiveMonthly",
  },
] as const

export const WORKSPACE_ANALYTICS_HYPERTABLES = [
  "AnalyticsAgentResponseEvent",
  "AnalyticsBotMessageEvent",
  "AnalyticsBroadcastEvent",
  "AnalyticsContactEvent",
  "AnalyticsConversationEvent",
  "AnalyticsFlowNodeEvent",
  "AnalyticsMessageEvent",
  "AnalyticsSequenceEvent",
] as const
export const NO_FK_WORKSPACE_TABLES = [
  {
    stage: "ctid",
    table: "CoexistSyncRun",
  },
  {
    stage: "ctid",
    table: "FlowAnalyticsSession",
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

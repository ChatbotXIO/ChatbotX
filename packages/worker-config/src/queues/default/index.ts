import type {
  BroadcastEventType,
  CommentAutomationEventType,
  SequenceStepEventType,
} from "@chatbotx.io/analytics/schemas"
import type {
  ChannelType,
  CouponIssueStatus,
  CouponUsageStatus,
} from "@chatbotx.io/database/partials"
import {
  appointmentExternalSyncOperations,
  type PipelineActorKind,
} from "@chatbotx.io/database/partials"
import type { ContactFilterCriteriaInput } from "@chatbotx.io/database/queries"
import { Queue } from "bullmq"
import { z } from "zod"
import {
  defaultJobOptions,
  fakeQueue,
  getQueueConnection,
  isNoRedisEnv,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"

export const defaultQueue = isNoRedisEnv()
  ? fakeQueue
  : new Queue<DefaultJobData>(queueNames.enum.default, {
      connection: getQueueConnection(queueNames.enum.default),
      defaultJobOptions,
    })

export const DefaultJobAction = {
  exportContacts: "exportContacts",
  exportCoupons: "exportCoupons",
  exportLeaderboardParticipants: "exportLeaderboardParticipants",
  bulkTagContacts: "bulkTagContacts",
  runImport: "runImport",
  sendAuditLog: "sendAuditLog",
  syncTag: "syncTag",
  syncChannelLabels: "syncChannelLabels",
  importMetaCatalogProducts: "importMetaCatalogProducts",
  submitMetaCatalogSync: "submitMetaCatalogSync",
  checkMetaCatalogSync: "checkMetaCatalogSync",
  syncExternalCalendarEvent: "syncExternalCalendarEvent",
  sendAppointmentReminder: "sendAppointmentReminder",
  installTemplate: "installTemplate",
  syncWelcomeMessageFlows: "syncWelcomeMessageFlows",
  deleteWelcomeMessageFlows: "deleteWelcomeMessageFlows",
  processInboundWebhookRequest: "processInboundWebhookRequest",
  retryRealtimeMemberRevoke: "retryRealtimeMemberRevoke",
  processPipelineStageBulk: "processPipelineStageBulk",
} as const

export const syncExternalCalendarEventJobId = (
  appointmentId: string,
  operation: string,
) => `sync-external-event-${appointmentId}-${operation}`

export const sendAppointmentReminderJobId = (
  appointmentId: string,
  reminderConfigId: string,
) => `appt-reminder-${appointmentId}-${reminderConfigId}`

export type ExportContactsFilter = {
  keyword?: string
  contactFilter?: ContactFilterCriteriaInput
}

export type JobExportContacts = {
  type: typeof DefaultJobAction.exportContacts
  data: {
    // Optional: a workspace-token (public API) export has no session user.
    // `runJobWithAuditContext` falls back to `SYSTEM_ACTOR` and
    // `auditService.record`'s `userId` is itself optional, so every consumer
    // already tolerates this — `fileModel.userId` is nullable too.
    requestedUserId?: string
    workspaceId: string
    fileId: string
    fields: string[]
    // Required so the export always states email/phone visibility explicitly and
    // can never fail open: an omitted flag must not silently re-enable export.
    canExportEmailAndPhone: boolean
    restrictToAssignedUserId?: string
    outputPath: string
    outputFormat: "csv"
    ipAddress?: string
    userAgent?: string
  } & (
    | { contactIds: string[]; filter?: undefined }
    | { contactIds?: undefined; filter: ExportContactsFilter }
  )
}

export type ExportCouponsFilter = {
  topicId?: string
  issueStatus?: CouponIssueStatus
  usageStatus?: CouponUsageStatus
  search?: string
}

export type JobExportLeaderboardParticipants = {
  type: typeof DefaultJobAction.exportLeaderboardParticipants
  data: {
    workspaceId: string
    leaderboardId: string
    fileId: string
    outputPath: string
    /** Phone/email columns — only when the requester may see contact info. */
    includeContactInfo?: boolean
  }
}

export type JobExportCoupons = {
  type: typeof DefaultJobAction.exportCoupons
  data: {
    requestedUserId: string
    workspaceId: string
    fileId: string
    outputPath: string
    outputFormat: "csv"
    filter?: ExportCouponsFilter
  }
}

export type JobBulkTagContacts = {
  type: typeof DefaultJobAction.bulkTagContacts
  data: {
    workspaceId: string
    requestedUserId: string
    tagIds: string[]
    excludedContactIds: string[]
    restrictToAssignedUserId?: string
  } & (
    | {
        source: "broadcast"
        broadcastId: string
        eventType: BroadcastEventType
      }
    | {
        source: "sequenceStep"
        sequenceId: string
        stepId: string
        eventType: SequenceStepEventType
      }
    | {
        source: "commentAutomation"
        automationId: string
        eventType: CommentAutomationEventType
      }
  )
}

export type JobRunImport = {
  type: typeof DefaultJobAction.runImport
  data: {
    importId: string
    ipAddress?: string
    userAgent?: string
  }
}

export type JobSendAuditLog = {
  type: typeof DefaultJobAction.sendAuditLog
  data: {
    auditLogId?: string
    userId: string
    workspaceId: string
    action: string
    detail: string
    ipAddress?: string
    userAgent?: string
    source?: string
  }
}

/**
 * Single tag-sync job. The `action` discriminator selects the operation the
 * worker runs (create label / attach to contact / detach from contact / delete
 * tag) so all four share one queue + one handler.
 */
export type JobSyncTag = {
  type: typeof DefaultJobAction.syncTag
  data:
    | { action: "create"; workspaceId: string; tagId: string }
    | {
        action: "attach"
        workspaceId: string
        contactId: string
        tagId: string
      }
    | {
        action: "detach"
        workspaceId: string
        contactId: string
        tagId: string
      }
    | {
        action: "delete"
        workspaceId: string
        tagId: string
        // Scope the delete to a single channel (inbound webhook): only that
        // channel's mappings + the contacts tagged via it are removed, the Tag
        // row stays. When omitted, the tag is deleted everywhere (the Tag row
        // included) — see delete-tag-action.
        channelType?: ChannelType
        integrationId?: string
      }
}

export type JobSyncChannelLabels = {
  type: typeof DefaultJobAction.syncChannelLabels
  data: {
    workspaceId: string
    channelType: ChannelType
    integrationId: string
  }
}

export type JobSubmitMetaCatalogSync = {
  type: typeof DefaultJobAction.submitMetaCatalogSync
  data: {
    workspaceId: string
    runId: string
    /** Set only by the stale-run reconciler; normal BullMQ retries cannot steal. */
    recovery?: boolean
  }
}

export type JobImportMetaCatalogProducts = {
  type: typeof DefaultJobAction.importMetaCatalogProducts
  data: {
    workspaceId: string
    integrationMetaCatalogId: string
    /**
     * The history row to report progress into. Optional so jobs already queued
     * without one keep draining instead of failing on a missing field.
     */
    runId?: string
  }
}

export type JobCheckMetaCatalogSync = {
  type: typeof DefaultJobAction.checkMetaCatalogSync
  data: {
    workspaceId: string
    runId: string
    attempt: number
  }
}

export const jobSyncExternalCalendarEventDataSchema = z.object({
  workspaceId: z.string(),
  appointmentId: z.string(),
  operation: appointmentExternalSyncOperations,
})
export type JobSyncExternalCalendarEventData = z.infer<
  typeof jobSyncExternalCalendarEventDataSchema
>

export type JobSyncExternalCalendarEvent = {
  type: typeof DefaultJobAction.syncExternalCalendarEvent
  data: JobSyncExternalCalendarEventData
}

export const jobSendAppointmentReminderDataSchema = z.object({
  workspaceId: z.string(),
  appointmentId: z.string(),
  reminderDispatchId: z.string(),
  reminderConfigId: z.string(),
})
export type JobSendAppointmentReminderData = z.infer<
  typeof jobSendAppointmentReminderDataSchema
>

export type JobSendAppointmentReminder = {
  type: typeof DefaultJobAction.sendAppointmentReminder
  data: JobSendAppointmentReminderData
}

export type JobInstallTemplate = {
  type: typeof DefaultJobAction.installTemplate
  data: {
    installationId: string
    workspaceId: string
  }
}

/**
 * Mirror a flow's published start node (or just its name, for `rename`) to a
 * Meta welcome message flow on every Messenger page of the workspace.
 * Debounced per `(reason, flowId)`; the handler always reads current state.
 */
export type JobSyncWelcomeMessageFlows = {
  type: typeof DefaultJobAction.syncWelcomeMessageFlows
  data: {
    workspaceId: string
    flowId: string
    reason: "publish" | "rename"
  }
}

/**
 * Best-effort DELETE of every Meta welcome message flow recorded for the
 * (already hard-deleted) flows. Rows are read inside the job, under the
 * per-flow lock, so a create racing the delete is still cleaned up.
 */
export type JobDeleteWelcomeMessageFlows = {
  type: typeof DefaultJobAction.deleteWelcomeMessageFlows
  data: { workspaceId: string; flowIds: string[] }
}

/** Redis lock serializing every welcome-message-flow job of one flow. */
export const welcomeMessageFlowLockKey = (flowId: string) =>
  `welcome-message-flow-${flowId}`

/**
 * Applies one stored inbound-webhook delivery (resolve inbox, find or create the
 * contact, write fields, run actions). The `InboundWebhookRequest` row is the
 * source of truth; this job only says "process this id", so it can be
 * re-enqueued any number of times (the handler claims the row atomically).
 */
export type JobProcessInboundWebhookRequest = {
  type: typeof DefaultJobAction.processInboundWebhookRequest
  data: {
    workspaceId: string
    inboundWebhookId: string
    requestId: string
  }
}

/** Deterministic, so re-enqueueing a request that is still queued is a no-op. */
export const processInboundWebhookRequestJobId = (requestId: string) =>
  `inbound-webhook-request-${requestId}`

/**
 * Enqueues the processing of one inbound-webhook request. The job id dedupes
 * jobs that are waiting, delayed or active; finished jobs, completed or failed,
 * are never kept (`removeOnComplete` / `removeOnFail: true`). A job that
 * ends while its request is still unfinished — a stalled retry that found the
 * dead worker's lease still held, a blocked owner — must not block the
 * re-dispatch cron from enqueueing the same request again; the atomic claim
 * already makes a duplicate job harmless.
 */
export const enqueueProcessInboundWebhookRequest = async (
  data: JobProcessInboundWebhookRequest["data"],
): Promise<void> => {
  await defaultQueue.add(
    DefaultJobAction.processInboundWebhookRequest,
    { type: DefaultJobAction.processInboundWebhookRequest, data },
    {
      jobId: processInboundWebhookRequestJobId(data.requestId),
      removeOnComplete: true,
      // The request row is the outbox, so a failed job has nothing left to say.
      // Kept, it would make the next add() with this id a no-op and the re-dispatch
      // of the unfinished request could not enqueue it.
      removeOnFail: true,
    },
  )
}

export type JobRetryRealtimeMemberRevoke = {
  type: typeof DefaultJobAction.retryRealtimeMemberRevoke
  data: {
    reason: "deleted" | "reauth"
    revokedAtMs: number
    userId: string
    workspaceId: string
  }
}

/**
 * Deletes a pipeline stage whose items are too many to settle inside one
 * request: moves or deletes them in bounded batches, then drops the stage.
 * Idempotent — a retry only sees the items still in the stage.
 */
export type JobProcessPipelineStageBulk = {
  type: typeof DefaultJobAction.processPipelineStageBulk
  data: {
    workspaceId: string
    pipelineId: string
    stageId: string
    /** The claim written to `PipelineStage.bulkJobId`; the job acts only while it still owns the stage. */
    bulkJobId: string
    moveItemsToStageId: string | null
    actorUserId: string | null
    /** Who started the removal. */
    actorKind: PipelineActorKind
    /** Workspace token, flow or trigger id for non-user actors. */
    actorSourceId: string | null
  }
}

export type DefaultJobData =
  | JobProcessPipelineStageBulk
  | JobRetryRealtimeMemberRevoke
  | JobProcessInboundWebhookRequest
  | JobSyncWelcomeMessageFlows
  | JobDeleteWelcomeMessageFlows
  | JobExportContacts
  | JobExportCoupons
  | JobExportLeaderboardParticipants
  | JobBulkTagContacts
  | JobRunImport
  | JobSendAuditLog
  | JobSyncTag
  | JobSyncChannelLabels
  | JobImportMetaCatalogProducts
  | JobSubmitMetaCatalogSync
  | JobCheckMetaCatalogSync
  | JobSyncExternalCalendarEvent
  | JobSendAppointmentReminder
  | JobInstallTemplate

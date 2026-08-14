import type {
  BroadcastEventType,
  SequenceStepEventType,
} from "@chatbotx.io/analytics/schemas"
import type {
  ChannelType,
  CouponIssueStatus,
  CouponUsageStatus,
} from "@chatbotx.io/database/partials"
import { appointmentExternalSyncOperations } from "@chatbotx.io/database/partials"
import type { ContactFilterCriteriaInput } from "@chatbotx.io/database/queries"
import { Queue } from "bullmq"
import { z } from "zod"
import {
  defaultJobOptions,
  fakeQueue,
  getRedisConnection,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"

export const defaultQueue =
  process.env.NEXT_PHASE === "phase-production-build"
    ? fakeQueue
    : new Queue<DefaultJobData>(queueNames.enum.default, {
        connection: getRedisConnection(),
        defaultJobOptions,
      })

export const DefaultJobAction = {
  exportContacts: "exportContacts",
  exportCoupons: "exportCoupons",
  bulkTagContacts: "bulkTagContacts",
  runImport: "runImport",
  sendErrorLog: "sendErrorLog",
  sendAuditLog: "sendAuditLog",
  syncTag: "syncTag",
  syncChannelLabels: "syncChannelLabels",
  importMetaCatalogProducts: "importMetaCatalogProducts",
  submitMetaCatalogSync: "submitMetaCatalogSync",
  checkMetaCatalogSync: "checkMetaCatalogSync",
  syncExternalCalendarEvent: "syncExternalCalendarEvent",
  sendAppointmentReminder: "sendAppointmentReminder",
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
    requestedUserId: string
    workspaceId: string
    fileId: string
    fields: string[]
    // Required so the export always states email/phone visibility explicitly and
    // can never fail open: an omitted flag must not silently re-enable export.
    canExportEmailAndPhone: boolean
    restrictToAssignedUserId?: string
    outputPath: string
    outputFormat: "csv"
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
  )
}

export type JobRunImport = {
  type: typeof DefaultJobAction.runImport
  data: {
    importId: string
  }
}

export type JobSendErrorLog = {
  type: typeof DefaultJobAction.sendErrorLog
  data: {
    workspaceId: string
    error: {
      message: string
      stack?: string
      httpCode: string
    }
  }
}

export type JobSendAuditLog = {
  type: typeof DefaultJobAction.sendAuditLog
  data: {
    userId: string
    workspaceId: string
    action: string
    detail: string
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

export type DefaultJobData =
  | JobExportContacts
  | JobExportCoupons
  | JobBulkTagContacts
  | JobRunImport
  | JobSendErrorLog
  | JobSendAuditLog
  | JobSyncTag
  | JobSyncChannelLabels
  | JobImportMetaCatalogProducts
  | JobSubmitMetaCatalogSync
  | JobCheckMetaCatalogSync
  | JobSyncExternalCalendarEvent
  | JobSendAppointmentReminder

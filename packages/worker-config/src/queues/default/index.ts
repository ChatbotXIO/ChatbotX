import type { ChannelType } from "@chatbotx.io/database/partials"
import type { ContactFilterCriteriaInput } from "@chatbotx.io/database/queries"
import { Queue } from "bullmq"
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
  runImport: "runImport",
  sendErrorLog: "sendErrorLog",
  sendAuditLog: "sendAuditLog",
  syncTag: "syncTag",
  syncChannelLabels: "syncChannelLabels",
} as const

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
    // Required so the export always states PII visibility explicitly and can
    // never fail open: an omitted flag must not silently re-enable PII export.
    canExportEmailAndPhone: boolean
    restrictToAssignedUserId?: string
    outputPath: string
    outputFormat: "csv"
  } & (
    | { contactIds: string[]; filter?: undefined }
    | { contactIds?: undefined; filter: ExportContactsFilter }
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

export type DefaultJobData =
  | JobExportContacts
  | JobRunImport
  | JobSendErrorLog
  | JobSendAuditLog
  | JobSyncTag
  | JobSyncChannelLabels

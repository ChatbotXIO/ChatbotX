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

export type DefaultJobData =
  | JobExportContacts
  | JobRunImport
  | JobSendErrorLog
  | JobSendAuditLog

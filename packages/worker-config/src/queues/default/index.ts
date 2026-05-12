import { defineQueue } from "../../lib/define-queue"

export const DefaultJobAction = {
  exportContacts: "exportContacts",
  sendErrorLog: "sendErrorLog",
  sendAuditLog: "sendAuditLog",
} as const

export type JobExportContacts = {
  type: typeof DefaultJobAction.exportContacts
  data: {
    requestedUserId: string
    workspaceId: string
    fields: string[]
    contactIds: string[]
    outputPath: string
    outputFormat: "csv"
    cursor?: {
      createdAt: string
      id: string
    }
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
  | JobSendErrorLog
  | JobSendAuditLog

export const defaultQueue = defineQueue<DefaultJobData>("default")

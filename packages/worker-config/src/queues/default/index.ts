import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getRedisConnection,
} from "../../lib/connection"
import { queueName } from "../../lib/types"

export const defaultQueue =
  process.env.NEXT_PHASE === "phase-production-build"
    ? fakeQueue
    : new Queue<DefaultJobData>(queueName.default, {
        connection: getRedisConnection(),
        defaultJobOptions,
      })

export const DefaultJobAction = {
  exportContacts: "exportContacts",
  sendErrorLog: "sendErrorLog",
  sendAuditLog: "sendAuditLog",
} as const

export type JobExportContacts = {
  type: typeof DefaultJobAction.exportContacts
  data: {
    requestedUserId: bigint
    chatbotId: bigint
    fields: string[]
    contactIds: bigint[]
    outputPath: string
    outputFormat: "csv"
    cursor?: {
      createdAt: string
      id: bigint
    }
  }
}

export type JobSendErrorLog = {
  type: typeof DefaultJobAction.sendErrorLog
  data: {
    chatbotId: bigint
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
    userId: bigint
    chatbotId: bigint
    action: string
    detail: string
  }
}

export type DefaultJobData =
  | JobExportContacts
  | JobSendErrorLog
  | JobSendAuditLog

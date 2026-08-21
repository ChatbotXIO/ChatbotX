import type { ContentType } from "@chatbotx.io/database/partials"
import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getRedisConnection,
  isNoRedisEnv,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"

export const NotificationJobAction = {
  notifyIncomingMessage: "notifyIncomingMessage",
  notifyConversationAssigned: "notifyConversationAssigned",
} as const

export type NotificationJobNotifyIncomingMessage = {
  type: typeof NotificationJobAction.notifyIncomingMessage
  data: {
    workspaceId: string
    conversationId: string
    messageId: string
    /** Preview text built at enqueue time — Message is a hypertable whose
     *  lookup needs createdAt, which this payload deliberately does not carry. */
    messageText?: string
    contentType?: ContentType
    attachmentCount?: number
  }
}

export type NotificationJobNotifyConversationAssigned = {
  type: typeof NotificationJobAction.notifyConversationAssigned
  data: {
    workspaceId: string
    conversationId: string
    assignedUserId: string
  }
}

export type NotificationJobData =
  | NotificationJobNotifyIncomingMessage
  | NotificationJobNotifyConversationAssigned

export const notificationQueue = isNoRedisEnv()
  ? fakeQueue
  : new Queue<NotificationJobData>(queueNames.enum.notification, {
      connection: getRedisConnection(),
      defaultJobOptions,
    })

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

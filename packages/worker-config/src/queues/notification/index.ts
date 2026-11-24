import type { ContentType } from "@chatbotx.io/database/partials"
import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getQueueConnection,
  isNoRedisEnv,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"

export const NotificationJobAction = {
  notifyIncomingMessage: "notifyIncomingMessage",
  notifyConversationAssigned: "notifyConversationAssigned",
  notifyNewOrder: "notifyNewOrder",
  checkPushReceipts: "checkPushReceipts",
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
    /** Recipient to skip, e.g. the agent whose own outbound reply round-tripped
     *  back as an "incoming" message via a channel's echo/coexist sync. Optional
     *  because most channels have no way to identify the sending user. */
    excludeUserId?: string
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

/**
 * A new order was placed. Pushed to the members who turned on the "New order"
 * notification; an order needs no conversation, so it has its own handler.
 */
export type NotificationJobNotifyNewOrder = {
  type: typeof NotificationJobAction.notifyNewOrder
  data: {
    workspaceId: string
    orderId: string
  }
}

/**
 * Delayed follow-up to a push send: Expo tickets only say "accepted"; the
 * delivery verdict (APNs/FCM rejection, unregistered device) lands in a
 * receipt ~minutes later. Carries no workspace — it spans every recipient.
 */
export type NotificationJobCheckPushReceipts = {
  type: typeof NotificationJobAction.checkPushReceipts
  data: {
    /** Expo ticket id → the device token it was sent to. */
    tickets: { id: string; token: string }[]
  }
}

/** Wait before asking Expo for receipts (Expo recommends ~15 min). */
export const PUSH_RECEIPT_DELAY_MS = 15 * 60 * 1000

/** The jobs about a conversation — every one but a new order. */
export type NotificationJobConversation =
  | NotificationJobNotifyIncomingMessage
  | NotificationJobNotifyConversationAssigned

export type NotificationJobData =
  | NotificationJobConversation
  | NotificationJobNotifyNewOrder
  | NotificationJobCheckPushReceipts

/** One push per order, however many times placement is retried. */
export const getNewOrderNotificationJobId = (orderId: string): string =>
  `new-order-${orderId}`

export const notificationQueue = isNoRedisEnv()
  ? fakeQueue
  : new Queue<NotificationJobData>(queueNames.enum.notification, {
      connection: getQueueConnection(queueNames.enum.notification),
      defaultJobOptions,
    })

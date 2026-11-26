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
  notifyPostFailed: "notifyPostFailed",
  notifyPostNeedsReview: "notifyPostNeedsReview",
  notifyPublishConnection: "notifyPublishConnection",
} as const

/**
 * What needs attention on a publishing connection: its token was rejected or
 * expired (`needsReconnect`), a publishing permission is missing
 * (`permissionMissing`), or the network's limits paused it (`paused`).
 */
export const publishConnectionAlerts = [
  "needsReconnect",
  "permissionMissing",
  "paused",
] as const
export type PublishConnectionAlert = (typeof publishConnectionAlerts)[number]

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

/** The target of a composed post a push is about; `attempt` is its publish attempt number. */
type NotificationPostTargetData = {
  workspaceId: string
  socialPostId: string
  targetId: string
  attempt: number
}

/** A destination of a composed post failed for good. Pushed to the members who turned on "Post failed". */
export type NotificationJobNotifyPostFailed = {
  type: typeof NotificationJobAction.notifyPostFailed
  data: NotificationPostTargetData
}

/** A destination's publish could not be confirmed and waits for a person. */
export type NotificationJobNotifyPostNeedsReview = {
  type: typeof NotificationJobAction.notifyPostNeedsReview
  data: NotificationPostTargetData
}

export type NotificationJobPost =
  | NotificationJobNotifyPostFailed
  | NotificationJobNotifyPostNeedsReview

/**
 * A publishing connection (an inbox destination, or a TikTok login) just moved
 * into a state that stops publishing. Exactly one of `publishDestinationId` /
 * `socialAccountId` is set. `transitionKey` tells one transition from the next
 * (the rejected token's fingerprint, the pause's end), so the job id fires
 * once per transition.
 */
export type NotificationJobNotifyPublishConnection = {
  type: typeof NotificationJobAction.notifyPublishConnection
  data: {
    workspaceId: string
    alert: PublishConnectionAlert
    publishDestinationId?: string
    socialAccountId?: string
    transitionKey: string
  }
}

/** The jobs about a conversation — every one but a new order. */
export type NotificationJobConversation =
  | NotificationJobNotifyIncomingMessage
  | NotificationJobNotifyConversationAssigned

export type NotificationJobData =
  | NotificationJobConversation
  | NotificationJobNotifyNewOrder
  | NotificationJobNotifyPublishConnection
  | NotificationJobPost

/** One push per order, however many times placement is retried. */
export const getNewOrderNotificationJobId = (orderId: string): string =>
  `new-order-${orderId}`

/** One push per target and publish attempt, however many times the result is stored or recovered. */
export const getPostNotificationJobId = (
  action: NotificationJobPost["type"],
  targetId: string,
  attempt: number,
): string => `social-post-${action}-${targetId}-${attempt}`

/** One push per connection, alert and transition, however many times the failure is recorded. */
export const getPublishConnectionNotificationJobId = (input: {
  alert: PublishConnectionAlert
  subjectId: string
  transitionKey: string
}): string =>
  `publish-connection-${input.alert}-${input.subjectId}-${input.transitionKey}`

export const notificationQueue = isNoRedisEnv()
  ? fakeQueue
  : new Queue<NotificationJobData>(queueNames.enum.notification, {
      connection: getQueueConnection(queueNames.enum.notification),
      defaultJobOptions,
    })

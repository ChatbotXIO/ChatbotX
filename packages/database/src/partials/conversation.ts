import z from "zod"

/**
 * `inboxStatuses` is defined in `@chatbotx.io/utils/conversation` so a
 * "use client" component (e.g. the broadcast inbox picker) can use it without
 * depending on the database layer. Re-exported here because this has long
 * been the import site for the rest of the repo; both paths resolve to the
 * same enum. Mirrors the `channelTypes` precedent.
 */
export {
  type InboxStatus,
  inboxStatuses,
} from "@chatbotx.io/utils/conversation"

export const conversationBotCategories = z.enum(["bot", "human", "all"])
export type ConversationBotCategory = z.infer<typeof conversationBotCategories>

export const conversationStatuses = z.enum([
  "noAdminReply",
  "unread",
  "followUp",
  "archived",
  "blocked",
])
export type ConversationStatus = z.infer<typeof conversationStatuses>

export const assignerFilterTypes = z.enum(["all", "unassigned"])
export type AssignerFilterType =
  (typeof assignerFilterTypes)[keyof typeof assignerFilterTypes]

/**
 * `InboxDisconnectReason` is defined in `@chatbotx.io/utils/connection`
 * alongside `CONNECTION_TO_INBOX_DISCONNECT_REASON`, which maps onto it —
 * same rationale as `inboxStatuses` above. Re-exported here as the
 * conventional database-layer import site.
 */
export {
  type InboxDisconnectReason,
  inboxDisconnectReasons,
} from "@chatbotx.io/utils/connection"

export type ConversationStepChallenge = {
  type: "step"
  data: {
    flowId: string
    flowVersionId?: string
    nodeId: string
    stepId: string
    attempts: number
    lastAttemptAt: Date
    appointmentId?: string
    challengeId?: string
  }
}

/** Pending "retry if reply isn't a quick reply" for a Send Message node. */
export type ConversationQuickReplyChallenge = {
  type: "quickReply"
  data: {
    flowId: string
    flowVersionId?: string
    nodeId: string
    attempts: number
    // Informational only: the node's current config is authoritative for retries.
    maxRetries: number
    sentAt: Date
  }
}

export type ConversationAttributes = {
  phoneNumber?: string
  challenge?: ConversationStepChallenge | ConversationQuickReplyChallenge
}

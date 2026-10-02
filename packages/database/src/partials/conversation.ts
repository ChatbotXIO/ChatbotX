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

export const inboxDisconnectReasons = z.enum([
  "manual",
  "workspace_purge",
  "trial_expired",
  "tenant_suspended",
  "token_revoked",
])
export type InboxDisconnectReason = z.infer<typeof inboxDisconnectReasons>

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

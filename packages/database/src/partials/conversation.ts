import z from "zod"

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

export const inboxStatuses = z.enum(["connected", "disconnected"])
export type InboxStatus = z.infer<typeof inboxStatuses>

export const inboxDisconnectReasons = z.enum([
  "manual",
  "workspace_purge",
  "trial_expired",
  "tenant_suspended",
  "token_revoked",
])
export type InboxDisconnectReason = z.infer<typeof inboxDisconnectReasons>

export type ConversationAttributes = {
  phoneNumber?: string
  challenge?: {
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
}

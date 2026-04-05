import z from "zod"

export const conversationTypes = z.enum(["bot", "human", "all"])
export type ConversationType = z.infer<typeof conversationTypes>

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
    }
  }
}

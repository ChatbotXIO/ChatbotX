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

// Closing Notes modos — paridade Respond.io Camada 2 (gap #15 2026-05-27).
// disabled        = atual, fecha conversa direto sem dialog.
// optional        = abre dialog mas user pode pular (categoria+summary opcionais).
// mandatoryDialog = abre dialog, categoria obrigatória, summary opcional.
// mandatoryBoth   = abre dialog, categoria + summary obrigatórios.
export const closingNotesModes = z.enum([
  "disabled",
  "optional",
  "mandatoryDialog",
  "mandatoryBoth",
])
export type ClosingNotesMode = z.infer<typeof closingNotesModes>

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

import { triggerActions } from "@chatbotx.io/database/partials"
import z from "zod"

export const transferConversationToHuman = z.object({
  type: z
    .literal(triggerActions.enum.transferConversationToHuman)
    .describe('Action type "transferConversationToHuman".'),
  notifyAdmins: z
    .boolean()
    .describe("Whether to notify workspace admins of the transfer."),
})
export type TransferConversationToHuman = z.infer<
  typeof transferConversationToHuman
>

export const defaultFn = (): TransferConversationToHuman => ({
  type: triggerActions.enum.transferConversationToHuman,
  notifyAdmins: true,
})

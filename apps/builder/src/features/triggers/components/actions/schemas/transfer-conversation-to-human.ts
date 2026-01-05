import { TriggerAction } from "@aha.chat/database/enums"
import z from "zod"

export const transferConversationToHuman = z.object({
  type: z.literal(TriggerAction.transferConversationToHuman),
  notifyAdmins: z.boolean(),
})
export type TransferConversationToHuman = z.infer<
  typeof transferConversationToHuman
>

export const defaultFn = (): TransferConversationToHuman => ({
  type: TriggerAction.transferConversationToHuman,
  notifyAdmins: true,
})

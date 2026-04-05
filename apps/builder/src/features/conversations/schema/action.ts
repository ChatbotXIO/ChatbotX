import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const assignConversationSchema = z.object({
  contactIds: z.array(zodBigintAsString()),
  assignedId: z.string().trim().min(1).nullable(),
})
export type AssignConversationSchema = z.infer<typeof assignConversationSchema>

import { AssignedType } from "@ahachat.ai/database"
import { z } from "zod"

export const assignConversationSchema = z.object({
  ids: z.array(z.string().cuid2()),
  assignedId: z.string().cuid2().nullable(),
  assignedType: z.nativeEnum(AssignedType).nullable(),
})
export type AssignConversationSchema = z.infer<typeof assignConversationSchema>

export const assignConversationBindSchema: [chatbotId: z.ZodString] = [
  z.string().cuid2(),
]
export type AssignConversationBindSchema = [chatbotId: string]

import { z } from "zod"

export const assignConversationSchema = z.object({
  contactIds: z.array(z.cuid2()),
  assignedId: z.string().trim().min(1).nullable(),
})
export type AssignConversationSchema = z.infer<typeof assignConversationSchema>

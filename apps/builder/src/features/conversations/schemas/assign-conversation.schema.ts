import { z } from "zod"

export const assignConversationSchema = z.object({
  contactIds: z.array(z.string().cuid2()),
  assignedId: z.string().trim().min(1),
})
export type AssignConversationSchema = z.infer<typeof assignConversationSchema>

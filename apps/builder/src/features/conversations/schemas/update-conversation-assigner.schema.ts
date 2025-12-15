import { z } from "zod"

export const updateConversationAssignerRequest = z.object({
  conversationId: z.cuid2(),
  assignedUserId: z.string().nullable(),
})

export type UpdateConversationAssignerRequest = z.infer<
  typeof updateConversationAssignerRequest
>

import { z } from "zod"

export const createGuestConversationSchema = z.object({
  chatbotId: z.string(),
  guestConversationId: z.string(),
})
export type CreateGuestConversationSchema = z.infer<
  typeof createGuestConversationSchema
>

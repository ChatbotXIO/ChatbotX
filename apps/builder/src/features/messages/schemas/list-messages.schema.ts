import { z } from "zod"

export const listMessagesRequest = z.object({
  perPage: z.coerce.number().optional(),
  cursor: z.string().optional(),
  conversationId: z.string().cuid2().optional(),
})
export type ListMessagesRequest = z.infer<typeof listMessagesRequest>

export type FindMessageSchema = {
  id: string
  chatbotId: string
}

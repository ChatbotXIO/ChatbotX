import { z } from "zod"

export const listConversationsRequest = z.object({
  chatbotId: z.cuid2().optional(),
  perPage: z.coerce.number().optional(),
  cursor: z.string().optional(),
})
export type ListConversationsRequest = z.infer<typeof listConversationsRequest>

export type FindConversationSchema = {
  id: string
  chatbotId: string
}

import { CHAT_WIDGET_SOURCE_PREFIX } from "@aha.chat/database/types"
import { z } from "zod"

export const listMessagesRequest = z.object({
  perPage: z.coerce.number().optional().default(20),
  cursor: z.string().optional(),
  conversationId: z.string().cuid2().optional(),
})
export type ListMessagesRequest = z.infer<typeof listMessagesRequest>

export type FindMessageSchema = {
  id: string
  chatbotId: string
}

export const listGuestMessagesRequest = z.object({
  perPage: z.coerce.number().optional().default(20),
  cursor: z.string().optional(),
  guestConversationId: z
    .string()
    .refine((id) => id.startsWith(CHAT_WIDGET_SOURCE_PREFIX), {
      message: "Invalid guest conversation ID",
    }),
})
export type ListGuestMessagesRequest = z.infer<typeof listGuestMessagesRequest>

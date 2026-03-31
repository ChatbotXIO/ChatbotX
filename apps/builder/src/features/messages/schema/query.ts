import { WEBCHAT_SOURCE_PREFIX } from "@aha.chat/database/types"
import { z } from "zod"
import { attachmentResource } from "@/features/attachments/schemas"
import { contactResource } from "@/features/contacts/schemas/resource"
import { userResource } from "@/features/users/schemas/resource"
import { messageResource } from "./resource"

export const listMessagesRequest = z.object({
  chatbotId: z.bigint(),
  perPage: z.coerce.number().optional().default(20),
  cursor: z.string().optional(),
  conversationId: z.bigint().optional(),
})
export type ListMessagesRequest = z.infer<typeof listMessagesRequest>

export const listMessagesResponse = z.object({
  data: z.array(
    messageResource.and(
      z.object({
        attachments: z.array(attachmentResource),
        user: userResource.optional(),
        contact: contactResource.optional(),
        clientId: z.string().optional(),
      }),
    ),
  ),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
})
export type ListMessagesResponse = z.infer<typeof listMessagesResponse>

export const findMessageRequest = z.object({
  id: z.bigint(),
  chatbotId: z.bigint(),
})
export type FindMessageRequest = z.infer<typeof findMessageRequest>

export const listGuestMessagesRequest = z.object({
  perPage: z.coerce.number().optional().default(20),
  cursor: z.string().optional(),
  guestConversationId: z
    .string()
    .refine((id) => id.startsWith(WEBCHAT_SOURCE_PREFIX), {
      message: "Invalid guest conversation ID",
    }),
})
export type ListGuestMessagesRequest = z.infer<typeof listGuestMessagesRequest>

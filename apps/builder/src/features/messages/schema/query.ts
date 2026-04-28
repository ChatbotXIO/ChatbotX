import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { attachmentResource } from "@/features/attachments/schema/resource"
import { contactResource } from "@/features/contacts/schemas/resource"
import { userResource } from "@/features/users/schemas/resource"
import { messageResource } from "./resource"

export const listMessagesRequest = z.object({
  workspaceId: zodBigintAsString(),
  perPage: z.coerce.number().optional().default(20),
  cursor: z.string().optional(),
  conversationId: zodBigintAsString().optional(),
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
  id: zodBigintAsString(),
  workspaceId: zodBigintAsString(),
  createdAt: z.coerce.date(),
})
export type FindMessageRequest = z.infer<typeof findMessageRequest>

export const listGuestMessagesRequest = z.object({
  perPage: z.coerce.number().optional().default(20),
  cursor: z.string().optional(),
  guestConversationId: zodBigintAsString(),
})
export type ListGuestMessagesRequest = z.infer<typeof listGuestMessagesRequest>

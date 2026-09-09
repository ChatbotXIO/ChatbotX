import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

// `workspaceId` comes from `context.workspace.id` on every public route —
// never accepted in the body, per `public-spec-operations.test.ts`'s
// zero-exception request-schema sweep. `conversationId` is a path param.
export const conversationIdPathParam = z.object({
  conversationId: zodBigintAsString(),
})

export const listConversationMessagesPublicRequest = z.object({
  conversationId: zodBigintAsString(),
  perPage: z.coerce.number().optional().default(20),
  cursor: z.string().optional(),
})

export const messageIdPathParam = z.object({
  conversationId: zodBigintAsString(),
  messageId: zodBigintAsString(),
})

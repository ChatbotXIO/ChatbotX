import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { PUBLIC_LIST_MAX_PER_PAGE } from "@/lib/public-api/list"

// `workspaceId` comes from `context.workspace.id` on every public route —
// never accepted in the body, per `public-spec-operations.test.ts`'s
// zero-exception request-schema sweep. `conversationId` is a path param.
export const conversationIdPathParam = z.object({
  conversationId: zodBigintAsString(),
})

export const listConversationMessagesPublicRequest = z.object({
  conversationId: zodBigintAsString(),
  perPage: z.coerce
    .number()
    .int()
    .min(1)
    .max(PUBLIC_LIST_MAX_PER_PAGE)
    .optional()
    .default(20),
  cursor: z.string().optional(),
})

export const messageIdPathParam = z.object({
  conversationId: zodBigintAsString(),
  messageId: zodBigintAsString(),
})

// The sharded message store needs `createdAt` to locate a message's shard —
// it must come from the id/createdAt pair returned by `messages.list`, not
// guessed by the caller. On GET and DELETE routes oRPC maps this to a query
// parameter (e.g. `?createdAt=...`), not a request body.
export const messageIdWithCreatedAtParam = messageIdPathParam.and(
  z.object({
    createdAt: z.coerce.date().meta({
      description:
        "The message's createdAt timestamp, exactly as returned by GET /v1/conversations/{conversationId}/messages. Required to locate the message in sharded storage. Sent as a query parameter.",
    }),
  }),
)

// Kept in sync with `editMessage`'s return shape
// (`@/features/messages/actions/edit-message.action.ts`) via the
// `satisfies`-style check in that file's test — oRPC output schemas silently
// strip unknown keys, so a field added to the action's return there without a
// matching field here would disappear from the public response with no
// error. There's no single call-site to derive this from (the action returns
// an inline object literal), so the two are kept in sync by hand plus that
// coverage check instead.
export const editMessagePublicResponse = z.object({
  success: z.boolean(),
  messageId: z.string(),
  newText: z.string(),
  newAttachmentPath: z.string().nullable(),
  newAttachmentPublicUrl: z.string().nullable(),
  newAttachmentMimeType: z.string().nullable(),
  newAttachmentWidth: z.number(),
  newAttachmentHeight: z.number(),
  removedAttachment: z.boolean(),
})

export const changeMessageAttributesPublicResponse = z.object({
  success: z.boolean(),
  messageId: z.string(),
})

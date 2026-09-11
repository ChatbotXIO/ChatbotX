import { conversationService, messageService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import type { z } from "zod"
import { changeMessageAttributes } from "@/features/messages/actions/change-message-attributes.action"
import { deleteMessage } from "@/features/messages/actions/delete-message.action"
import { editMessage } from "@/features/messages/actions/edit-message.action"
import { listMessages } from "@/features/messages/queries"
import {
  changeMessageAttributesRequest,
  createMessageRequest,
  editMessageRequest,
} from "@/features/messages/schema/mutation"
import { listMessagesResponse } from "@/features/messages/schema/query"
import { messageResourceWithRelations } from "@/features/messages/schema/resource"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  changeMessageAttributesPublicResponse,
  conversationIdPathParam,
  editMessagePublicResponse,
  listConversationMessagesPublicRequest,
  messageIdPathParam,
  messageIdWithCreatedAtParam,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("inbox")

// Compile-time guard: `editMessagePublicResponse` is a hand-maintained mirror
// of `editMessage`'s return shape (an inline object literal, not itself a
// schema). oRPC output schemas silently strip unknown keys, so a field added
// to `editMessage`'s return without a matching field here would vanish from
// the public response with no runtime error — this assignment fails to
// typecheck instead the moment the two diverge.
type _EditMessagePublicResponseInSync =
  Awaited<ReturnType<typeof editMessage>> extends z.infer<
    typeof editMessagePublicResponse
  >
    ? true
    : never
const _editMessagePublicResponseInSync: _EditMessagePublicResponseInSync = true

export const messagesPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/conversations/{conversationId}/messages",
      summary: "List messages on a conversation",
      tags: ["Messages"],
    })
    .input(listConversationMessagesPublicRequest)
    .output(listMessagesResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      // `listForConversation` silently returns an empty page for an unknown
      // conversation id instead of throwing — validate existence explicitly
      // so this GET-by-id-shaped route can 404, per
      // public-spec-operations.test.ts's error-coverage sweep.
      await conversationService.findByOrFail({
        where: { id: input.conversationId, workspaceId },
      })
      return await listMessages({
        workspaceId,
        conversationId: input.conversationId,
        perPage: input.perPage,
        cursor: input.cursor,
      })
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/conversations/{conversationId}/messages/{messageId}",
      summary: "Get a message by id on a conversation",
      tags: ["Messages"],
    })
    .input(messageIdWithCreatedAtParam)
    .output(messageResourceWithRelations)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const message = await messageService.findByIdWithUrls({
        workspaceId: context.workspace.id,
        id: input.messageId,
        createdAt: input.createdAt,
      })
      // `findByIdWithUrls` only scopes by id/createdAt/workspaceId — a
      // message from any conversation in the workspace would otherwise be
      // returned under an unrelated conversation's path.
      if (message.conversationId !== input.conversationId) {
        throw notFoundException("Message not found")
      }
      return message
    }),

  // `user` is omitted from `createOutgoing` — a workspace token has no user;
  // same as the already-public `contacts.sendMessage`
  // (contacts/api/public/messages.ts), which sends on the same underlying
  // service without one.
  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/conversations/{conversationId}/messages",
      summary: "Send a message on a conversation",
      successStatus: 201,
      tags: ["Messages"],
    })
    .input(createMessageRequest.and(conversationIdPathParam))
    .output(messageResourceWithRelations.nullable())
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id

      const conversation = await conversationService.findByOrFail({
        where: { id: input.conversationId, workspaceId },
      })

      const inboxId =
        "inboxId" in input && input.inboxId ? input.inboxId : undefined
      const contactInbox =
        await conversationService.resolveContactInboxForConversation({
          conversation,
          workspaceId,
          inboxId,
        })

      return messageService.createOutgoing({
        conversation,
        contactInbox,
        input,
      })
    }),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/conversations/{conversationId}/messages/{messageId}",
      summary: "Edit a comment message",
      tags: ["Messages"],
    })
    .input(editMessageRequest.omit({ messageId: true }).and(messageIdPathParam))
    .output(editMessagePublicResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) =>
      editMessage({
        workspaceId: context.workspace.id,
        conversationId: input.conversationId,
        parsedInput: input,
      }),
    ),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/conversations/{conversationId}/messages/{messageId}",
      summary: "Delete a comment message",
      successStatus: 204,
      tags: ["Messages"],
    })
    .input(messageIdWithCreatedAtParam)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await deleteMessage({
        workspaceId: context.workspace.id,
        conversationId: input.conversationId,
        parsedInput: { id: input.messageId, createdAt: input.createdAt },
      })
    }),

  changeAttributes: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/conversations/{conversationId}/messages/{messageId}/attributes",
      summary: "Change a message's liked/hidden attributes",
      tags: ["Messages"],
    })
    .input(
      changeMessageAttributesRequest
        .omit({ messageId: true })
        .and(messageIdPathParam),
    )
    .output(changeMessageAttributesPublicResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) =>
      changeMessageAttributes({
        workspaceId: context.workspace.id,
        conversationId: input.conversationId,
        parsedInput: input,
      }),
    ),
}

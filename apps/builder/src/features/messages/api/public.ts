import { conversationService, messageService } from "@chatbotx.io/business"
import { z } from "zod"
import { changeMessageAttributes } from "@/features/messages/actions/change-message-attributes.action"
import { deleteMessage } from "@/features/messages/actions/delete-message.action"
import { editMessage } from "@/features/messages/actions/edit-message.action"
import { listMessages } from "@/features/messages/queries"
import {
  changeMessageAttributesRequest,
  createMessageRequest,
  deleteMessageRequest,
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
import { assertWorkspaceNotBlocked } from "@/lib/workspace-quota"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  conversationIdPathParam,
  listConversationMessagesPublicRequest,
  messageIdPathParam,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("inbox")

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
    .input(messageIdPathParam.and(z.object({ createdAt: z.coerce.date() })))
    .output(messageResourceWithRelations)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await messageService.findByIdWithUrls({
          workspaceId: context.workspace.id,
          id: input.messageId,
          createdAt: input.createdAt,
        }),
    ),

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
      await assertWorkspaceNotBlocked(context.workspace.ownerId)

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
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)
      return editMessage({
        workspaceId: context.workspace.id,
        conversationId: input.conversationId,
        parsedInput: input,
      })
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/conversations/{conversationId}/messages/{messageId}",
      summary: "Delete a comment message",
      successStatus: 204,
      tags: ["Messages"],
    })
    .input(
      deleteMessageRequest
        .omit({ id: true })
        .and(messageIdPathParam)
        .transform(({ messageId, ...rest }) => ({ ...rest, id: messageId })),
    )
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)
      await deleteMessage({
        workspaceId: context.workspace.id,
        conversationId: input.conversationId,
        parsedInput: input,
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
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)
      await changeMessageAttributes({
        workspaceId: context.workspace.id,
        conversationId: input.conversationId,
        parsedInput: input,
      })
    }),
}

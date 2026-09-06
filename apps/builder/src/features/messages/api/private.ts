import {
  contactInboxService,
  conversationService,
  messageService,
  userService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { assertWorkspaceNotBlocked } from "@/lib/workspace-quota"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { changeMessageAttributes } from "../actions/change-message-attributes.action"
import { deleteMessage } from "../actions/delete-message.action"
import { editMessage } from "../actions/edit-message.action"
import { findMessage, listMessages } from "../queries"
import {
  changeMessageAttributesRequest,
  createMessageRequest,
  deleteMessageRequest,
  editMessageRequest,
} from "../schema/mutation"
import {
  findMessageRequest,
  listMessagesRequest,
  listMessagesResponse,
} from "../schema/query"
import { messageResourceWithRelations } from "../schema/resource"

const workspaceIdAndConversationIdRequest = z.object({
  workspaceId: zodBigintAsString(),
  conversationId: zodBigintAsString(),
})

export const messagesAuthenticatedAPI = {
  listMessagesAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/messages",
      summary: "List messages",
      tags: ["Messages"],
    })
    .input(listMessagesRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listMessagesResponse)
    .handler(async ({ input }) => await listMessages(input)),

  findMessageAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/messages/{id}",
      summary: "Find message by message id",
      tags: ["Messages"],
    })
    .input(findMessageRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(messageResourceWithRelations)
    .handler(async ({ input }) => await findMessage(input)),

  createMessageAuthenticatedAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/conversations/{conversationId}/messages",
      summary: "Send a message on a conversation",
      tags: ["Messages"],
    })
    .input(createMessageRequest.and(workspaceIdAndConversationIdRequest))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(messageResourceWithRelations.nullable())
    .handler(async ({ input, context }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)

      const conversation = await conversationService.findByOrFail({
        where: { id: input.conversationId, workspaceId: input.workspaceId },
      })

      const inboxId =
        "inboxId" in input && input.inboxId ? input.inboxId : undefined
      const contactInbox = inboxId
        ? await contactInboxService.findBy({
            where: { contactId: conversation.contactId, inboxId },
          })
        : await contactInboxService.findRecentByContactId({
            workspaceId: input.workspaceId,
            contactId: conversation.contactId,
          })
      if (!contactInbox) {
        throw new ChatbotXException("Inbox not found")
      }

      // createMessage expects a full UserModel (needs tenantId); the oRPC
      // session context only carries the lighter better-auth user shape.
      const user = await userService.findByIdOrFail(context.user.id)

      return messageService.createOutgoing({
        conversation,
        contactInbox,
        input,
        user,
      })
    }),

  editMessageAuthenticatedAPI: authorizedAPI
    .route({
      method: "PATCH",
      path: "/workspaces/{workspaceId}/conversations/{conversationId}/messages/{messageId}",
      summary: "Edit a comment message",
      tags: ["Messages"],
    })
    .input(editMessageRequest.and(workspaceIdAndConversationIdRequest))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input, context }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)

      return editMessage({
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        parsedInput: input,
      })
    }),

  deleteMessageAuthenticatedAPI: authorizedAPI
    .route({
      method: "DELETE",
      path: "/workspaces/{workspaceId}/conversations/{conversationId}/messages/{id}",
      summary: "Delete a comment message",
      tags: ["Messages"],
    })
    .input(deleteMessageRequest.and(workspaceIdAndConversationIdRequest))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input, context }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)

      return deleteMessage({
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        parsedInput: input,
      })
    }),

  changeMessageAttributesAuthenticatedAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/conversations/{conversationId}/messages/{messageId}/attributes",
      summary: "Change a message's liked/hidden attributes",
      tags: ["Messages"],
    })
    .input(
      changeMessageAttributesRequest.and(workspaceIdAndConversationIdRequest),
    )
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input, context }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)

      return changeMessageAttributes({
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        parsedInput: input,
      })
    }),
}

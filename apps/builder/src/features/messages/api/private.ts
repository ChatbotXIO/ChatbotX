import { conversationService, userService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { sendOutgoing } from "@/features/translation/lib/send-outgoing"
import {
  assertConversationAccessForCaller,
  lazyConversationAccessCheckForCaller,
  type MemberScopeContext,
} from "@/lib/public-api/member-scope"
import { assertWorkspaceNotBlocked } from "@/lib/workspace-quota"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { changeMessageAttributes } from "../actions/change-message-attributes.action"
import { deleteMessage } from "../actions/delete-message.action"
import { editMessage } from "../actions/edit-message.action"
import { getWhatsappFlowResponseView } from "../lib/get-whatsapp-flow-response"
import { findMessage, listMessages } from "../queries"
import { whatsappFlowResponseSchema } from "../schema/flow-response"
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

/** The session caller, as the member-scope helpers read it. */
const memberScopeOf = (context: {
  workspace: MemberScopeContext["workspace"]
  workspaceMember: NonNullable<MemberScopeContext["member"]>
  user: NonNullable<MemberScopeContext["user"]>
}): MemberScopeContext => ({
  workspace: context.workspace,
  member: context.workspaceMember,
  user: context.user,
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
    // Reading messages is not member-scoped here (it never was), but their
    // translations are: outside an agent's assigned conversations they are
    // `null`, so an agent's original sentence never leaks.
    .handler(
      async ({ input, context }) =>
        await listMessages(input, {
          includeTranslation: true,
          canSeeConversation: lazyConversationAccessCheckForCaller(
            memberScopeOf(context),
          ),
        }),
    ),

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
    .handler(
      async ({ input, context }) =>
        await findMessage(input, {
          includeTranslation: true,
          canSeeConversation: lazyConversationAccessCheckForCaller(
            memberScopeOf(context),
          ),
        }),
    ),

  getWhatsappFlowResponseAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/conversations/{conversationId}/messages/{messageId}/flow-response",
      summary: "Get WhatsApp Flow response",
      tags: ["Messages"],
    })
    .input(
      workspaceIdAndConversationIdRequest.extend({
        messageId: zodBigintAsString(),
        createdAt: z.coerce.date(),
      }),
    )
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(whatsappFlowResponseSchema)
    .handler(
      async ({ input }) =>
        await getWhatsappFlowResponseView({
          workspaceId: input.workspaceId,
          conversationId: input.conversationId,
          messageId: input.messageId,
          createdAt: input.createdAt,
        }),
    ),

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

      // A translated send spends a model call, so it is member-scoped like
      // every other translation operation. A plain send keeps its behavior.
      const conversation =
        input.translate === true
          ? await assertConversationAccessForCaller(
              memberScopeOf(context),
              input.conversationId,
            )
          : await conversationService.findByOrFail({
              where: {
                id: input.conversationId,
                workspaceId: input.workspaceId,
              },
            })

      const inboxId =
        "inboxId" in input && input.inboxId ? input.inboxId : undefined
      const contactInbox =
        await conversationService.resolveContactInboxForConversation({
          conversation,
          workspaceId: input.workspaceId,
          inboxId,
        })

      // createMessage expects a full UserModel (needs tenantId); the oRPC
      // session context only carries the lighter better-auth user shape.
      const user = await userService.findByIdOrFail(context.user.id)

      return sendOutgoing({
        workspaceId: input.workspaceId,
        conversation,
        contactInbox,
        input,
        user,
        // Session-authenticated route the builder's Inbox composer calls.
        sendFrom: "inbox",
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

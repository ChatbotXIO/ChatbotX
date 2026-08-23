import { conversationService } from "@chatbotx.io/business"
import { channelTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import {
  bulkUpdateIdsRequest,
  successResponse,
} from "@/features/common/schemas"
import { assertWorkspaceNotBlocked } from "@/lib/workspace-quota"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { archiveConversations } from "../actions/archive-conversation.action"
import { assignConversation } from "../actions/assign-conversation.action"
import { disableBotForConversations } from "../actions/disable-bot.action"
import { enableBotForConversations } from "../actions/enable-bot.action"
import { followConversation } from "../actions/follow-conversation.action"
import { unarchiveConversations } from "../actions/unarchive-conversation.action"
import { unfollowConversation } from "../actions/unfollow-conversation.action"
import { unreadConversation } from "../actions/unread-conversation.action"
import { getPostDetailsQuery } from "../queries/get-post-details.query"
import {
  findConversation,
  listConversations,
} from "../queries/list-conversations.query"
import { assignConversationSchema } from "../schema/action"
import { listConversationsRequest } from "../schema/query"
import {
  findConversationRequest,
  findConversationResponse,
  listConversationsResponse,
} from "../schema/resource"

const workspaceIdAndIdRequest = z.object({
  workspaceId: zodBigintAsString(),
  id: zodBigintAsString(),
})

const postDetailsSchema = z.object({
  text: z.string().optional(),
  picture: z.string().optional(),
  from: z.object({ id: z.string(), name: z.string() }).optional(),
  createdAt: z.string(),
  link: z.string().optional(),
})

export const conversationsAuthenticatedAPI = {
  listConversationsAuthenticatedAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/conversations",
      summary: "List conversations by cursor pagination",
      tags: ["Conversations"],
    })
    .input(listConversationsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listConversationsResponse)
    .handler(async ({ input }) => await listConversations(input)),

  listConversationsByPOSTAuthenticatedAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/conversations/list",
      summary: "List conversations by cursor pagination using POST request",
      tags: ["Conversations"],
    })
    .input(listConversationsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listConversationsResponse)
    .handler(async ({ input }) => await listConversations(input)),

  findConversationAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/conversations/{id}",
      summary: "Find conversation by conversation id",
      tags: ["Conversations"],
    })
    .input(findConversationRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(findConversationResponse)
    .handler(async ({ input }) => await findConversation(input)),

  getPostDetailsAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/conversations/post-details",
      summary: "Get Facebook post details for a comment conversation",
      tags: ["Conversations"],
    })
    .input(
      z.object({
        workspaceId: zodBigintAsString(),
        inboxId: z.string(),
        postId: z.string(),
        channel: channelTypes,
      }),
    )
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(postDetailsSchema)
    .handler(async ({ input }) =>
      getPostDetailsQuery(input.inboxId, input.postId, input.channel),
    ),

  assignConversationsAuthenticatedAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/conversations/assign",
      summary: "Assign or unassign conversations to a user or inbox team",
      tags: ["Conversations"],
    })
    .input(
      assignConversationSchema.and(
        z.object({ workspaceId: zodBigintAsString() }),
      ),
    )
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(successResponse)
    .handler(async ({ input, context }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)

      await assignConversation({
        workspaceId: input.workspaceId,
        contactIds: input.contactIds,
        assignedId: input.assignedId,
        assignedBy: context.user.id,
      })
      return { success: true as const }
    }),

  archiveConversationsAuthenticatedAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/conversations/archive",
      summary: "Archive conversations",
      tags: ["Conversations"],
    })
    .input(
      bulkUpdateIdsRequest.and(z.object({ workspaceId: zodBigintAsString() })),
    )
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(successResponse)
    .handler(async ({ input, context }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)

      await archiveConversations({
        workspaceId: input.workspaceId,
        ids: input.ids,
        userId: context.user.id,
      })
      return { success: true as const }
    }),

  unarchiveConversationsAuthenticatedAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/conversations/unarchive",
      summary: "Unarchive conversations",
      tags: ["Conversations"],
    })
    .input(
      bulkUpdateIdsRequest.and(z.object({ workspaceId: zodBigintAsString() })),
    )
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(successResponse)
    .handler(async ({ input, context }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)

      await unarchiveConversations({
        workspaceId: input.workspaceId,
        ids: input.ids,
      })
      return { success: true as const }
    }),

  enableBotAuthenticatedAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/conversations/enable-bot",
      summary: "Re-enable the bot for conversations",
      tags: ["Conversations"],
    })
    .input(
      bulkUpdateIdsRequest.and(z.object({ workspaceId: zodBigintAsString() })),
    )
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(successResponse)
    .handler(async ({ input, context }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)

      await enableBotForConversations({
        workspaceId: input.workspaceId,
        ids: input.ids,
        userId: context.user.id,
      })
      return { success: true as const }
    }),

  disableBotAuthenticatedAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/conversations/disable-bot",
      summary: "Disable the bot for conversations (hand off to a human)",
      tags: ["Conversations"],
    })
    .input(
      bulkUpdateIdsRequest.and(z.object({ workspaceId: zodBigintAsString() })),
    )
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(successResponse)
    .handler(async ({ input, context }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)

      await disableBotForConversations({
        workspaceId: input.workspaceId,
        ids: input.ids,
        userId: context.user.id,
      })
      return { success: true as const }
    }),

  readConversationAuthenticatedAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/conversations/{id}/read",
      summary: "Mark a conversation as read",
      tags: ["Conversations"],
    })
    .input(workspaceIdAndIdRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(successResponse)
    .handler(async ({ input, context }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)

      await conversationService.updateReadStatus({
        workspaceId: input.workspaceId,
        id: input.id,
        agentLastReadAt: new Date(),
      })
      return { success: true as const }
    }),

  unreadConversationAuthenticatedAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/conversations/{id}/unread",
      summary: "Mark a conversation as unread",
      tags: ["Conversations"],
    })
    .input(workspaceIdAndIdRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(
      z.object({
        success: z.literal(true),
        agentLastReadAt: z.date().nullable(),
      }),
    )
    .handler(async ({ input, context }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)

      const result = await unreadConversation({
        workspaceId: input.workspaceId,
        id: input.id,
      })
      return { success: true as const, agentLastReadAt: result.agentLastReadAt }
    }),

  followConversationAuthenticatedAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/conversations/{id}/follow",
      summary: "Follow a conversation",
      tags: ["Conversations"],
    })
    .input(workspaceIdAndIdRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(successResponse)
    .handler(async ({ input, context }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)

      await followConversation({
        workspaceId: input.workspaceId,
        id: input.id,
        userId: context.user.id,
      })
      return { success: true as const }
    }),

  unfollowConversationAuthenticatedAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/conversations/{id}/unfollow",
      summary: "Unfollow a conversation",
      tags: ["Conversations"],
    })
    .input(workspaceIdAndIdRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(successResponse)
    .handler(async ({ input, context }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)

      await unfollowConversation({
        workspaceId: input.workspaceId,
        id: input.id,
      })
      return { success: true as const }
    }),
}

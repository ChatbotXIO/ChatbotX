import { conversationService } from "@chatbotx.io/business"
import {
  channelTypes,
  conversationBotCategories,
  conversationStatuses,
} from "@chatbotx.io/database/partials"
import z from "zod"
import { successResponse } from "@/features/common/schema"
import { contactFilterCriteriaSchema } from "@/features/contact-filter"
import { archiveConversations } from "@/features/conversations/actions/archive-conversation.action"
import { assignConversation } from "@/features/conversations/actions/assign-conversation.action"
import { disableBotForConversations } from "@/features/conversations/actions/disable-bot.action"
import { enableBotForConversations } from "@/features/conversations/actions/enable-bot.action"
import { followConversation } from "@/features/conversations/actions/follow-conversation.action"
import { unarchiveConversations } from "@/features/conversations/actions/unarchive-conversation.action"
import { unfollowConversation } from "@/features/conversations/actions/unfollow-conversation.action"
import { unreadConversation } from "@/features/conversations/actions/unread-conversation.action"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { cursorPaginationRequest } from "@/lib/pagination"
import { assertWorkspaceNotBlocked } from "@/lib/workspace-quota"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

import {
  findConversation,
  listConversations,
} from "../queries/list-conversations.query"
import {
  assignConversationPublicRequest,
  conversationIdPathParam,
  getConversationPublicResponse,
} from "../schema/public"
import { listConversationsResponse } from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("inbox")

function jsonQueryParam<T>(schema: z.ZodType<T>) {
  return z.preprocess((val) => {
    if (val === undefined || val === null || val === "") {
      return
    }
    try {
      return JSON.parse(decodeURIComponent(String(val)))
    } catch {
      return
    }
  }, schema)
}

const listConversationsQueryRequest = z.object({
  botCategory: conversationBotCategories.optional(),
  assignedId: z.string().nullable().optional(),
  channel: channelTypes.optional(),
  status: jsonQueryParam(z.array(conversationStatuses).optional()),
  keyword: z.string().optional(),
  botEnabled: z.preprocess((val) => {
    if (val === "true") {
      return true
    }
    if (val === "false") {
      return false
    }
    return val
  }, z.boolean().nullish()),
  tags: jsonQueryParam(
    z
      .array(
        z.enum(["noAdminReply", "unread", "followUp", "archived", "blocked"]),
      )
      .optional(),
  ),
  contactFilter: jsonQueryParam(contactFilterCriteriaSchema.optional()),
  ...cursorPaginationRequest.shape,
})

export const conversationsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/conversations",
      summary: "List conversations",
      tags: ["Conversations"],
    })
    .input(listConversationsQueryRequest)
    .output(listConversationsResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await listConversations(
          {
            ...input,
            workspaceId: context.workspace.id,
          },
          // Workspace tokens are workspace-level, not member-scoped — see
          // docs/developer/workspace-api-tokens.md.
          { includeEmailAndPhone: true },
        ),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/conversations/{id}",
      summary: "Get a conversation by id",
      tags: ["Conversations"],
    })
    .input(conversationIdPathParam)
    .output(getConversationPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await findConversation({
          id: input.id,
          workspaceId: context.workspace.id,
        }),
    ),

  // Single-conversation, path-addressed — not the private bulk
  // `POST /conversations/assign` shape, which takes contact ids directly.
  // `assignedBy`/`userId` are omitted throughout this router: a workspace
  // token has no user, and every action below treats the actor as optional
  // (see docs/developer/workspace-api-tokens.md).
  assign: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/conversations/{id}/assign",
      summary: "Assign or unassign a conversation to a user or inbox team",
      tags: ["Conversations"],
    })
    .input(assignConversationPublicRequest.and(conversationIdPathParam))
    .output(successResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      await assertWorkspaceNotBlocked(context.workspace.ownerId)

      const conversation = await conversationService.findByOrFail({
        where: { id: input.id, workspaceId },
      })

      await assignConversation({
        workspaceId,
        contactIds: [conversation.contactId],
        assignedId: input.assignedId,
      })
      return { success: true as const }
    }),

  archive: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/conversations/{id}/archive",
      summary: "Archive a conversation",
      tags: ["Conversations"],
    })
    .input(conversationIdPathParam)
    .output(successResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)
      await archiveConversations({
        workspaceId: context.workspace.id,
        ids: [input.id],
      })
      return { success: true as const }
    }),

  unarchive: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/conversations/{id}/unarchive",
      summary: "Unarchive a conversation",
      tags: ["Conversations"],
    })
    .input(conversationIdPathParam)
    .output(successResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)
      await unarchiveConversations({
        workspaceId: context.workspace.id,
        ids: [input.id],
      })
      return { success: true as const }
    }),

  read: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/conversations/{id}/read",
      summary: "Mark a conversation as read",
      tags: ["Conversations"],
    })
    .input(conversationIdPathParam)
    .output(successResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)
      await conversationService.updateReadStatus({
        workspaceId: context.workspace.id,
        id: input.id,
        agentLastReadAt: new Date(),
      })
      return { success: true as const }
    }),

  unread: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/conversations/{id}/unread",
      summary: "Mark a conversation as unread",
      tags: ["Conversations"],
    })
    .input(conversationIdPathParam)
    .output(successResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)
      await unreadConversation({
        workspaceId: context.workspace.id,
        id: input.id,
      })
      return { success: true as const }
    }),

  follow: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/conversations/{id}/follow",
      summary: "Follow a conversation",
      tags: ["Conversations"],
    })
    .input(conversationIdPathParam)
    .output(successResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)
      await followConversation({
        workspaceId: context.workspace.id,
        id: input.id,
      })
      return { success: true as const }
    }),

  unfollow: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/conversations/{id}/unfollow",
      summary: "Unfollow a conversation",
      tags: ["Conversations"],
    })
    .input(conversationIdPathParam)
    .output(successResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)
      await unfollowConversation({
        workspaceId: context.workspace.id,
        id: input.id,
      })
      return { success: true as const }
    }),

  enableBot: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/conversations/{id}/enable-bot",
      summary: "Re-enable the bot for a conversation",
      tags: ["Conversations"],
    })
    .input(conversationIdPathParam)
    .output(successResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)
      await enableBotForConversations({
        workspaceId: context.workspace.id,
        ids: [input.id],
      })
      return { success: true as const }
    }),

  disableBot: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/conversations/{id}/disable-bot",
      summary: "Disable the bot for a conversation (hand off to a human)",
      tags: ["Conversations"],
    })
    .input(conversationIdPathParam)
    .output(successResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)
      await disableBotForConversations({
        workspaceId: context.workspace.id,
        ids: [input.id],
      })
      return { success: true as const }
    }),
}

import { conversationService } from "@chatbotx.io/business"
import {
  channelTypes,
  conversationBotCategories,
  conversationStatuses,
} from "@chatbotx.io/database/partials"
import z from "zod"
import { successResponse } from "@/features/common/schema"
import { contactFilterCriteriaSchema } from "@/features/contact-filter"
import { mcpSpec } from "@/lib/orpc/mcp-annotations"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { cursorPaginationRequest } from "@/lib/pagination"
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
  botCategory: conversationBotCategories
    .optional()
    .describe("Restrict to conversations in this bot lifecycle category."),
  assignedId: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Restrict to conversations assigned to this user/inbox-team id (`u_<id>`/`t_<id>`), or null for unassigned.",
    ),
  channel: channelTypes
    .optional()
    .describe("Restrict to conversations on this channel."),
  status: jsonQueryParam(
    z
      .array(conversationStatuses)
      .optional()
      .describe(
        "Restrict to conversations in one of these statuses. Sent as a JSON-encoded array.",
      ),
  ),
  keyword: z
    .string()
    .optional()
    .describe(
      "Case-insensitive substring match against the conversation's contact.",
    ),
  botEnabled: z
    .preprocess((val) => {
      if (val === "true") {
        return true
      }
      if (val === "false") {
        return false
      }
      return val
    }, z.boolean().nullish())
    .describe("Restrict to conversations with the bot enabled or disabled."),
  tags: jsonQueryParam(
    z
      .array(
        z.enum(["noAdminReply", "unread", "followUp", "archived", "blocked"]),
      )
      .optional()
      .describe(
        "Restrict to conversations matching one of these system tags. Sent as a JSON-encoded array.",
      ),
  ),
  contactFilter: jsonQueryParam(
    contactFilterCriteriaSchema
      .optional()
      .describe(
        "Structured filter for advanced matching on the conversation's contact. Sent as a JSON-encoded object. See `contacts.listFilterFields` for the field/operator reference.",
      ),
  ),
  ...cursorPaginationRequest.shape,
})

export const conversationsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/conversations",
      summary: "List conversations",
      description:
        "Use this to find conversations by status, channel, assignee, tags, or contact filter before inspecting one with `conversations.get`. Returns cursor-paginated workspace conversations.",
      tags: ["Conversations"],
      spec: mcpSpec({ visibility: "default" }),
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
      description:
        "Use this to inspect one conversation's contact, channel, assignee, and status after locating it with `conversations.list`. Call `conversations.assign` to change its assignee.",
      tags: ["Conversations"],
      spec: mcpSpec({ visibility: "default" }),
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
      description:
        "Changes a conversation's user or inbox-team assignee, or clears it when `assignedId` is null. Call `conversations.get` first to inspect the current assignee and `conversations.list` to find the id.",
      tags: ["Conversations"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(assignConversationPublicRequest.and(conversationIdPathParam))
    .output(successResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id

      const conversation = await conversationService.findByOrFail({
        where: { id: input.id, workspaceId },
      })

      await conversationService.assignOne({
        workspaceId,
        conversation,
        assignedId: input.assignedId,
        triggerContext: {
          triggerSource: "api",
          triggerHandler: "assignConversation",
        },
      })
      return { success: true as const }
    }),

  archive: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/conversations/{id}/archive",
      summary: "Archive a conversation",
      description:
        "Archives the conversation, removing it from the default inbox view. Use `conversations.list` with the appropriate filter to find archived conversations again.",
      tags: ["Conversations"],
    })
    .input(conversationIdPathParam)
    .output(successResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      await conversationService.findByOrFail({
        where: { id: input.id, workspaceId },
      })
      await conversationService.archiveByIds({
        workspaceId,
        ids: [input.id],
        triggerContext: {
          triggerSource: "api",
          triggerHandler: "archiveConversationAction",
          triggerType: "conversation_archived",
        },
      })
      return { success: true as const }
    }),

  unarchive: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/conversations/{id}/unarchive",
      summary: "Unarchive a conversation",
      description:
        "Reverses `conversations.archive`, restoring the conversation to the default inbox view.",
      tags: ["Conversations"],
    })
    .input(conversationIdPathParam)
    .output(successResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      await conversationService.findByOrFail({
        where: { id: input.id, workspaceId },
      })
      await conversationService.unarchiveByIds({
        workspaceId,
        ids: [input.id],
        triggerContext: {
          triggerSource: "api",
          triggerHandler: "unarchiveConversationAction",
          triggerType: "conversation_unarchived",
        },
      })
      return { success: true as const }
    }),

  read: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/conversations/{id}/read",
      summary: "Mark a conversation as read",
      description:
        "Clears the unread indicator on a conversation for the workspace.",
      tags: ["Conversations"],
    })
    .input(conversationIdPathParam)
    .output(successResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      await conversationService.findByOrFail({
        where: { id: input.id, workspaceId },
      })
      await conversationService.updateReadStatus({
        workspaceId,
        id: input.id,
        agentLastReadAt: new Date(),
      })
      return { success: true as const }
    }),

  // `unread`/`follow`/`unfollow` don't call `findByOrFail` at the handler
  // layer like their siblings above and below — they don't need to, since
  // `unreadConversation`/`followConversation`/`unfollowConversation` each
  // already call `findByOrFail` (or `findOrFail`) internally and 404 on an
  // unknown id. Keep it that way rather than adding a redundant check here.
  unread: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/conversations/{id}/unread",
      summary: "Mark a conversation as unread",
      description:
        "Reverses `conversations.read`, flagging the conversation as unread again.",
      tags: ["Conversations"],
    })
    .input(conversationIdPathParam)
    .output(successResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await conversationService.markUnread({
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
      description:
        "Subscribes the calling actor to updates on a conversation. Use `conversations.unfollow` to reverse.",
      tags: ["Conversations"],
    })
    .input(conversationIdPathParam)
    .output(successResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await conversationService.setFollowed({
        workspaceId: context.workspace.id,
        id: input.id,
        followed: true,
        triggerContext: {
          triggerSource: "api",
          triggerHandler: "followConversationAction",
          triggerType: "conversation_followed",
        },
      })
      return { success: true as const }
    }),

  unfollow: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/conversations/{id}/unfollow",
      summary: "Unfollow a conversation",
      description:
        "Reverses `conversations.follow`, unsubscribing from conversation updates.",
      tags: ["Conversations"],
    })
    .input(conversationIdPathParam)
    .output(successResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await conversationService.setFollowed({
        workspaceId: context.workspace.id,
        id: input.id,
        followed: false,
        triggerContext: {
          triggerSource: "api",
          triggerHandler: "unfollowConversationAction",
          triggerType: "conversation_unfollowed",
        },
      })
      return { success: true as const }
    }),

  enableBot: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/conversations/{id}/enable-bot",
      summary: "Re-enable the bot for a conversation",
      description:
        "Turns the bot back on for a conversation after it was handed off to a human with `conversations.disableBot`.",
      tags: ["Conversations"],
    })
    .input(conversationIdPathParam)
    .output(successResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      await conversationService.findByOrFail({
        where: { id: input.id, workspaceId },
      })
      await conversationService.setBotEnabledByIds({
        workspaceId,
        ids: [input.id],
        botEnabled: true,
        triggerContext: {
          triggerSource: "api",
          triggerHandler: "enableBotAction",
          triggerType: "conversation_transferred_to_bot",
        },
      })
      return { success: true as const }
    }),

  disableBot: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/conversations/{id}/disable-bot",
      summary: "Disable the bot for a conversation (hand off to a human)",
      description:
        "Turns the bot off for a conversation so a human agent takes over. Use `conversations.enableBot` to reverse.",
      tags: ["Conversations"],
    })
    .input(conversationIdPathParam)
    .output(successResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      await conversationService.findByOrFail({
        where: { id: input.id, workspaceId },
      })
      await conversationService.setBotEnabledByIds({
        workspaceId,
        ids: [input.id],
        botEnabled: false,
        triggerContext: {
          triggerSource: "api",
          triggerHandler: "disableBotAction",
          triggerType: "conversation_transferred_to_human",
        },
      })
      return { success: true as const }
    }),
}

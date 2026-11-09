import {
  conversationMemberScope,
  conversationService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  requestConversationThreadControl,
  syncConversationThreadOwner,
} from "@chatbotx.io/channel-registry/thread-control"
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
  possibleErrorsOnThreadControl,
} from "@/lib/orpc/orpc-error-helper"
import { cursorPaginationRequest } from "@/lib/pagination"
import {
  assertConversationAccessForCaller,
  conversationScopeForCaller,
  maskContactForCaller,
} from "@/lib/public-api/member-scope"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { mapThreadControlError } from "../lib/thread-control-errors"
import {
  findConversation,
  listConversations,
} from "../queries/list-conversations.query"
import {
  assignConversationPublicRequest,
  conversationIdPathParam,
  getConversationPublicResponse,
  threadControlPublicRequest,
  threadControlPublicResponse,
} from "../schema/public"
import {
  listConversationsCompactResponse,
  listConversationsResponse,
} from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("inbox")

// English copy for the shared UI error mapper (the builder passes its i18n).
const THREAD_CONTROL_ERROR_COPY = {
  "conversationRouting.errors.unsupported":
    "This channel does not support thread control.",
  "conversationRouting.errors.actionFailed":
    "The channel could not apply the thread-control action.",
} as const

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
      .array(conversationStatuses)
      .optional()
      .describe(
        "Restrict to conversations matching these system tags (all of them). Sent as a JSON-encoded array. `slaBreaching` = an open response-SLA window within its breaching threshold, `slaBreached` = an open window past its deadline; they are mutually exclusive and need a response SLA policy (`responseSla.get`).",
      ),
  ),
  contactFilter: jsonQueryParam(
    contactFilterCriteriaSchema
      .optional()
      .describe(
        "Structured filter for advanced matching on the conversation's contact. Sent as a JSON-encoded object. See `contacts.listFilterFields` for the field/operator reference.",
      ),
  ),
  view: z
    .enum(["full", "compact"])
    .default("full")
    .describe(
      "Response detail level. `compact` omits ad attribution and thread-control metadata from contact inboxes.",
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
        'Use this to find conversations by status, channel, assignee, tags, or contact filter before inspecting one with `conversations.get`. Returns cursor-paginated workspace conversations. The array and object filters (`status`, `tags`, `contactFilter`) are query parameters whose value is a JSON-encoded string, for example `status=["open"]`; `contactFilter` is the JSON of the criteria object from `contacts.listFilterFields`; bracket (deepObject) notation such as `status[0]=open` is not understood and the filter is ignored.',
      tags: ["Conversations"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(listConversationsQueryRequest)
    .output(
      z.union([listConversationsResponse, listConversationsCompactResponse]),
    )
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      // Mobile (member) callers: restricted to their chat scope, email/phone
      // masked without the permission. Workspace tokens stay workspace-level.
      const access = await conversationScopeForCaller(context)
      const { view, ...request } = input
      const listAccess = {
        includeEmailAndPhone:
          !context.member ||
          context.member.permissions.emailAndPhone === true ||
          context.member.permissions.superAdmin === true,
        scopeWhere: conversationMemberScope.where(access),
      }
      if (view === "compact") {
        const result = await listConversations(
          {
            ...request,
            workspaceId: context.workspace.id,
          },
          { ...listAccess, view },
        )
        return {
          ...result,
          data: result.data.map((conversation) => ({
            ...conversation,
            contact: conversation.contact
              ? maskContactForCaller(context, conversation.contact)
              : conversation.contact,
          })),
        }
      }

      const result = await listConversations(
        {
          ...request,
          workspaceId: context.workspace.id,
        },
        listAccess,
      )
      return {
        ...result,
        data: result.data.map((conversation) => ({
          ...conversation,
          contact: conversation.contact
            ? maskContactForCaller(context, conversation.contact)
            : conversation.contact,
        })),
      }
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/conversations/{id}",
      summary: "Get conversation",
      description:
        "Use this to inspect one conversation's contact, channel, assignee, and status after locating it with `conversations.list`. Call `conversations.assign` to change its assignee.",
      tags: ["Conversations"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(conversationIdPathParam)
    .output(getConversationPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      await assertConversationAccessForCaller(context, input.id)
      const result = await findConversation({
        id: input.id,
        workspaceId: context.workspace.id,
      })
      return {
        ...result,
        data: {
          ...result.data,
          contact: result.data.contact
            ? maskContactForCaller(context, result.data.contact)
            : result.data.contact,
        },
      }
    }),

  // Single-conversation, path-addressed — not the private bulk
  // `POST /conversations/assign` shape, which takes contact ids directly.
  // `assignedBy`/`userId` are omitted throughout this router: a workspace
  // token has no user, and every action below treats the actor as optional
  // (see docs/developer/workspace-api-tokens.md).
  assign: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/conversations/{id}/assign",
      summary: "Assign or unassign conversation to user or inbox team",
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

      const conversation = await assertConversationAccessForCaller(
        context,
        input.id,
      )

      await conversationService.assignOne({
        workspaceId,
        conversation,
        assignedId: input.assignedId,
        assignedBy: context.member?.userId,
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
      summary: "Archive conversation",
      description:
        "Archives the conversation, removing it from the default inbox view. Use `conversations.list` with the appropriate filter to find archived conversations again.",
      tags: ["Conversations"],
    })
    .input(conversationIdPathParam)
    .output(successResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      await assertConversationAccessForCaller(context, input.id)
      await conversationService.archiveByIds({
        workspaceId,
        ids: [input.id],
        userId: context.member?.userId,
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
      summary: "Unarchive conversation",
      description:
        "Reverses `conversations.archive`, restoring the conversation to the default inbox view.",
      tags: ["Conversations"],
    })
    .input(conversationIdPathParam)
    .output(successResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      await assertConversationAccessForCaller(context, input.id)
      await conversationService.unarchiveByIds({
        workspaceId,
        ids: [input.id],
        userId: context.member?.userId,
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
      summary: "Mark conversation as read",
      description:
        "Clears the unread indicator on a conversation for the workspace.",
      tags: ["Conversations"],
    })
    .input(conversationIdPathParam)
    .output(successResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      await assertConversationAccessForCaller(context, input.id)
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
      summary: "Mark conversation as unread",
      description:
        "Reverses `conversations.read`, flagging the conversation as unread again.",
      tags: ["Conversations"],
    })
    .input(conversationIdPathParam)
    .output(successResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await assertConversationAccessForCaller(context, input.id)
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
      summary: "Follow conversation",
      description:
        "Subscribes the calling actor to updates on a conversation. Use `conversations.unfollow` to reverse.",
      tags: ["Conversations"],
    })
    .input(conversationIdPathParam)
    .output(successResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await assertConversationAccessForCaller(context, input.id)
      await conversationService.setFollowed({
        workspaceId: context.workspace.id,
        id: input.id,
        followed: true,
        userId: context.member?.userId,
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
      summary: "Unfollow conversation",
      description:
        "Reverses `conversations.follow`, unsubscribing from conversation updates.",
      tags: ["Conversations"],
    })
    .input(conversationIdPathParam)
    .output(successResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await assertConversationAccessForCaller(context, input.id)
      await conversationService.setFollowed({
        workspaceId: context.workspace.id,
        id: input.id,
        followed: false,
        userId: context.member?.userId,
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
      summary: "Re-enable bot for conversation",
      description:
        "Turns the bot back on for a conversation after it was handed off to a human with `conversations.disableBot`.",
      tags: ["Conversations"],
    })
    .input(conversationIdPathParam)
    .output(successResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      await assertConversationAccessForCaller(context, input.id)
      await conversationService.setBotEnabledByIds({
        workspaceId,
        ids: [input.id],
        botEnabled: true,
        userId: context.member?.userId,
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
      summary: "Disable bot for conversation (hand off to human)",
      description:
        "Turns the bot off for a conversation so a human agent takes over. Use `conversations.enableBot` to reverse.",
      tags: ["Conversations"],
    })
    .input(conversationIdPathParam)
    .output(successResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      await assertConversationAccessForCaller(context, input.id)
      await conversationService.setBotEnabledByIds({
        workspaceId,
        ids: [input.id],
        botEnabled: false,
        userId: context.member?.userId,
        triggerContext: {
          triggerSource: "api",
          triggerHandler: "disableBotAction",
          triggerType: "conversation_transferred_to_human",
        },
      })
      return { success: true as const }
    }),

  threadControl: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/conversations/{id}/thread-control",
      summary: "Control conversation thread",
      description:
        "Controls who owns a contact inbox's routing thread on channels that share a conversation with another app (e.g. WhatsApp with Meta AI or a partner): `take` it, `release` it, or `pass` it to another partner (`targetRole`, default: the escalation partner). `take` and `pass` accept a `metadata` note that is delivered verbatim to the receiving app. `sync` asks the channel who currently owns the thread and updates the stored state to match without changing anything at the channel (channels that cannot report an owner, like WhatsApp, leave it unchanged). Read `contactInboxes[].threadControlState` and `threadOwnerRole` with `conversations.get` first. A `take` the channel refuses returns `status: notEscalation` (HTTP 200) instead of an error. Every successful call returns the routing `snapshot`.",
      tags: ["Conversations"],
    })
    .input(threadControlPublicRequest)
    .output(threadControlPublicResponse)
    .errors(possibleErrorsOnThreadControl)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const conversation = await assertConversationAccessForCaller(
        context,
        input.id,
      )
      try {
        // `sync` goes through the same error mapping as the other actions,
        // so an unsupported channel or a channel failure is a declared 400.
        const snapshot =
          input.action === "sync"
            ? await syncConversationThreadOwner({
                workspaceId,
                conversation,
                contactInboxId: input.contactInboxId,
              })
            : await requestConversationThreadControl({
                workspaceId,
                conversation,
                contactInboxId: input.contactInboxId,
                action: input.action,
                targetRole: input.targetRole,
                metadata: input.metadata,
              })
        return { status: "applied" as const, snapshot }
      } catch (error) {
        if (error instanceof ChatbotXException && error.code === "notFound") {
          throw error
        }
        const refusal = mapThreadControlError(
          error,
          input.action,
          (key) => THREAD_CONTROL_ERROR_COPY[key],
        )
        return { status: refusal.status }
      }
    }),
}

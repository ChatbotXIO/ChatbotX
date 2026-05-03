"use server"

import { notFoundException } from "@chatbotx.io/business/errors"
import { db, sql } from "@chatbotx.io/database/client"
import {
  channelTypes,
  conversationBotCategories,
} from "@chatbotx.io/database/partials"
import { getPaginationWithDefaults } from "@chatbotx.io/database/utils"
import type { ListConversationsRequest } from "@/features/conversations/schema/query"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  FindConversationRequest,
  FindConversationResponse,
  ListConversationsResponse,
} from "../schema/resource"

export const listConversations = async (
  data: ListConversationsRequest,
): Promise<ListConversationsResponse> => {
  const { workspaceId, ...input } = data

  const pagination = getPaginationWithDefaults(input)

  const where = {
    workspaceId,
    ...filterByConversation(data),
    contact: filterByContact(data),
    contactInboxes: filterByContactInbox(data),
  }

  // if (input.channel !== null && input.channel !== undefined) {
  //   where.push(eq(conversationModel.channel, input.channel))
  // }

  // if (input.assignedId !== null && input.assignedId !== undefined) {
  //   if (input.assignedId === "unassigned") {
  //     where.push(isNull(conversationModel.assignedUserId))
  //     where.push(isNull(conversationModel.assignedInboxTeamId))
  //   } else if (input.assignedId.startsWith("u_")) {
  //     const userId = parseBigIntId(input.assignedId.slice(2))
  //     if (userId) {
  //       where.push(eq(conversationModel.assignedUserId, userId))
  //     }
  //   } else if (input.assignedId.startsWith("t_")) {
  //     const inboxTeamId = parseBigIntId(input.assignedId.slice(2))
  //     if (inboxTeamId) {
  //       where.push(eq(conversationModel.assignedInboxTeamId, inboxTeamId))
  //     }
  //   }
  // }

  // if (input.tags !== null && input.tags !== undefined) {
  //   if (input.tags.includes("noAdminReply")) {
  //     where.push(
  //       gt(
  //         conversationModel.contactRepliedAt,
  //         conversationModel.adminRepliedAt,
  //       ),
  //     )
  //   }
  //   if (input.tags.includes("unread")) {
  //     where.push(
  //       gt(conversationModel.lastActivityAt, conversationModel.agentLastReadAt),
  //     )
  //   }
  //   if (input.tags.includes("followUp")) {
  //     where.push(eq(conversationModel.followed, true))
  //   }
  //   if (input.tags.includes("archived")) {
  //     where.push(isNotNull(conversationModel.archivedAt))
  //   }
  // }

  // const lastMessageQuery = db
  //   .select()
  //   .from(messageModel)
  //   .where(
  //     and(
  //       eq(messageModel.conversationId, conversationModel.id),
  //       inArray(messageModel.messageType, ["incoming", "outgoing"]),
  //     ),
  //   )
  //   .orderBy(desc(messageModel.createdAt))
  //   .limit(1)

  console.log("wherewwwwwwww", JSON.stringify(where))

  const conversations = await db.query.conversationModel.findMany({
    with: {
      contact: true,
      contactInboxes: true,
      // lastMessage: true,
      assignedUser: true,
      assignedInboxTeam: true,
    },
    where,
    ...pagination,
    orderBy: {
      lastActivityAt: "desc",
    },
  })
  // .select()
  // .from(conversationModel)
  // .leftJoinLateral(lastMessageQuery.as("lastMessage"), sql`true`)
  // .leftJoin(contactModel, eq(conversationModel.contactId, contactModel.id))
  // // .leftJoin(inboxModel, eq(conversationModel.inboxId, inboxModel.id))
  // .leftJoin(userModel, eq(conversationModel.assignedUserId, userModel.id))
  // .leftJoin(
  //   inboxTeamModel,
  //   eq(conversationModel.assignedInboxTeamId, inboxTeamModel.id),
  // )
  // .where(and(...where))
  // .orderBy(desc(conversationModel.lastActivityAt))
  // .limit(pagination.limit)

  // const contactIds = conversations.map((c) => c.Conversation.contactId)

  // const contactsOnSequences =
  //   contactIds.length > 0
  //     ? await db.query.contactsOnSequenceModel.findMany({
  //         where: {
  //           contactId: {
  //             in: contactIds,
  //           },
  //         },
  //         with: {
  //           sequence: true,
  //         },
  //       })
  //     : []

  // const contactsOnSequencesMap = new Map<string, typeof contactsOnSequences>()
  // for (const cos of contactsOnSequences) {
  //   const existing = contactsOnSequencesMap.get(cos.contactId) || []
  //   contactsOnSequencesMap.set(cos.contactId, [...existing, cos])
  // }

  // const contactInboxes = await db.query.contactInboxModel.findMany({
  //   where: {
  //     contactId: {
  //       in: contactIds,
  //     },
  //   },
  // })
  // const contactInboxesMap = groupBy(contactInboxes, (ci) => ci.contactId)

  console.log(conversations)

  return {
    data: conversations.map((c) => ({
      ...c,
      messages: [],
    })),
    nextCursor: null,
    prevCursor: null,
  }
}

export const findConversation = async (
  input: FindConversationRequest,
): Promise<FindConversationResponse> => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const conversation = await db.query.conversationModel.findFirst({
    with: {
      contact: {
        with: {
          contactsOnSequences: {
            with: {
              sequence: true,
            },
          },
          contactNotes: true,
          contactCustomFields: true,
          tags: true,
        },
      },
      contactInboxes: true,
      messages: true,
      assignedUser: true,
      assignedInboxTeam: true,
    },
    where: input,
  })
  if (!conversation) {
    throw notFoundException("Conversation not found")
  }

  const lastMessage = await db.query.messageModel.findFirst({
    where: {
      conversationId: conversation.id,
      messageType: {
        in: ["incoming", "outgoing"],
      },
    },
    orderBy: { createdAt: "desc" },
  })

  return {
    data: {
      ...conversation,
      messages: lastMessage ? [lastMessage] : [],
    },
  }
}

const filterByConversation = (input: ListConversationsRequest) => {
  const where: Record<string, unknown> = {}

  // Filter by bot category
  if (input.botCategory === conversationBotCategories.enum.bot) {
    where.botEnabled = true
  } else if (input.botCategory === conversationBotCategories.enum.human) {
    where.botEnabled = false
  }

  // Filter by assigned ID
  if (input.assignedId) {
    if (input.assignedId === "unassigned") {
      where.assignedUserId = { isNull: true }
      where.assignedInboxTeamId = { isNull: true }
    } else if (input.assignedId.startsWith("u_")) {
      where.assignedUserId = input.assignedId.slice(2)
    } else if (input.assignedId.startsWith("t_")) {
      where.assignedInboxTeamId = input.assignedId.slice(2)
    }
  }

  // Filter by tags
  if (input.tags && input.tags.length > 0) {
    if (input.tags.includes("noAdminReply")) {
      where.adminRepliedAt = { lt: sql`"d0"."contactRepliedAt"` }
    }
    if (input.tags.includes("unread")) {
      where.agentLastReadAt = { lt: sql`"d0"."contactRepliedAt"` }
    }
    if (input.tags.includes("followed")) {
      where.followed = true
    }
    if (input.tags.includes("archived")) {
      where.archivedAt = { isNotNull: true }
    }
  }

  console.log("wherewwwwwwww", where)

  return where
}

const filterByContact = (input: ListConversationsRequest) => {
  // biome-ignore lint/suspicious/noExplicitAny: safe to use any
  const where: Record<string, any> = {}

  // Filter by keyword
  if (input.keyword) {
    where.OR = [
      {
        firstName: {
          ilike: `%${input.keyword}%`,
        },
      },
      {
        lastName: {
          ilike: `%${input.keyword}%`,
        },
      },
    ]
  }

  // Filter by tags
  if (input.tags?.includes("blocked")) {
    where.contact.blockedAt = { isNotNull: true }
  }

  if (input.contactFilter) {
    // Filter by contactFilter
    where.contact = filterByContact(input)
  }

  return where
}

const filterByContactInbox = (input: ListConversationsRequest) => {
  const where: Record<string, unknown> = {}

  // Filter by channel
  if (
    input.channel !== null &&
    input.channel !== undefined &&
    input.channel !== channelTypes.enum.omnichannel
  ) {
    where.channel = input.channel
  }

  return where
}

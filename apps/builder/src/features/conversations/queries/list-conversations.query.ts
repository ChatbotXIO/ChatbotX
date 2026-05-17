"use server"

import { notFoundException } from "@chatbotx.io/business/errors"
import { db, sql } from "@chatbotx.io/database/client"
import {
  channelTypes,
  conversationBotCategories,
} from "@chatbotx.io/database/partials"
import { getPaginationWithDefaults } from "@chatbotx.io/database/utils"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { applyContactFilter } from "@/features/contacts/apply-contact-filter"
import type { ListConversationsRequest } from "@/features/conversations/schema/query"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { decodeCursor, encodeCursor } from "@/lib/pagination"
import type {
  FindConversationRequest,
  FindConversationResponse,
  ListConversationsResponse,
} from "../schema/resource"

export const listConversations = async (
  data: ListConversationsRequest,
): Promise<ListConversationsResponse> => {
  const { workspaceId, cursor, ...input } = data
  const pagination = getPaginationWithDefaults(input)

  const where: Record<string, unknown> = {
    workspaceId,
    archivedAt: { isNull: true },
    ...filterByConversation(data),
    contact: filterByContact(data),
    contactInboxes: filterByContactInbox(data),
  }

  // Handle cursor pagination
  const decodedCursor = cursor
    ? decodeCursor(
        cursor,
        z.object({
          lastActivityAt: z.coerce.date(),
          id: zodBigintAsString(),
        }),
      )
    : null
  if (decodedCursor) {
    where.OR = [
      {
        lastActivityAt: { lt: decodedCursor.lastActivityAt },
      },
      {
        lastActivityAt: { eq: decodedCursor.lastActivityAt },
        id: { gt: decodedCursor.id },
      },
    ]
  }

  const limit = pagination.limit + 1 // +1 to check if there is a next page
  const conversations = await db.query.conversationModel.findMany({
    with: {
      contact: true,
      contactInboxes: true,
      assignedUser: true,
      assignedInboxTeam: true,
      messages: {
        limit: 1,
        orderBy: { createdAt: "desc" },
      },
    },
    where,
    offset: pagination.offset,
    limit,
    orderBy: {
      lastActivityAt: "desc",
      id: "asc",
    },
  })

  const hasNext = conversations.length > pagination.limit
  const items = hasNext
    ? conversations.slice(0, pagination.limit)
    : conversations

  const nextCursor = hasNext
    ? encodeCursor({
        lastActivityAt: conversations[limit - 2].lastActivityAt.toISOString(),
        id: conversations[limit - 2].id,
      })
    : null

  return {
    data: items,
    nextCursor,
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

const filterByConversation = (
  input: ListConversationsRequest,
): Record<string, unknown> => {
  const where: Record<string, unknown> = {}

  if (input.botCategory === conversationBotCategories.enum.bot) {
    where.botEnabled = true
  } else if (input.botCategory === conversationBotCategories.enum.human) {
    where.botEnabled = false
  }

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

  if (input.tags && input.tags.length > 0) {
    if (input.tags.includes("noAdminReply")) {
      where.adminRepliedAt = { lt: sql`"d0"."contactRepliedAt"` }
    }
    if (input.tags.includes("unread")) {
      where.agentLastReadAt = { lt: sql`"d0"."contactRepliedAt"` }
    }
    if (input.tags.includes("followUp")) {
      where.followed = true
    }
    if (input.tags.includes("archived")) {
      where.archivedAt = { isNotNull: true }
    }
  }

  return where
}

const filterByContact = (
  input: ListConversationsRequest,
): Record<string, unknown> | undefined => {
  const where: Record<string, unknown> = {
    blockedAt: { isNull: true },
  }

  if (input.keyword) {
    where.OR = [
      { firstName: { ilike: `%${input.keyword}%` } },
      { lastName: { ilike: `%${input.keyword}%` } },
    ]
  }

  if (input.tags?.includes("blocked")) {
    where.blockedAt = { isNotNull: true }
  }

  if (input.contactFilter) {
    Object.assign(where, applyContactFilter(input.contactFilter))
  }

  if (Object.keys(where).length === 0) {
    return
  }

  return where
}

const filterByContactInbox = (
  input: ListConversationsRequest,
): Record<string, unknown> | undefined => {
  const where: Record<string, unknown> = {}

  if (
    input.channel !== null &&
    input.channel !== undefined &&
    input.channel !== channelTypes.enum.omnichannel
  ) {
    where.channel = input.channel
  }

  if (Object.keys(where).length === 0) {
    return
  }

  return where
}

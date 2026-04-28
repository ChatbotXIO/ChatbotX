"use server"

import { notFoundException } from "@chatbotx.io/business/errors"
import {
  and,
  db,
  desc,
  eq,
  gt,
  isNotNull,
  isNull,
  type SQL,
} from "@chatbotx.io/database/client"
import {
  createMessageRepository,
  getSafeSinceTime,
} from "@chatbotx.io/database/repositories"
import {
  contactModel,
  conversationModel,
  inboxTeamModel,
  userModel,
} from "@chatbotx.io/database/schema"
import { getPaginationWithDefaults } from "@chatbotx.io/database/utils"
import { parseBigIntId } from "@chatbotx.io/utils"
import { endOfHour } from "date-fns"
import { groupBy } from "remeda"
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
  await assertCurrentUserCanAccessChatbot(workspaceId)

  const pagination = getPaginationWithDefaults(input)

  const where: SQL[] = [eq(conversationModel.workspaceId, workspaceId)]

  if (input.botEnabled !== null && input.botEnabled !== undefined) {
    where.push(eq(conversationModel.botEnabled, input.botEnabled))
  }

  if (input.assignedId !== null && input.assignedId !== undefined) {
    if (input.assignedId === "unassigned") {
      where.push(isNull(conversationModel.assignedUserId))
      where.push(isNull(conversationModel.assignedInboxTeamId))
    } else if (input.assignedId.startsWith("u_")) {
      const userId = parseBigIntId(input.assignedId.slice(2))
      if (userId) {
        where.push(eq(conversationModel.assignedUserId, userId))
      }
    } else if (input.assignedId.startsWith("t_")) {
      const inboxTeamId = parseBigIntId(input.assignedId.slice(2))
      if (inboxTeamId) {
        where.push(eq(conversationModel.assignedInboxTeamId, inboxTeamId))
      }
    }
  }

  if (input.tags !== null && input.tags !== undefined) {
    if (input.tags.includes("noAdminReply")) {
      where.push(
        gt(
          conversationModel.contactRepliedAt,
          conversationModel.adminRepliedAt,
        ),
      )
    }
    if (input.tags.includes("unread")) {
      where.push(
        gt(conversationModel.lastActivityAt, conversationModel.agentLastReadAt),
      )
    }
    if (input.tags.includes("followUp")) {
      where.push(eq(conversationModel.followed, true))
    }
    if (input.tags.includes("archived")) {
      where.push(isNotNull(conversationModel.archivedAt))
    }
  }

  const conversations = await db
    .select()
    .from(conversationModel)
    .leftJoin(contactModel, eq(conversationModel.contactId, contactModel.id))
    .leftJoin(userModel, eq(conversationModel.assignedUserId, userModel.id))
    .leftJoin(
      inboxTeamModel,
      eq(conversationModel.assignedInboxTeamId, inboxTeamModel.id),
    )
    .where(and(...where))
    .orderBy(desc(conversationModel.lastActivityAt))
    .limit(pagination.limit)

  const contactIds = conversations.map((c) => c.Conversation.contactId)
  const conversationIds = conversations.map((c) => c.Conversation.id)

  const contactInboxes = await db.query.contactInboxModel.findMany({
    where: {
      contactId: {
        in: contactIds,
      },
    },
  })
  const contactInboxesMap = groupBy(contactInboxes, (ci) => ci.contactId)

  const messageRepository = await createMessageRepository()
  const lastMessagesPromises = conversations.map((c) => {
    const contactInbox = contactInboxesMap[c.Conversation.contactId]?.[0]
    if (!contactInbox?.lastMessageAt) {
      return Promise.resolve([])
    }

    return messageRepository.findLastByConversation(c.Conversation.id, {
      limit: 1,
      sinceTime: getSafeSinceTime(contactInbox.lastMessageAt),
    })
  })

  const lastMessagesResults = await Promise.all(lastMessagesPromises)
  const lastMessagesByConversationId = new Map(
    conversationIds.map((id, index) => [
      id,
      lastMessagesResults[index]?.[0] ?? null,
    ]),
  )

  return {
    data: conversations.map((c) => {
      const lastMessage = lastMessagesByConversationId.get(c.Conversation.id)
      return {
        ...c.Conversation,
        contact: c.Contact,
        contactInboxes: contactInboxesMap[c.Conversation.contactId] || [],
        assignedUser: c.User,
        assignedInboxTeam: c.InboxTeam,
        messages: lastMessage ? [lastMessage] : [],
      }
    }),
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

  const contactInbox = conversation.contactInboxes?.[0]
  const messageRepository = await createMessageRepository()
  const lastMessages = await messageRepository.findLastByConversation(
    conversation.id,
    {
      messageTypes: ["incoming", "outgoing"],
      limit: 1,
      sinceTime: getSafeSinceTime(
        endOfHour(contactInbox?.lastMessageAt ?? new Date()),
      ),
    },
  )

  return {
    data: {
      ...conversation,
      messages: lastMessages.length > 0 ? [lastMessages[0]] : [],
    },
  }
}

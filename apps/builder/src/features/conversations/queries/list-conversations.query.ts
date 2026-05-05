"use server"

import { notFoundException } from "@chatbotx.io/business/errors"
import {
  and,
  db,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  type SQL,
  sql,
} from "@chatbotx.io/database/client"
import {
  contactModel,
  conversationModel,
  inboxTeamModel,
  messageModel,
  userModel,
} from "@chatbotx.io/database/schema"
import { getPaginationWithDefaults } from "@chatbotx.io/database/utils"
import { parseBigIntId } from "@chatbotx.io/utils"
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

  // if (input.channel !== null && input.channel !== undefined) {
  //   where.push(eq(conversationModel.channel, input.channel))
  // }

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

  const lastMessageQuery = db
    .select()
    .from(messageModel)
    .where(
      and(
        eq(messageModel.conversationId, conversationModel.id),
        inArray(messageModel.messageType, ["incoming", "outgoing"]),
      ),
    )
    .orderBy(desc(messageModel.createdAt))
    .limit(1)

  const conversations = await db
    .select()
    .from(conversationModel)
    .leftJoinLateral(lastMessageQuery.as("lastMessage"), sql`true`)
    .leftJoin(contactModel, eq(conversationModel.contactId, contactModel.id))
    // .leftJoin(inboxModel, eq(conversationModel.inboxId, inboxModel.id))
    .leftJoin(userModel, eq(conversationModel.assignedUserId, userModel.id))
    .leftJoin(
      inboxTeamModel,
      eq(conversationModel.assignedInboxTeamId, inboxTeamModel.id),
    )
    .where(and(...where))
    .orderBy(desc(conversationModel.lastActivityAt))
    .limit(pagination.limit)

  const contactIds = conversations.map((c) => c.Conversation.contactId)

  const contactInboxes = await db.query.contactInboxModel.findMany({
    where: {
      contactId: {
        in: contactIds,
      },
    },
  })
  const contactInboxesMap = groupBy(contactInboxes, (ci) => ci.contactId)

  return {
    data: conversations.map((c) => ({
      ...c.Conversation,
      contact: c.Contact,
      contactInboxes: contactInboxesMap[c.Conversation.contactId] || [],
      assignedUser: c.User,
      assignedInboxTeam: c.InboxTeam,
      messages: c.lastMessage ? [c.lastMessage] : [],
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

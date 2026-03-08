"use server"

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
} from "@aha.chat/database/client"
import {
  contactModel,
  conversationModel,
  inboxModel,
  inboxTeamModel,
  messageModel,
  userModel,
} from "@aha.chat/database/schema"
import type { InboxType } from "@aha.chat/database/types"
import { getPaginationWithDefaults } from "@aha.chat/database/utils"
import type {
  FindConversationSchema,
  ListConversationsRequest,
} from "@/features/conversations/schemas/query"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  FindConversationResponse,
  ListConversationsResponse,
} from "../schemas/resource"

export const listConversations = async (
  chatbotId: string,
  input: ListConversationsRequest = {},
): Promise<ListConversationsResponse> => {
  await assertCurrentUserCanAccessChatbot(chatbotId)

  const pagination = getPaginationWithDefaults(input)

  const where: SQL[] = [eq(conversationModel.chatbotId, chatbotId)]

  if (input.liveChatEnabled !== null && input.liveChatEnabled !== undefined) {
    where.push(eq(conversationModel.liveChatEnabled, input.liveChatEnabled))
  }

  if (input.inboxType !== null && input.inboxType !== undefined) {
    where.push(eq(conversationModel.inboxType, input.inboxType as InboxType))
  }

  if (input.assignedId !== null && input.assignedId !== undefined) {
    if (input.assignedId === "unassigned") {
      where.push(isNull(conversationModel.assignedUserId))
      where.push(isNull(conversationModel.assignedInboxTeamId))
    } else if (input.assignedId.startsWith("u_")) {
      where.push(
        eq(conversationModel.assignedUserId, input.assignedId.substring(2)),
      )
    } else if (input.assignedId.startsWith("t_")) {
      where.push(
        eq(
          conversationModel.assignedInboxTeamId,
          input.assignedId.substring(2),
        ),
      )
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
        gt(conversationModel.lastActivityAt, conversationModel.agentLastSeenAt),
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
    .leftJoin(inboxModel, eq(conversationModel.inboxId, inboxModel.id))
    .leftJoin(userModel, eq(conversationModel.assignedUserId, userModel.id))
    .leftJoin(
      inboxTeamModel,
      eq(conversationModel.assignedInboxTeamId, inboxTeamModel.id),
    )
    .where(and(...where))
    .orderBy(desc(conversationModel.lastActivityAt))
    .limit(pagination.limit)

  return {
    data: conversations.map((c) => ({
      ...c.Conversation,
      contact: c.Contact,
      inbox: c.Inbox,
      assignedUser: c.User,
      assignedInboxTeam: c.InboxTeam,
      messages: c.lastMessage ? [c.lastMessage] : [],
    })),
    nextCursor: null,
    prevCursor: null,
  }
}

export const findConversation = async (
  input: FindConversationSchema,
): Promise<FindConversationResponse> => {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const conversation = await db.query.conversationModel.findFirst({
    with: {
      contact: true,
      inbox: true,
      messages: true,
      assignedUser: true,
      assignedInboxTeam: true,
    },
    where: input,
  })
  if (!conversation) {
    throw new Error("Conversation not found")
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

export const findConversationByContact = async ({
  chatbotId,
  contactId,
  inboxType,
}: {
  chatbotId: string
  contactId: string
  inboxType: InboxType
}) => {
  return await db.query.conversationModel.findFirst({
    where: {
      chatbotId,
      contactId,
      inbox: {
        inboxType,
      },
    },
  })
}

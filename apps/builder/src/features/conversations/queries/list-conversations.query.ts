"use server"

import { type Prisma, prisma } from "@aha.chat/database"
import {
  AssignerFilterType,
  ConversationStatus,
  ConversationType,
} from "@aha.chat/database/enums"
import type {
  ConversationModel,
  InboxType,
  MessageModel,
} from "@aha.chat/database/types"
import type {
  FindConversationSchema,
  ListConversationsRequest,
} from "@/features/conversations/schemas/query"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ConversationCollection,
  ConversationResource,
} from "../schemas/resource"

const getQueryDefault = ({
  chatbotId,
  input,
}: {
  chatbotId: string
  input: ListConversationsRequest
}): Prisma.ConversationWhereInput => ({
  chatbotId,
  liveChatEnabled:
    input.conversationType === ConversationType.human
      ? true
      : // biome-ignore lint/style/noNestedTernary: safe to use
        input.conversationType === ConversationType.bot
        ? false
        : undefined,
})

const getAssignedUserQuery = (
  value?: string | null,
): Prisma.ConversationWhereInput => {
  if (value === AssignerFilterType.unassigned) {
    return { assignedUserId: null, assignedInboxTeamId: null }
  }
  if (value && value !== AssignerFilterType.all) {
    return value.startsWith("u_")
      ? { assignedUserId: value.substring(2) }
      : { assignedInboxTeamId: value.substring(2) }
  }
  return {}
}

const getInboxTypeQuery = (value?: string): Prisma.ConversationWhereInput => {
  if (!value || value === "omnichannel") {
    return {}
  }
  return { inbox: { inboxType: value as InboxType } }
}

const getConversationStatusQuery = (
  value?: ConversationStatus[],
): Prisma.ConversationWhereInput => {
  if (!value || value.length === 0) {
    return {}
  }
  const statusQueries = value.map((status) => {
    switch (status) {
      case ConversationStatus.archived:
        return {
          archivedAt: { not: null },
        }
      case ConversationStatus.followUp:
        return {
          followed: true,
        }
      case ConversationStatus.blocked:
        return {
          contact: {
            blockedAt: { not: null },
          },
        }
      case ConversationStatus.noAdminReply: {
        return {
          adminRepliedAt: {
            lt: prisma.conversation.fields.contactRepliedAt,
          },
        }
      }
      case ConversationStatus.unread:
        return {
          agentLastSeenAt: {
            lt: prisma.conversation.fields.contactLastSeenAt,
          },
        }
      default:
        return {}
    }
  })
  return { OR: statusQueries }
}

const getSearchQuery = (value?: string): Prisma.ConversationWhereInput => {
  if (!value) {
    return {}
  }
  return {
    OR: [
      {
        contact: {
          firstName: { contains: value, mode: "insensitive" },
        },
      },
      {
        contact: {
          lastName: { contains: value, mode: "insensitive" },
        },
      },
      {
        contact: {
          email: { contains: value, mode: "insensitive" },
        },
      },
      {
        contact: {
          phoneNumber: { contains: value, mode: "insensitive" },
        },
      },
    ],
  }
}

export const listConversations = async (
  chatbotId: string,
  input: ListConversationsRequest = {},
): Promise<ConversationCollection> => {
  await assertCurrentUserCanAccessChatbot(chatbotId)

  const perPage = (input.perPage || 10) + 1
  const where: Prisma.ConversationWhereInput = {
    ...getQueryDefault({ chatbotId, input }),
    ...getAssignedUserQuery(input.assignedUserId),
    ...getInboxTypeQuery(input.inboxType),
    ...getConversationStatusQuery(input.status),
    ...getSearchQuery(input.searchText),
  }

  const params: Prisma.ConversationFindManyArgs = {
    include: {
      contact: {
        include: {
          contactCustomFields: true,
          contactNotes: {
            include: {
              createdBy: true,
            },
          },
          tags: true,
        },
      },
      inbox: true,
      assignedUser: true,
      assignedInboxTeam: true,
    },
    take: perPage,
    where,
    cursor: input.cursor
      ? {
          id: input.cursor,
        }
      : undefined,
    orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }],
  }

  let conversations: ConversationResource[] =
    await prisma.conversation.findMany(params)

  // Get last message of conversation
  const conversationIds = conversations.map((conversation) => conversation.id)
  const lastMessages = await prisma.message.findMany({
    where: {
      conversationId: {
        in: conversationIds,
      },
    },
    distinct: ["conversationId"],
    orderBy: {
      createdAt: "desc",
    },
  })

  const lastMessagesGroup: Record<string, MessageModel[]> = lastMessages.reduce(
    (result, message) => {
      if (!result[message.conversationId]) {
        result[message.conversationId] = []
      }
      result[message.conversationId]?.push(message)

      return result
    },
    {} as Record<string, MessageModel[]>,
  )

  // Mapping last message to conversation
  for (const conversation of conversations) {
    conversation.messages = lastMessagesGroup[conversation.id] ?? []
  }

  if (conversations.length === 0) {
    return { data: [], nextCursor: null, prevCursor: null }
  }

  let nextCursor: string | null = null
  const prevCursor: string | null = null
  if (conversations.length === perPage) {
    const lastConversation = conversations.at(-1) as ConversationModel
    nextCursor = lastConversation.id

    conversations = conversations.slice(0, conversations.length - 1)
  }

  return { data: conversations, nextCursor, prevCursor }
}

export const findConversation = async (
  input: FindConversationSchema,
): Promise<{
  data: ConversationResource
}> => {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const conversation = await prisma.conversation.findFirstOrThrow({
    include: {
      contact: true,
      inbox: true,
    },
    where: input,
  })

  return { data: conversation as ConversationResource }
}

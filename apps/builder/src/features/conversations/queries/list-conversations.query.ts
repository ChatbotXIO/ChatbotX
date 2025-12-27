"use server"

import { type Prisma, prisma } from "@aha.chat/database"
import type { ConversationModel, MessageModel } from "@aha.chat/database/types"
import type {
  FindConversationSchema,
  ListConversationsRequest,
} from "@/features/conversations/schemas/query"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ConversationCollection,
  ConversationResource,
} from "../schemas/resource"

export const listConversations = async (
  chatbotId: string,
  input: ListConversationsRequest,
): Promise<ConversationCollection> => {
  await assertCurrentUserCanAccessChatbot(chatbotId)

  const perPage = (input.perPage || 10) + 1
  const where: Prisma.ConversationWhereInput = {
    chatbotId,
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

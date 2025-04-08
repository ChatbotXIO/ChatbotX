"use server"

import { getCurrentUserId } from "@/auth"
import type {
  ConversationCollection,
  ConversationResource,
  FindConversationSchema,
  ListConversationsRequest,
} from "@/features/conversations/schemas/get-conversations.schema"
import { findChatbotOrFail } from "@/lib/user-permissions"
import {
  type Conversation,
  type Message,
  type Prisma,
  SenderType,
  prisma,
} from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"

export const listConversations = async (
  chatbotId: string,
  input: ListConversationsRequest,
): Promise<ConversationCollection> => {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, chatbotId)

  // return await unstable_cache(
  //   async () => {
  try {
    const perPage = (input.perPage || 10) + 1
    const where: Prisma.ConversationWhereInput = {
      chatbotId,
    }

    const params: Prisma.ConversationFindManyArgs = {
      include: {
        contact: true,
        inbox: true,
        _count: {
          select: {
            messages: {
              where: {
                senderType: SenderType.USER,
                // createdAt: {
                //   gt: prisma.conversation.fields.contactLastSeenAt
                // }
              },
            },
          },
        },
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

    const lastMessagesGroup: Record<string, Message[]> = lastMessages.reduce(
      (result, message) => {
        if (!result[message.conversationId]) {
          result[message.conversationId] = []
        }
        result[message.conversationId]?.push(message)

        return result
      },
      {} as Record<string, Message[]>,
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
      const lastConversation = conversations[
        conversations.length - 1
      ] as Conversation
      nextCursor = lastConversation.id

      conversations = conversations.slice(0, conversations.length - 1)
    }

    return { data: conversations, nextCursor, prevCursor }
  } catch (_err) {
    return { data: [], nextCursor: null, prevCursor: null }
  }
  //   },
  //   [JSON.stringify(input)],
  //   {
  //     revalidate: 3600,
  //     tags: [`u${userId}#c${input.chatbotId}#conversations`],
  //   },
  // )()
}

export const findConversation = async (
  input: FindConversationSchema,
): Promise<{
  data: ConversationResource
}> => {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      const conversation = await prisma.conversation.findFirstOrThrow({
        include: {
          contact: true,
          //   messages: {
          //     orderBy: {
          //       createdAt: "desc",
          //     },
          //     take: 1,
          //   },
        },
        where: input,
      })
      // const { messages, ...rest } = data

      // const conversation = {
      //   ...rest,
      //   latestMessage: messages[0] || null,
      //   unreadCount: 0,
      // }

      return { data: conversation as ConversationResource }
    },
    [JSON.stringify(input)],
    {
      revalidate: 1,
      tags: [
        `chatbots:${input.chatbotId}#conversations`,
        `chatbots:${input.chatbotId}#conversations:${input.id}`,
      ],
    },
  )()
}

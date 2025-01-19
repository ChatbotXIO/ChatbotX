"use server"

import { getCurrentUserId } from "@/auth"
import type {
  ConversationResource,
  CursorConversations,
  GetConversationsSchema,
  GetCurrentConversationsSchema,
} from "@/features/conversations/schemas/get-conversations-schema"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { Prisma, prisma } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"

export interface IUnreadMessage {
  id: string
  unread_count: bigint
}

export const getConversations = async (
  input: GetConversationsSchema,
): Promise<{
  data: ConversationResource[]
  cursor: CursorConversations | null
}> => {
  const userId = await getCurrentUserId()

  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      try {
        const perPage = input.perPage || 10
        const where: Prisma.ConversationWhereInput = {
          chatbotId: input.chatbotId,
        }

        const data = await prisma.conversation.findMany({
          include: {
            contact: {
              include: {
                assignedUser: true,
              },
            },
            messages: {
              orderBy: {
                createdAt: "desc",
              },
              take: 1,
            },
          },
          take: perPage,
          where,
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          ...(input.cursor ? { cursor: input.cursor, skip: 1 } : {}),
        })

        const conversationIds = data.map((conversation) => conversation.id)
        const unreadMessages = await prisma.$queryRaw<IUnreadMessage[]>`
            SELECT c.id, COUNT(m.id) AS unread_count
            FROM "Conversation" c
                     JOIN "Message" m ON m."conversationId" = c.id
            WHERE m."createdAt" < c."agentLastSeenAt"
              AND c.id IN (${Prisma.join(conversationIds)})
            GROUP BY c.id;`

        let cursor = null
        if (data.length === perPage) {
          cursor = {
            updatedAt: data[data.length - 1]?.updatedAt as Date,
            id: data[data.length - 1]?.id as string,
          }
        }
        const processData = data.map<ConversationResource>((conversation) => {
          const { messages, ...rest } = conversation
          const unreadMessage = unreadMessages.find(
            (obj) => obj.id === conversation.id,
          )

          return {
            ...rest,
            latestMessage: messages[0] || null,
            unreadCount: (unreadMessage?.unread_count ?? 0).toString(),
          }
        })

        return { data: processData, cursor }
      } catch (err) {
        console.log("err", err)
        return { data: [], cursor: null }
      }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`${userId}#conversations#${input.chatbotId}`],
    },
  )()
}

export const getCurrentConversation = async (
  input: GetCurrentConversationsSchema,
): Promise<{
  conversation: ConversationResource
}> => {
  const userId = await getCurrentUserId()

  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      const data = await prisma.conversation.findFirstOrThrow({
        include: {
          contact: {
            include: {
              assignedUser: true,
            },
          },
          messages: {
            orderBy: {
              createdAt: "desc",
            },
            take: 1,
          },
        },
        where: input,
      })
      const { messages, ...rest } = data

      const conversation = {
        ...rest,
        latestMessage: messages[0] || null,
        unreadCount: 0,
      }

      return { conversation }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`${userId}#conversations`, `conversations#${input.id}`],
    },
  )()
}

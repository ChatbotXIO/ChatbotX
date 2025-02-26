"use server"

import { getCurrentUserId } from "@/auth"
import { parseCursor } from "@/features/common/types"
import type {
  ConversationCollection,
  ConversationResource,
  FindConversationSchema,
  ListConversationsSchema,
} from "@/features/conversations/schemas/get-conversations-schema"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type Prisma, SenderType, prisma } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"

export const listConversations = async (
  input: ListConversationsSchema,
): Promise<ConversationCollection> => {
  const userId = await getCurrentUserId()

  console.log("ddddddd", input)

  await findChatbotOrFail(userId, input.chatbotId)

  // return await unstable_cache(
  //   async () => {
  try {
    const perPage = (input.perPage || 10) + 1
    const where: Prisma.ConversationWhereInput = {
      chatbotId: input.chatbotId,
    }

    const params: Prisma.ConversationFindManyArgs = {
      include: {
        contact: {
          include: {
            assignedUser: true,
            assignedTeam: true,
          },
        },
        messages: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
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
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }
    if (input.cursor) {
      const cursor = parseCursor(input.cursor)
      if (cursor) {
        params.cursor = cursor
        // params.skip = 1
      }
    }

    let conversations = await prisma.conversation.findMany(params)

    // const conversationIds = data.map((conversation) => conversation.id)
    // const unreadMessages = await prisma.$queryRaw<IUnreadMessage[]>`
    //     SELECT c.id, COUNT(m.id) AS unread_count
    //     FROM "Conversation" c
    //              JOIN "Message" m ON m."conversationId" = c.id
    //     WHERE m."createdAt" < c."agentLastSeenAt"
    //       AND c.id IN (${Prisma.join(conversationIds)})
    //     GROUP BY c.id;`

    if (conversations.length === 0) {
      return { data: [], nextCursor: null, prevCursor: null }
    }

    let nextCursor: string | null = null
    const prevCursor: string | null = null
    if (conversations.length === perPage) {
      nextCursor = Buffer.from(
        JSON.stringify({
          direction: "next",
          createdAt: conversations[conversations.length - 1]?.createdAt as Date,
          id: conversations[conversations.length - 1]?.id as string,
        }),
      ).toString("base64")

      conversations = conversations.slice(0, conversations.length - 1)
    }
    // const processData = data.map<ConversationResource>((conversation) => {
    //   const { messages, ...rest } = conversation
    //   const unreadMessage = unreadMessages.find(
    //     (obj) => obj.id === conversation.id,
    //   )

    //   return {
    //     ...rest,
    //     latestMessage: messages[0] || null,
    //     unreadCount: (unreadMessage?.unread_count ?? 0).toString(),
    //   }
    // })

    return { data: conversations.reverse(), nextCursor, prevCursor }
  } catch (err) {
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
          contact: {
            include: {
              assignedUser: true,
              assignedTeam: true,
            },
          },
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

      return { data: conversation }
    },
    [JSON.stringify(input)],
    {
      revalidate: 1,
      tags: [`${userId}#conversations`, `conversations#${input.id}`],
    },
  )()
}

"use server"

import { getCurrentUserId } from "@/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { Prisma, prisma } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"
import { CursorMessages, GetMessagesSchema, MessageResource } from "@/features/messages/schemas/get-messages-schema";

export const getMessages = async (input: GetMessagesSchema): Promise<{
  data: MessageResource[],
  cursor: CursorMessages | null
}> => {
  const userId = await getCurrentUserId()

  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(async () => {
    try {
      const perPage = input.perPage || 20
      const where: Prisma.MessageWhereInput = {
        chatbotId: input.chatbotId,
        conversationId: input.conversationId
      }

      const data = await prisma.message.findMany({
        include: {
          attachments: true,
        },
        take: perPage,
        where,
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" }
        ],
        ...(input.cursor ? { cursor: input.cursor, skip: 1 } : {})
      })
      let cursor = null
      if (data.length === perPage) {
        cursor = {
          createdAt: data[data.length - 1]?.createdAt as Date,
          id: data[data.length - 1]?.id as string
        }
      }

      return { data, cursor }
    } catch (err) {
      console.log('err', err)
      return { data: [], cursor: null }
    }
  }, [JSON.stringify(input)], {
    revalidate: 3600,
    tags: [
      `${userId}#conversations#${input.chatbotId}`,
    ]
  })()
}

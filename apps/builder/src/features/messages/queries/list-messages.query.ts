"use server"

import { getCurrentUserId } from "@/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type Message, type Prisma, prisma } from "@ahachat.ai/database"
import type {
  MessageCollection,
  MessageResource,
} from "../schemas/list-messages.schema"
import type { ListMessagesRequest } from "../schemas/list-messages.schema"

export const listMessages = async (
  chatbotId: string,
  input: ListMessagesRequest,
): Promise<MessageCollection> => {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, chatbotId)

  // return await unstable_cache(
  //   async () => {
  try {
    const perPage = (input.perPage || 10) + 1
    const where: Prisma.MessageWhereInput = {
      chatbotId,
      conversationId: input.conversationId,
    }

    const params: Prisma.MessageFindManyArgs = {
      include: {
        attachments: true,
      },
      take: perPage,
      where,
      cursor: input.cursor
        ? {
            id: input.cursor,
          }
        : undefined,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }

    let messages: MessageResource[] = await prisma.message.findMany(params)

    if (messages.length === 0) {
      return { data: [], nextCursor: null, prevCursor: null }
    }

    let nextCursor: string | null = null
    const prevCursor: string | null = null
    if (messages.length === perPage) {
      const lastMessage = messages[messages.length - 1] as Message
      nextCursor = lastMessage.id

      messages = messages.slice(0, messages.length - 1)
    }

    return { data: messages, nextCursor, prevCursor }
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

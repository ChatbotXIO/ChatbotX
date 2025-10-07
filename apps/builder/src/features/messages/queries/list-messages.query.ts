"use server"

import { type Prisma, prisma } from "@aha.chat/database"
import type { MessageModel } from "@aha.chat/database/types"
import { getCurrentUserId } from "@/lib/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import type { MessageCollection, MessageResource } from "../schemas"
import type {
  FindMessageSchema,
  ListMessagesRequest,
} from "../schemas/list-messages.schema"

export const listMessages = async (
  chatbotId: string,
  input: ListMessagesRequest,
): Promise<MessageCollection> => {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, chatbotId)

  // return await unstable_cache(
  //   async () => {
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
    const lastMessage = messages.at(-1) as MessageModel
    nextCursor = lastMessage.id

    messages = messages.slice(0, messages.length - 1)
  }

  return { data: messages, nextCursor, prevCursor }
  //   },
  //   [JSON.stringify(input)],
  //   {
  //     revalidate: 3600,
  //     tags: [`u${userId}#c${input.chatbotId}#conversations`],
  //   },
  // )()
}

export const findMessage = async (
  input: FindMessageSchema,
): Promise<MessageResource> => {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

  const message = await prisma.message.findFirstOrThrow({
    include: {
      attachments: true,
    },
    where: input,
  })

  return message as MessageResource
}

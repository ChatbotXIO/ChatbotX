"use server"

import { type Prisma, prisma } from "@aha.chat/database"
import type { MessageModel } from "@aha.chat/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { MessageCollection, MessageResource } from "../schemas"
import type {
  FindMessageSchema,
  ListMessagesRequest,
} from "../schemas/list-messages.schema"

export const listMessages = async (
  chatbotId: string,
  input: ListMessagesRequest,
): Promise<MessageCollection> => {
  await assertCurrentUserCanAccessChatbot(chatbotId)

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
}

export const findMessage = async (
  input: FindMessageSchema,
): Promise<MessageResource> => {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const message = await prisma.message.findFirstOrThrow({
    include: {
      attachments: true,
    },
    where: input,
  })

  return message as MessageResource
}

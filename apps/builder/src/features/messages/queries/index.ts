"use server"

import { getCurrentUserId } from "@/auth"
import type {
  GetMessagesSchema,
  MessageCollection,
} from "@/features/messages/schemas/get-messages-schema"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type Prisma, prisma } from "@ahachat.ai/database"

export const getMessages = async (
  input: GetMessagesSchema,
): Promise<MessageCollection> => {
  const userId = await getCurrentUserId()

  await findChatbotOrFail(userId, input.chatbotId)

  // return await unstable_cache(
  //   async () => {
  try {
    const perPage = input.perPage || 20
    const where: Prisma.MessageWhereInput = {
      chatbotId: input.chatbotId,
      conversationId: input.conversationId,
    }

    const data = await prisma.message.findMany({
      include: {
        attachments: true,
      },
      take: perPage,
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(input.cursor ? { cursor: input.cursor, skip: 1 } : {}),
    })

    // let cursor = null
    // if (data.length === perPage) {
    //   cursor = {
    //     createdAt: data[data.length - 1]?.createdAt as Date,
    //     id: data[data.length - 1]?.id as string,
    //   }
    // }

    return { data, nextCursor: null, prevCursor: null }
  } catch (_err) {
    return { data: [], nextCursor: null, prevCursor: null }
  }
  // },
  //   [JSON.stringify(input)],
  //   {
  //     revalidate: 3600,
  //     tags: [`${userId}#conversations#${input.chatbotId}`],
  //   },
  // )()
}

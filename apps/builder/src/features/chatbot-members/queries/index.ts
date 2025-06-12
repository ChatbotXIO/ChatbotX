import { getCurrentUserId } from "@/auth"
import type { ChatbotResource } from "@/features/chatbots/schemas"
import { findChatbotOrFail } from "@/lib/user-permissions"
import type { Prisma } from "@ahachat.ai/database"
import { prisma } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"
import type { ChatbotMemberCollection, ChatbotMemberResource } from "../schemas"
import type { GetChatbotMembersSchema } from "../schemas/get-chatbot-members-schema"

export async function getAgents(
  input: GetChatbotMembersSchema,
): Promise<ChatbotMemberCollection> {
  const userId = await getCurrentUserId()

  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      const where: Prisma.ChatbotMemberWhereInput = {
        chatbotId: input.chatbotId,
        user: input.keyword
          ? {
              name: {
                contains: input.keyword,
                mode: "insensitive",
              },
            }
          : undefined,
      }

      const [data, total] = await prisma.$transaction([
        prisma.chatbotMember.findMany({
          skip: (input.page - 1) * input.perPage,
          take: input.perPage,
          where,
          include: {
            user: true,
          },
        }),
        prisma.chatbotMember.count({
          where,
        }),
      ])
      const pageCount = Math.ceil(total / input.perPage)

      return { data, pageCount }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`chatbots:${input.chatbotId}#chatbotMembers`],
    },
  )()
}

export const getAllChatbotMembers = async (
  userId: string,
): Promise<{
  chatbotMembers: ChatbotMemberResource[]
  chatbots: ChatbotResource[]
  chatbotIds: string[]
}> => {
  return await unstable_cache(
    async () => {
      const chatbotMembers = await prisma.chatbotMember.findMany({
        where: {
          userId,
        },
        orderBy: {
          createdAt: "asc",
        },
        include: {
          chatbot: true,
        },
      })
      const chatbots = chatbotMembers.map((cm) => cm.chatbot).filter((c) => !!c)
      const chatbotIds = chatbots.map((c) => c.id)

      return { chatbotMembers, chatbots, chatbotIds }
    },
    [userId],
    {
      tags: [`users:${userId}#chatbotMembers`],
    },
  )()
}

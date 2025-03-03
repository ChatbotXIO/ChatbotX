import { getCurrentUserId } from "@/auth"
import type { ChatbotResource } from "@/features/chatbots/schemas"
import { findChatbotOrFail } from "@/lib/user-permissions"
import type { Prisma } from "@ahachat.ai/database"
import { prisma } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"
import { ChatbotMemberException, type ChatbotMemberResource } from "../schemas"
import type { ChatbotMemberWithUser } from "../schemas/add-chatbot-member-schema"
import type { GetChatbotMembersSchema } from "../schemas/get-chatbot-members-schema"

export async function getAgents(
  input: GetChatbotMembersSchema,
): Promise<{ data: ChatbotMemberWithUser[]; pageCount: number }> {
  const userId = await getCurrentUserId()

  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      try {
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
      } catch (_error) {
        return { data: [], pageCount: 0 }
      }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`${userId}#chatbotMembers`],
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
      try {
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
        const chatbots = chatbotMembers
          .map((cm) => cm.chatbot)
          .filter((c) => !!c)
        const chatbotIds = chatbots.map((c) => c.id)

        return { chatbotMembers, chatbots, chatbotIds }
      } catch (_error) {
        return { chatbotMembers: [], chatbots: [], chatbotIds: [] }
      }
    },
    [userId],
    {
      tags: [`${userId}#chatbots`],
    },
  )()
}

export const ensureUserCanAccessChatbot = async (
  userId: string,
  chatbotId: string,
  throwable = true,
) => {
  const { chatbots } = await getAllChatbotMembers(userId)
  const ok = chatbots.some((c) => c.id === chatbotId)

  if (!ok && throwable) {
    throw new ChatbotMemberException("Chatbot not found")
  }
}

"use server"

import type { Prisma } from "@aha.chat/database"
import { prisma } from "@aha.chat/database"
import type { ChatbotResource } from "@/features/chatbots/schemas/resource"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { getPaginationFromInput } from "@/lib/pagination"
import type { GetChatbotMembersSchema } from "../schemas/get-chatbot-members.request"
import type {
  ChatbotMemberCollection,
  ChatbotMemberResource,
} from "../schemas/resource"

export async function getAgents(
  input: GetChatbotMembersSchema,
): Promise<ChatbotMemberCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const pagination = getPaginationFromInput(input)

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
      ...pagination,
      where,
      include: {
        user: true,
      },
    }),
    prisma.chatbotMember.count({
      where,
    }),
  ])
  const pageCount = Math.ceil(total / (pagination.take ?? 10))

  return { data: data as ChatbotMemberResource[], pageCount }
}

export const getAllChatbotMembers = async (
  userId: string,
): Promise<{
  chatbotMembers: ChatbotMemberResource[]
  chatbots: ChatbotResource[]
  chatbotIds: string[]
}> => {
  const chatbotMembers = (await prisma.chatbotMember.findMany({
    where: {
      userId,
    },
  })) as ChatbotMemberResource[]
  const chatbots = await prisma.chatbot.findMany({
    where: {
      id: {
        in: chatbotMembers.map((cm) => cm.chatbotId),
      },
    },
  })
  const chatbotIds = chatbots.map((c) => c.id)

  return { chatbotMembers, chatbots, chatbotIds }
}

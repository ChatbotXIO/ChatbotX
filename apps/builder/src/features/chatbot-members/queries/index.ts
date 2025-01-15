import { getCurrentUserId } from "@/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { prisma } from "@ahachat.ai/database"
import type { Prisma } from "@prisma/client"
import { unstable_cache } from "next/cache"
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
      } catch (error) {
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

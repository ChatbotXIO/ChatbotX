import { prisma } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"

export const getAllChatbotMembers = async (userId: string) => {
  return await unstable_cache(
    async () => {
      try {
        const chatbotMember = await prisma.chatbotMember.findMany({
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
      } catch (error) {
        return []
      }
    },
    [userId],
    {
      tags: [`${userId}#chatbots`],
    },
  )()
}

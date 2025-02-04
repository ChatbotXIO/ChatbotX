import { prisma } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"

export const getAllChatbotsOfUser = async (userId: string) => {
  return await unstable_cache(
    async () => {
      try {
        return await prisma.chatbot.findMany({
          where: {
            chatbotMembers: {
              some: {
                userId,
              },
            },
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

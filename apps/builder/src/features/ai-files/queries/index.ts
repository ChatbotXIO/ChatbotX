import { prisma } from "@aha.chat/database"
import { unstable_cache } from "next/cache"
import { getCurrentUserId } from "@/lib/auth"
import { calcCacheTags } from "@/lib/cache-helper"
import { findChatbotOrFail } from "@/lib/user-permissions"
import type { AIFileCollection, GetAIFilesRequest } from "../schemas"

export async function getAIFiles(
  input: GetAIFilesRequest,
): Promise<AIFileCollection> {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      const data = await prisma.aIFile.findMany({
        where: {
          chatbotId: input.chatbotId,
        },
        include: {
          aiEmbeddings: {
            select: {
              id: true,
            },
          },
        },
      })

      // Transform data to include processing status
      const transformedData = data.map(file => ({
        ...file,
        isProcessed: file.aiEmbeddings.length > 0,
        chunksCount: file.aiEmbeddings.length,
      }))

      return { data: transformedData }
    },
    [JSON.stringify(input)],
    calcCacheTags(`chatbots:${input.chatbotId}#aiFiles`),
  )()
}

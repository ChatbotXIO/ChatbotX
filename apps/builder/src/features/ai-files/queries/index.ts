import { AIEmbeddingStatus, prisma } from "@aha.chat/database"
import { unstable_cache } from "next/cache"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { calcCacheTags } from "@/lib/cache-helper"
import type {
  AIFileCollection,
  GetAIFilesRequest,
  ProcessingStatus,
} from "../schemas"

export async function getAIFiles(
  input: GetAIFilesRequest,
): Promise<AIFileCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

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
              status: true,
            },
          },
        },
      })

      const transformedData = data.map((file) => {
        const embeddings = file.aiEmbeddings
        const hasEmbeddings = embeddings.length > 0

        let processingStatus: ProcessingStatus = "idle"
        if (hasEmbeddings) {
          const statusSet = new Set(embeddings.map((e) => e.status))
          if (statusSet.has(AIEmbeddingStatus.error)) {
            processingStatus = "error"
          } else if (statusSet.has(AIEmbeddingStatus.pending)) {
            processingStatus = "processing"
          } else {
            processingStatus = "success"
          }
        }

        return {
          ...file,
          isProcessed:
            hasEmbeddings &&
            embeddings.every((e) => e.status === AIEmbeddingStatus.success),
          chunksCount: embeddings.length,
          processingStatus,
        }
      })

      return { data: transformedData }
    },
    [JSON.stringify(input)],
    calcCacheTags(`chatbots:${input.chatbotId}#aiFiles`),
  )()
}

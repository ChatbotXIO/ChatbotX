import { AIEmbeddingStatus, prisma } from "@aha.chat/database"
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
              status: true,
            },
          },
        },
      })

      // Transform data to include processing status based on embeddings status
      const transformedData = data.map((file) => {
        const embeddings = file.aiEmbeddings
        const hasEmbeddings = embeddings.length > 0

        // Determine overall status based on embeddings status
        let processingStatus: "idle" | "processing" | "success" | "error" =
          "idle"
        if (hasEmbeddings) {
          const statuses = embeddings.map((e) => e.status)
          if (statuses.some((s) => s === AIEmbeddingStatus.error)) {
            processingStatus = "error"
          } else if (statuses.some((s) => s === AIEmbeddingStatus.pending)) {
            processingStatus = "processing"
          } else if (statuses.every((s) => s === AIEmbeddingStatus.success)) {
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

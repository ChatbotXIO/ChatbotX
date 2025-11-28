"use server"

import { AIEmbeddingStatus, prisma } from "@aha.chat/database"
import { env } from "@/env"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { AIFileCollection, GetAIFilesRequest } from "../schemas"

export async function getAIFiles(
  input: GetAIFilesRequest,
): Promise<AIFileCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

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
    const hasEmbeddings = file.aiEmbeddings.length > 0
    let processingStatus: AIEmbeddingStatus = AIEmbeddingStatus.pending
    if (hasEmbeddings) {
      const statusSet = new Set(file.aiEmbeddings.map((e) => e.status))
      if (statusSet.has(AIEmbeddingStatus.error)) {
        processingStatus = AIEmbeddingStatus.error
      } else if (statusSet.has(AIEmbeddingStatus.pending)) {
        processingStatus = AIEmbeddingStatus.processing
      } else {
        processingStatus = AIEmbeddingStatus.success
      }
    }

    return {
      id: file.id,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      chatbotId: file.chatbotId,
      mimeType: file.mimeType,
      size: file.size,
      name: file.name,
      path: file.path,
      url: new URL(file.path, env.NEXT_PUBLIC_ASSET_URL).toString(),
      chunksCount: file.aiEmbeddings.length,
      processingStatus,
    }
  })

  return { data: transformedData }
}

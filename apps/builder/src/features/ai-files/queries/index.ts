"use server"

import { db } from "@chatbotx.io/database/client"
import type { AIEmbeddingStatus } from "@chatbotx.io/database/partials"
import { uploader } from "@chatbotx.io/filesystem"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListAIFilesRequest, ListAIFilesResponse } from "../schema"

export async function listAIFiles(
  input: ListAIFilesRequest,
): Promise<ListAIFilesResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const data = await db.query.aiFileModel.findMany({
    where: {
      workspaceId: input.workspaceId,
    },
    with: {
      aiEmbeddings: {
        columns: {
          id: true,
          status: true,
        },
      },
    },
  })

  const transformedData = await Promise.all(
    data.map(async (file) => {
      const hasEmbeddings = file.aiEmbeddings.length > 0
      let processingStatus: AIEmbeddingStatus = "pending"
      if (hasEmbeddings) {
        const statusSet = new Set(file.aiEmbeddings.map((e) => e.status))
        if (statusSet.has("error")) {
          processingStatus = "error"
        } else if (statusSet.has("pending")) {
          processingStatus = "processing"
        } else {
          processingStatus = "success"
        }
      }

      return {
        id: file.id,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
        workspaceId: file.workspaceId,
        mimeType: file.mimeType,
        size: file.size,
        name: file.name,
        path: file.path,
        url: await uploader.getPresignedDownload(file.path),
        chunksCount: file.aiEmbeddings.length,
        processingStatus,
      }
    }),
  )

  return { data: transformedData }
}

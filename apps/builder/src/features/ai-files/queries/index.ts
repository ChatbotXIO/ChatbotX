"use server"

import { resolvePlatformSettings } from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import type { AIEmbeddingStatus } from "@chatbotx.io/database/partials"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListAIFilesRequest, ListAIFilesResponse } from "../schemas"

export async function listAIFiles(
  input: ListAIFilesRequest,
): Promise<ListAIFilesResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const [data, { assetUrl }] = await Promise.all([
    db.query.aiFileModel.findMany({
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
    }),
    resolvePlatformSettings({ workspaceId: input.workspaceId }),
  ])

  const transformedData = data.map((file) => {
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
      url: new URL(file.path, assetUrl).toString(),
      chunksCount: file.aiEmbeddings.length,
      processingStatus,
    }
  })

  return { data: transformedData }
}

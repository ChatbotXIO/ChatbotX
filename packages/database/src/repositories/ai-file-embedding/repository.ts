import { and, eq, notInArray } from "drizzle-orm"
import type { DatabaseClient } from "../../client"
import { aiEmbeddingStatuses } from "../../partials"
import { aiEmbeddingModel } from "../../schema"

export type AiFileEmbeddingChunk = {
  content: string
  id: string
}

export type PendingAiFileEmbedding = {
  id: string
}

export class AiFileEmbeddingRepository {
  private readonly client: DatabaseClient

  constructor(client: DatabaseClient) {
    this.client = client
  }

  async findFileOrFail(aiFileId: string) {
    const aiFile = await this.client.query.aiFileModel.findFirst({
      where: { id: aiFileId },
    })

    if (!aiFile) {
      throw new Error("AI file not found")
    }

    return aiFile
  }

  reconcilePendingChunks(input: {
    aiFileId: string
    chunks: AiFileEmbeddingChunk[]
    workspaceId: string
  }): Promise<PendingAiFileEmbedding[]> {
    return this.client.transaction(async (tx) => {
      const chunkIds = input.chunks.map((chunk) => chunk.id)

      if (chunkIds.length === 0) {
        await tx
          .delete(aiEmbeddingModel)
          .where(
            and(
              eq(aiEmbeddingModel.aiFileId, input.aiFileId),
              eq(aiEmbeddingModel.workspaceId, input.workspaceId),
            ),
          )
        return []
      }

      await tx
        .delete(aiEmbeddingModel)
        .where(
          and(
            eq(aiEmbeddingModel.aiFileId, input.aiFileId),
            eq(aiEmbeddingModel.workspaceId, input.workspaceId),
            notInArray(aiEmbeddingModel.id, chunkIds),
          ),
        )

      await tx
        .insert(aiEmbeddingModel)
        .values(
          input.chunks.map((chunk) => ({
            aiFileId: input.aiFileId,
            content: chunk.content,
            id: chunk.id,
            status: aiEmbeddingStatuses.enum.pending,
            workspaceId: input.workspaceId,
          })),
        )
        .onConflictDoNothing()

      const embeddings = await tx.query.aiEmbeddingModel.findMany({
        columns: { id: true, status: true },
        where: {
          aiFileId: input.aiFileId,
          workspaceId: input.workspaceId,
        },
      })

      return embeddings
        .filter(
          (embedding) => embedding.status === aiEmbeddingStatuses.enum.pending,
        )
        .map((embedding) => ({ id: embedding.id }))
    })
  }
}

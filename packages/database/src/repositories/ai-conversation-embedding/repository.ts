import { eq, sql } from "drizzle-orm"
import { z } from "zod"
import type { DatabaseClient } from "../../client"
import { aiEmbeddingStatuses } from "../../partials"
import { aiConversationEmbeddingModel } from "../../schema"

export type AiConversationEmbeddingModel =
  typeof aiConversationEmbeddingModel.$inferSelect

export type EmbeddingChunkInput = {
  chunkIndex: number
  content: string
  conversationId: string
  id: string
  sourceId: string
  workspaceId: string
}

export type VectorSearchRow = {
  chunkIndex: number | null
  content: string
  similarity: number | null
}

const nullableNumberSchema = z.preprocess((value) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}, z.number().finite().nullable())

const vectorSearchRowSchema = z.object({
  chunkIndex: z.preprocess((value) => {
    if (typeof value === "number") {
      return Number.isInteger(value) ? value : null
    }
    if (typeof value === "string") {
      const parsed = Number(value)
      return Number.isInteger(parsed) ? parsed : null
    }
    return null
  }, z.number().int().nullable()),
  content: z.string(),
  similarity: nullableNumberSchema,
})

export class ConversationEmbeddingRepository {
  private readonly client: DatabaseClient

  constructor(client: DatabaseClient) {
    this.client = client
  }

  findManyBySource(params: {
    limit: number
    sourceId: string
    workspaceId: string
  }): Promise<AiConversationEmbeddingModel[]> {
    return this.client.query.aiConversationEmbeddingModel.findMany({
      where: {
        sourceId: params.sourceId,
        workspaceId: params.workspaceId,
        status: aiEmbeddingStatuses.enum.success,
      },
      orderBy: { chunkIndex: "asc" },
      limit: params.limit,
    })
  }

  async vectorSearch(params: {
    queryVector: string
    sourceId: string
    topK: number
    workspaceId: string
  }): Promise<VectorSearchRow[]> {
    const result = await this.client.execute(sql`
      SELECT
        "id",
        "chunkIndex",
        "content",
        1 - ("embedding" <=> ${params.queryVector}::vector) as similarity
      FROM "AIConversationEmbedding"
      WHERE "sourceId" = ${params.sourceId}
        AND "workspaceId" = ${params.workspaceId}
        AND "status" = ${aiEmbeddingStatuses.enum.success}::"aiConversationEmbeddingStatus"
        AND "embedding" IS NOT NULL
      ORDER BY "embedding" <=> ${params.queryVector}::vector
      LIMIT ${params.topK}
    `)

    const rows: VectorSearchRow[] = []
    for (const row of result.rows) {
      const parsed = vectorSearchRowSchema.safeParse(row)
      if (!parsed.success) {
        continue
      }
      const content = parsed.data.content.trim()
      if (!content) {
        continue
      }
      rows.push({
        chunkIndex: parsed.data.chunkIndex,
        content,
        similarity: parsed.data.similarity,
      })
    }
    return rows
  }

  replaceForSource(params: {
    chunks: EmbeddingChunkInput[]
    sourceId: string
  }): Promise<Array<{ id: string }>> {
    return this.client.transaction(async (tx) => {
      await tx
        .delete(aiConversationEmbeddingModel)
        .where(eq(aiConversationEmbeddingModel.sourceId, params.sourceId))

      if (params.chunks.length === 0) {
        return []
      }

      return tx
        .insert(aiConversationEmbeddingModel)
        .values(
          params.chunks.map((chunk) => ({
            id: chunk.id,
            sourceId: chunk.sourceId,
            workspaceId: chunk.workspaceId,
            conversationId: chunk.conversationId,
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            status: aiEmbeddingStatuses.enum.pending,
          })),
        )
        .returning({ id: aiConversationEmbeddingModel.id })
    })
  }
}

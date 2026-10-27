import {
  and,
  asc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  notInArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm"
import type { DatabaseClient } from "../../client"
import type {
  AIFileChunking,
  AIFileChunkingConfig,
  AIFileProcessingRun,
  AIFileProcessingRunStatus,
} from "../../partials"
import { aiEmbeddingStatuses } from "../../partials"
import { aiEmbeddingModel, aiFileModel } from "../../schema"

export type AiFileEmbeddingChunk = {
  chunkIndex: number
  content: string
  id: string
}

/** Position of the last row of a page; `chunkIndex: null` = unnumbered rows. */
export type AiFileChunkCursor = { chunkIndex: number | null; id: string }

export type AiFileChunkRow = {
  id: string
  content: string
  status: string
  createdAt: Date
  chunkIndex: number | null
}

export type PendingAiFileEmbedding = {
  id: string
}

export type AiFileVectorSearchRow = Record<string, unknown>

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

  async markChunked(input: {
    aiFileId: string
    workspaceId: string
    chunking: AIFileChunking
  }): Promise<void> {
    await this.client
      .update(aiFileModel)
      .set({ chunking: input.chunking })
      .where(
        and(
          eq(aiFileModel.id, input.aiFileId),
          eq(aiFileModel.workspaceId, input.workspaceId),
        ),
      )
  }

  async vectorSearch(input: {
    workspaceId: string
    fileIds: string[]
    queryVector: number[]
    limit: number
  }): Promise<AiFileVectorSearchRow[]> {
    if (input.fileIds.length === 0) {
      return []
    }
    const vector = `[${input.queryVector.join(",")}]`
    const result = await this.client.execute(sql`
      SELECT "id", "content", "aiFileId", "chunkIndex",
        1 - ("embedding" <=> ${vector}::vector) AS similarity
      FROM "AIEmbedding"
      WHERE "workspaceId" = ${input.workspaceId}
        AND ${inArray(aiEmbeddingModel.aiFileId, input.fileIds)}
        AND "status" = ${aiEmbeddingStatuses.enum.success}::"aiEmbeddingStatus"
        AND "embedding" IS NOT NULL
      ORDER BY "embedding" <=> ${vector}::vector
      LIMIT ${input.limit}
    `)
    return result.rows
  }

  /**
   * Chunks in document order (`chunkIndex`, unnumbered rows last, then id).
   * Fetches `limit + 1` rows so the caller can tell whether another page
   * exists. `cursor` continues after a row; `fromChunkIndex` starts a first
   * page at a position (earlier chunks are skipped).
   */
  async listChunks(input: {
    workspaceId: string
    aiFileId: string
    limit: number
    cursor?: AiFileChunkCursor
    fromChunkIndex?: number
  }): Promise<AiFileChunkRow[]> {
    const column = aiEmbeddingModel.chunkIndex
    const conditions: Array<SQL | undefined> = [
      eq(aiEmbeddingModel.workspaceId, input.workspaceId),
      eq(aiEmbeddingModel.aiFileId, input.aiFileId),
    ]
    if (input.cursor && input.cursor.chunkIndex === null) {
      conditions.push(isNull(column), gt(aiEmbeddingModel.id, input.cursor.id))
    } else if (input.cursor) {
      conditions.push(
        or(
          gt(column, input.cursor.chunkIndex as number),
          and(
            eq(column, input.cursor.chunkIndex as number),
            gt(aiEmbeddingModel.id, input.cursor.id),
          ),
          isNull(column),
        ),
      )
    } else if (input.fromChunkIndex !== undefined) {
      conditions.push(or(gte(column, input.fromChunkIndex), isNull(column)))
    }
    return await this.client
      .select({
        id: aiEmbeddingModel.id,
        content: aiEmbeddingModel.content,
        status: aiEmbeddingModel.status,
        createdAt: aiEmbeddingModel.createdAt,
        chunkIndex: column,
      })
      .from(aiEmbeddingModel)
      .where(and(...conditions))
      .orderBy(sql`${column} ASC NULLS LAST`, asc(aiEmbeddingModel.id))
      .limit(input.limit + 1)
  }

  /**
   * Chunks whose text contains `pattern`. `pattern` is an already-escaped
   * ILIKE pattern (`\` is the escape character); the service builds it.
   */
  async findChunksContaining(input: {
    workspaceId: string
    fileIds: string[]
    pattern: string
    limit: number
  }): Promise<
    Array<{ id: string; aiFileId: string; chunkIndex: number | null }>
  > {
    if (input.fileIds.length === 0) {
      return []
    }
    return await this.client
      .select({
        id: aiEmbeddingModel.id,
        aiFileId: aiEmbeddingModel.aiFileId,
        chunkIndex: aiEmbeddingModel.chunkIndex,
      })
      .from(aiEmbeddingModel)
      .where(
        and(
          eq(aiEmbeddingModel.workspaceId, input.workspaceId),
          inArray(aiEmbeddingModel.aiFileId, input.fileIds),
          sql`${aiEmbeddingModel.content} ILIKE ${input.pattern} ESCAPE '\\'`,
        ),
      )
      .orderBy(
        sql`${aiEmbeddingModel.chunkIndex} ASC NULLS LAST`,
        asc(aiEmbeddingModel.id),
      )
      .limit(input.limit)
  }

  async countByStatus(input: { workspaceId: string; aiFileIds: string[] }) {
    if (input.aiFileIds.length === 0) {
      return []
    }
    const result = await this.client
      .select({
        aiFileId: aiEmbeddingModel.aiFileId,
        status: aiEmbeddingModel.status,
        count: sql<number>`count(*)::int`,
      })
      .from(aiEmbeddingModel)
      .where(
        and(
          eq(aiEmbeddingModel.workspaceId, input.workspaceId),
          inArray(aiEmbeddingModel.aiFileId, input.aiFileIds),
        ),
      )
      .groupBy(aiEmbeddingModel.aiFileId, aiEmbeddingModel.status)
    return result
  }

  async claimProcessingRun(input: {
    aiFileId: string
    workspaceId: string
    run: AIFileProcessingRun
    staleBeforeIso: string
    /**
     * Written in the same statement as the run, so a run and its parameters
     * never diverge. `undefined` leaves the column alone, `null` resets it to
     * the defaults, an object replaces it.
     */
    chunkingConfig?: AIFileChunkingConfig | null
  }): Promise<boolean> {
    let configAssignment = sql``
    if (input.chunkingConfig === null) {
      configAssignment = sql`, "chunkingConfig" = NULL`
    } else if (input.chunkingConfig !== undefined) {
      configAssignment = sql`, "chunkingConfig" = ${JSON.stringify(input.chunkingConfig)}::jsonb`
    }
    const result = await this.client.execute(sql`
      UPDATE "AIFile"
      SET "processingRun" = ${JSON.stringify(input.run)}::jsonb${configAssignment}
      WHERE "id" = ${input.aiFileId} AND "workspaceId" = ${input.workspaceId}
        AND (
          COALESCE("processingRun"->>'status', '') NOT IN ('queued', 'processing')
          OR COALESCE("processingRun"->>'heartbeatAt', "processingRun"->>'queuedAt', '') < ${input.staleBeforeIso}::text
        )
      RETURNING "id"
    `)
    return result.rows.length > 0
  }

  /**
   * Patches the run in one guarded UPDATE: `||` keeps the keys not named in
   * `patch`, and the `runId` + status guard makes a superseded run a no-op.
   * Every bound value is cast to text — `jsonb_build_object` takes `"any"`, so
   * an untyped parameter fails with "could not determine data type".
   */
  private async updateProcessingRun(input: {
    aiFileId: string
    workspaceId: string
    runId: string
    activeStatuses: AIFileProcessingRunStatus[]
    patch: Record<string, SQL>
  }): Promise<boolean> {
    const result = await this.client.execute(sql`
      UPDATE "AIFile"
      SET "processingRun" = "processingRun" || jsonb_build_object(${sql.join(
        Object.entries(input.patch).map(
          ([key, value]) => sql`${key}::text, ${value}`,
        ),
        sql`, `,
      )})
      WHERE "id" = ${input.aiFileId} AND "workspaceId" = ${input.workspaceId}
        AND "processingRun"->>'id' = ${input.runId}::text
        AND "processingRun"->>'status' IN (${sql.join(
          input.activeStatuses.map((status) => sql`${status}::text`),
          sql`, `,
        )})
      RETURNING "id"
    `)
    return result.rows.length > 0
  }

  async markProcessingRunStarted(input: {
    aiFileId: string
    workspaceId: string
    runId: string
    now: string
  }): Promise<boolean> {
    return await this.updateProcessingRun({
      ...input,
      activeStatuses: ["queued", "processing"],
      patch: {
        status: sql`${"processing"}::text`,
        // `->>` reads JSON null as SQL NULL, so a retry keeps the first start.
        startedAt: sql`COALESCE("processingRun"->>'startedAt', ${input.now}::text)`,
        heartbeatAt: sql`${input.now}::text`,
      },
    })
  }

  async refreshProcessingRunLease(input: {
    aiFileId: string
    workspaceId: string
    runId: string
    heartbeatAt: string
  }): Promise<boolean> {
    return await this.updateProcessingRun({
      ...input,
      activeStatuses: ["processing"],
      patch: { heartbeatAt: sql`${input.heartbeatAt}::text` },
    })
  }

  async finishProcessingRun(input: {
    aiFileId: string
    workspaceId: string
    runId: string
    status: "success" | "error"
    error: string | null
    finishedAt: string
  }): Promise<boolean> {
    return await this.updateProcessingRun({
      ...input,
      activeStatuses: ["queued", "processing"],
      patch: {
        status: sql`${input.status}::text`,
        error: sql`${input.error}::text`,
        finishedAt: sql`${input.finishedAt}::text`,
      },
    })
  }

  /**
   * Records that a chunk's embedding job gave up. Only a still-`pending` row
   * changes, so a chunk that succeeded in the meantime is never overwritten.
   */
  async markEmbeddingFailed(input: {
    embeddingId: string
    workspaceId: string
  }): Promise<boolean> {
    const updated = await this.client
      .update(aiEmbeddingModel)
      .set({ status: aiEmbeddingStatuses.enum.error, updatedAt: new Date() })
      .where(
        and(
          eq(aiEmbeddingModel.id, input.embeddingId),
          eq(aiEmbeddingModel.workspaceId, input.workspaceId),
          eq(aiEmbeddingModel.status, aiEmbeddingStatuses.enum.pending),
        ),
      )
      .returning({ id: aiEmbeddingModel.id })
    return updated.length > 0
  }

  reconcilePendingChunks(input: {
    aiFileId: string
    chunks: AiFileEmbeddingChunk[]
    workspaceId: string
  }): Promise<PendingAiFileEmbedding[]> {
    // The delete below keeps only the given ids, so an empty set would wipe
    // the file's whole index. Callers must reject empty extractions first.
    if (input.chunks.length === 0) {
      return Promise.reject(
        new Error("reconcilePendingChunks requires at least one chunk"),
      )
    }

    return this.client.transaction(async (tx) => {
      const chunkIds = input.chunks.map((chunk) => chunk.id)

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
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            id: chunk.id,
            status: aiEmbeddingStatuses.enum.pending,
            workspaceId: input.workspaceId,
          })),
        )
        // A kept row keeps its status and vector. It can only differ in the
        // position, because the id hashes (file, position, content): fill it
        // in when it predates the column and leave everything else alone.
        .onConflictDoUpdate({
          target: aiEmbeddingModel.id,
          set: { chunkIndex: sql`excluded."chunkIndex"` },
          setWhere: isNull(aiEmbeddingModel.chunkIndex),
        })

      // A kept chunk whose embedding job gave up is marked `error` by the
      // embedding worker; reprocessing is the only way to retry it.
      await tx
        .update(aiEmbeddingModel)
        .set({ status: aiEmbeddingStatuses.enum.pending })
        .where(
          and(
            eq(aiEmbeddingModel.aiFileId, input.aiFileId),
            eq(aiEmbeddingModel.workspaceId, input.workspaceId),
            inArray(aiEmbeddingModel.id, chunkIds),
            eq(aiEmbeddingModel.status, aiEmbeddingStatuses.enum.error),
          ),
        )

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

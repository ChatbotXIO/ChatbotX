import {
  and,
  type DatabaseClient,
  db,
  eq,
  findOrFail,
  inArray,
  relationsFilterToSQL,
} from "@chatbotx.io/database/client"
import {
  AI_FILE_CHUNKER_VERSIONS,
  AI_FILE_PROCESSING_RUN_STALE_MS,
  type AIEmbeddingStatus,
  type AIFileChunking,
  type AIFileChunkingConfig,
  type AIFileProcessingRun,
  type AIFileProcessingRunErrorCode,
  aiEmbeddingStatuses,
  aiFileChunking,
  aiFileChunkingConfig,
  aiFileProcessingRun,
  aiFileProcessingRunErrorCodes,
  type ResolvedAIFileChunkingConfig,
  resolveAIFileChunkingConfig,
} from "@chatbotx.io/database/partials"
import { createAiFileEmbeddingRepository } from "@chatbotx.io/database/repositories"
import { aiEmbeddingModel, aiFileModel } from "@chatbotx.io/database/schema"
import type { AIFileModel } from "@chatbotx.io/database/types"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import {
  UploadValidationError,
  uploader,
  uploadFile,
  uploadFileFromUrl,
} from "@chatbotx.io/filesystem"
import { createId, isNumericId } from "@chatbotx.io/utils"
import {
  buildAIFileReindexJobId,
  getHeavyJobOptions,
  HeavyJobAction,
  heavyQueue,
} from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import { z } from "zod"
import { BaseService } from "../base.service"
import {
  ChatbotXException,
  notFoundException,
  validationException,
} from "../errors"
import { integrationGeminiService } from "../integration-gemini/service"
import { integrationOpenAIService } from "../integration-openai/service"
import { logger } from "../logger"
import { assertPublicUrl } from "../net/ssrf-guard"
import {
  assertResourceEditable,
  withDeleteGuard,
} from "../template/installed-resource.service"
import { withTemplateLockedTransaction } from "../template/template-resource-locks"
import type { PaginatedResult } from "../types"

export const AI_FILE_MAX_UPLOAD_BYTES = 100 * 1000 * 1000

export type AIFileWithProcessing = Omit<
  AIFileModel,
  "chunking" | "chunkingConfig"
> & {
  url: string
  chunksCount: number
  processingStatus: AIEmbeddingStatus
  chunking: AIFileChunking | null
  chunkingOutdated: boolean
  /** Effective parameters; `isDefault` = none stored, today's defaults apply. */
  chunkingConfig: ResolvedAIFileChunkingConfig & { isDefault: boolean }
  /** Some chunks have no position yet (rows older than the position column). */
  indexOutdated: boolean
  processingRun: (AIFileProcessingRun & { stale: boolean }) | null
}

// Alias kept for the private query schema
// (apps/builder/src/features/ai-files/schema/index.ts), which still imports
// this name.
export type AIFileWithEmbeddingStatus = AIFileWithProcessing

export type CreateAIFileInput =
  | { name: string; path: string; mimeType: string; size: number }
  | { name?: string; file: File }
  | { name?: string; url: string }

type AIFileEmbeddingRow = {
  id: string
  status: string
  chunkIndex: number | null
}

const chunkCursorSchema = z.object({
  i: z.number().int().nonnegative().nullable(),
  id: z.string().refine((value) => isNumericId(value)),
})

function encodeChunkCursor(position: {
  chunkIndex: number | null
  id: string
}): string {
  return Buffer.from(
    JSON.stringify({ i: position.chunkIndex, id: position.id }),
  ).toString("base64url")
}

function decodeChunkCursor(cursor: string): {
  chunkIndex: number | null
  id: string
} {
  try {
    const parsed = chunkCursorSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    )
    return { chunkIndex: parsed.i, id: parsed.id }
  } catch {
    throw new ChatbotXException(
      "The cursor is invalid. Start again without a cursor.",
      "invalidCursor",
      400,
    )
  }
}

/** Escapes `\`, `%` and `_` so user text matches literally inside ILIKE. */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

class AiFileService extends BaseService {
  private static readonly withEmbeddings = {
    aiEmbeddings: { columns: { id: true, status: true, chunkIndex: true } },
  } as const

  async findBy(props: {
    where: { id?: string; workspaceId?: string }
  }): Promise<AIFileModel | undefined> {
    return await db.query.aiFileModel.findFirst({ where: props.where })
  }

  async markChunked(input: {
    aiFileId: string
    workspaceId: string
    chunking: AIFileChunking
  }): Promise<void> {
    const chunking = aiFileChunking.parse(input.chunking)
    await createAiFileEmbeddingRepository().markChunked({
      aiFileId: input.aiFileId,
      workspaceId: input.workspaceId,
      chunking,
    })
  }

  private async enrichFile(
    file: AIFileModel & { aiEmbeddings: AIFileEmbeddingRow[] },
  ): Promise<AIFileWithProcessing> {
    const hasEmbeddings = file.aiEmbeddings.length > 0
    let processingStatus: AIEmbeddingStatus = "pending"
    if (hasEmbeddings) {
      const statuses = new Set(file.aiEmbeddings.map((e) => e.status))
      if (statuses.has("error")) {
        processingStatus = "error"
      } else if (statuses.has("pending") || statuses.has("processing")) {
        processingStatus = "processing"
      } else {
        processingStatus = "success"
      }
    }
    const parsedChunking = aiFileChunking.safeParse(file.chunking)
    const chunking = parsedChunking.success ? parsedChunking.data : null
    const parsedRun = aiFileProcessingRun.safeParse(file.processingRun)
    if (file.processingRun && !parsedRun.success) {
      logger.warn({ aiFileId: file.id }, "Invalid AI file processing run")
    }
    const processingRun = parsedRun.success
      ? {
          ...parsedRun.data,
          stale:
            (parsedRun.data.status === "queued" ||
              parsedRun.data.status === "processing") &&
            (parsedRun.data.heartbeatAt ?? parsedRun.data.queuedAt) <
              new Date(
                Date.now() - AI_FILE_PROCESSING_RUN_STALE_MS,
              ).toISOString(),
        }
      : null
    const orderedChunksCount = file.aiEmbeddings.filter(
      (embedding) => embedding.chunkIndex !== null,
    ).length
    return {
      ...file,
      url: await uploader.getPresignedDownload(file.path),
      chunksCount: file.aiEmbeddings.length,
      chunkingConfig: {
        ...resolveAIFileChunkingConfig(file.chunkingConfig),
        isDefault: file.chunkingConfig === null,
      },
      indexOutdated:
        file.aiEmbeddings.length > 0 &&
        orderedChunksCount < file.aiEmbeddings.length,
      processingStatus,
      chunking,
      chunkingOutdated:
        chunking === null
          ? file.aiEmbeddings.length > 0
          : chunking.chunkerVersion <
            AI_FILE_CHUNKER_VERSIONS[chunking.strategy],
      processingRun,
    }
  }

  /** Non-paginated listing for the private UI, which renders every file at once. */
  async listWithEmbeddingStatus(props: {
    workspaceId: string
  }): Promise<AIFileWithProcessing[]> {
    const rows = await db.query.aiFileModel.findMany({
      where: { workspaceId: props.workspaceId },
      orderBy: parseOrderByAsObject(aiFileModel, {
        sort: [{ id: "createdAt", desc: true }],
      }),
      with: AiFileService.withEmbeddings,
    })
    return await Promise.all(rows.map((r) => this.enrichFile(r)))
  }

  async listAIFiles(input: {
    workspaceId: string
    page?: number
    perPage?: number
  }): Promise<PaginatedResult<AIFileWithProcessing>> {
    const where = { workspaceId: input.workspaceId }
    const orderBy = parseOrderByAsObject(aiFileModel, {
      sort: [{ id: "createdAt", desc: true }],
    })

    if (input.page === undefined && input.perPage === undefined) {
      const rows = await db.query.aiFileModel.findMany({
        where,
        orderBy,
        with: AiFileService.withEmbeddings,
      })
      return {
        data: await Promise.all(rows.map((r) => this.enrichFile(r))),
        pageCount: 1,
      }
    }

    const pagination = getPaginationWithDefaults(input)
    const [rows, total] = await Promise.all([
      db.query.aiFileModel.findMany({
        where,
        orderBy,
        with: AiFileService.withEmbeddings,
        limit: pagination.limit,
        offset: pagination.offset,
      }),
      db.$count(aiFileModel, relationsFilterToSQL(aiFileModel, where)),
    ])
    return {
      data: await Promise.all(rows.map((r) => this.enrichFile(r))),
      pageCount: Math.ceil(total / pagination.limit),
    }
  }

  async findWithProcessing(props: {
    where: { id: string; workspaceId: string }
  }): Promise<AIFileWithProcessing | undefined> {
    const row = await db.query.aiFileModel.findFirst({
      where: props.where,
      with: AiFileService.withEmbeddings,
    })
    return row ? await this.enrichFile(row) : undefined
  }

  async assertEmbeddingProviderConfigured(workspaceId: string): Promise<void> {
    const [hasOpenAI, hasGemini] = await Promise.all([
      integrationOpenAIService.findByWorkspaceId(workspaceId),
      integrationGeminiService.findByWorkspaceId(workspaceId),
    ])
    if (!(hasOpenAI || hasGemini)) {
      // Kept as its own "noEmbeddingProvider" code (rather than the generic
      // "businessError") so the private create action can catch it and
      // surface a translated message via next-intl — see
      // apps/builder/src/features/ai-files/actions/create-ai-file.action.ts.
      throw new ChatbotXException(
        "No embedding provider configured. AI file embeddings require OpenAI or Gemini integration. DeepSeek and Claude do not support embedding models.",
        "noEmbeddingProvider",
        400,
      )
    }
  }

  async findManyByIds(props: {
    workspaceId: string
    ids: string[]
  }): Promise<AIFileModel[]> {
    // Agent tool ids come from free-form strings; a non-numeric one would fail
    // the bigint cast as a 500 instead of matching nothing.
    const ids = props.ids.filter((id) => isNumericId(id))
    if (ids.length === 0) {
      return []
    }
    return await db.query.aiFileModel.findMany({
      where: { workspaceId: props.workspaceId, id: { in: ids } },
    })
  }

  async countEmbeddingsByStatus(props: {
    workspaceId: string
    aiFileIds: string[]
  }): Promise<Map<string, { total: number; success: number }>> {
    const rows = await createAiFileEmbeddingRepository().countByStatus(props)
    const counts = new Map<string, { total: number; success: number }>()
    for (const row of rows) {
      const current = counts.get(row.aiFileId) ?? { total: 0, success: 0 }
      current.total += row.count
      if (row.status === "success") {
        current.success += row.count
      }
      counts.set(row.aiFileId, current)
    }
    return counts
  }

  async listChunks(props: {
    workspaceId: string
    aiFileId: string
    limit: number
    /** Opaque `nextCursor` from the previous page. */
    cursor?: string
    /** Start the first page at this chunk position (ignored with `cursor`). */
    fromChunkIndex?: number
  }): Promise<{
    data: Array<{
      id: string
      content: string
      status: AIEmbeddingStatus
      createdAt: Date
      chunkIndex: number | null
    }>
    nextCursor: string | null
  }> {
    // Decoded before any query: a tampered cursor must not reach a bigint cast.
    const cursor =
      props.cursor === undefined ? undefined : decodeChunkCursor(props.cursor)
    const file = await this.findBy({
      where: { id: props.aiFileId, workspaceId: props.workspaceId },
    })
    if (!file) {
      throw notFoundException("AI file not found")
    }
    const rows = await createAiFileEmbeddingRepository().listChunks({
      workspaceId: props.workspaceId,
      aiFileId: props.aiFileId,
      limit: props.limit,
      cursor,
      fromChunkIndex: props.fromChunkIndex,
    })
    const hasNext = rows.length > props.limit
    // The pgEnum column is typed as plain text; narrow it here, not by a cast.
    const data = rows.slice(0, props.limit).map((row) => ({
      ...row,
      status: aiEmbeddingStatuses.parse(row.status),
    }))
    const last = data.at(-1)
    return {
      data,
      nextCursor:
        hasNext && last
          ? encodeChunkCursor({ chunkIndex: last.chunkIndex, id: last.id })
          : null,
    }
  }

  /**
   * Chunks (across the given files) whose text contains `text`, ignoring case.
   * Files are verified to belong to the workspace first; one query, no embed.
   */
  async findChunksContaining(props: {
    workspaceId: string
    fileIds: string[]
    text: string
    limit?: number
  }): Promise<
    Array<{
      chunkId: string
      fileId: string
      fileName: string
      chunkIndex: number | null
    }>
  > {
    const files = await this.findManyByIds({
      workspaceId: props.workspaceId,
      ids: props.fileIds,
    })
    const fileNames = new Map(files.map((file) => [file.id, file.name]))
    const text = props.text.trim()
    if (fileNames.size === 0 || text === "") {
      return []
    }
    const rows = await createAiFileEmbeddingRepository().findChunksContaining({
      workspaceId: props.workspaceId,
      fileIds: [...fileNames.keys()],
      pattern: `%${escapeLikePattern(text)}%`,
      limit: props.limit ?? 20,
    })
    return rows.map((row) => ({
      chunkId: row.id,
      fileId: row.aiFileId,
      fileName: fileNames.get(row.aiFileId) ?? "",
      chunkIndex: row.chunkIndex,
    }))
  }

  private createProcessingRun(): AIFileProcessingRun {
    return aiFileProcessingRun.parse({
      id: createId(),
      status: "queued",
      error: null,
      queuedAt: new Date().toISOString(),
      startedAt: null,
      heartbeatAt: null,
      finishedAt: null,
    })
  }

  async markProcessingRunStarted(props: {
    aiFileId: string
    workspaceId: string
    runId: string
  }): Promise<boolean> {
    return await createAiFileEmbeddingRepository().markProcessingRunStarted({
      ...props,
      now: new Date().toISOString(),
    })
  }

  async refreshProcessingRunLease(props: {
    aiFileId: string
    workspaceId: string
    runId: string
  }): Promise<boolean> {
    return await createAiFileEmbeddingRepository().refreshProcessingRunLease({
      ...props,
      heartbeatAt: new Date().toISOString(),
    })
  }

  async markProcessingRunSucceeded(props: {
    aiFileId: string
    workspaceId: string
    runId: string
  }): Promise<boolean> {
    return await createAiFileEmbeddingRepository().finishProcessingRun({
      ...props,
      status: "success",
      error: null,
      finishedAt: new Date().toISOString(),
    })
  }

  /** The embedding job of one chunk used its last attempt without success. */
  async markEmbeddingFailed(props: {
    embeddingId: string
    workspaceId: string
  }): Promise<boolean> {
    return await createAiFileEmbeddingRepository().markEmbeddingFailed(props)
  }

  async markProcessingRunFailed(props: {
    aiFileId: string
    workspaceId: string
    runId: string
    code: AIFileProcessingRunErrorCode
  }): Promise<boolean> {
    const code = aiFileProcessingRunErrorCodes.parse(props.code)
    return await createAiFileEmbeddingRepository().finishProcessingRun({
      ...props,
      status: "error",
      error: code,
      finishedAt: new Date().toISOString(),
    })
  }

  private async resolveUpload(
    workspaceId: string,
    input: CreateAIFileInput,
  ): Promise<{ name: string; path: string; mimeType: string; size: number }> {
    if ("path" in input) {
      // The caller names an object they uploaded themselves: it must sit under
      // this workspace's own AI-file prefix, or a member could point a file at
      // another workspace's object (and read it back through the presigned URL).
      const prefix = `workspaces/${workspaceId}/ai-files/`
      if (!input.path.startsWith(prefix) || input.path.includes("..")) {
        throw new UploadValidationError("The uploaded file path is not allowed")
      }
      return {
        name: input.name,
        path: input.path,
        mimeType: input.mimeType,
        size: input.size,
      }
    }
    const path = `workspaces/${workspaceId}/ai-files/${createId()}`
    if ("file" in input) {
      const uploaded = await uploadFile(input.file, path, "private")
      return {
        name: input.name ?? uploaded.name,
        path,
        mimeType: uploaded.mimeType,
        size: uploaded.size,
      }
    }
    const uploaded = await uploadFileFromUrl(
      input.url,
      path,
      "private",
      AI_FILE_MAX_UPLOAD_BYTES,
      async (candidateUrl) => {
        try {
          await assertPublicUrl(candidateUrl, "AI file URL")
        } catch {
          // The guard's own message echoes the submitted URL; replace it with
          // a safe, caller-fault message before it can reach the API response.
          throw new UploadValidationError("The provided URL is not allowed")
        }
      },
    )
    return {
      name: input.name ?? uploaded.name,
      path,
      mimeType: uploaded.mimeType,
      size: uploaded.size,
    }
  }

  async create(
    workspaceId: string,
    input: CreateAIFileInput,
  ): Promise<AIFileWithProcessing> {
    await this.assertEmbeddingProviderConfigured(workspaceId)

    let resolved: { name: string; path: string; mimeType: string; size: number }
    try {
      resolved = await this.resolveUpload(workspaceId, input)
    } catch (error) {
      if (error instanceof UploadValidationError) {
        throw new ChatbotXException(error.message, "businessError", 400)
      }
      logger.error({ err: error }, "Failed to store AI file")
      throw new ChatbotXException(
        "Failed to store AI file. Please try again later.",
        "systemError",
        502,
      )
    }

    const processingRun = this.createProcessingRun()
    const [created] = await db
      .insert(aiFileModel)
      .values({ ...resolved, id: createId(), workspaceId, processingRun })
      .returning()

    let returnedRun = processingRun
    try {
      await heavyQueue.add(
        HeavyJobAction.processAIFile,
        {
          type: HeavyJobAction.processAIFile,
          data: { aiFileId: created.id, runId: processingRun.id },
        },
        {
          ...getHeavyJobOptions(HeavyJobAction.processAIFile),
          jobId: `heavy-ai-file-${created.id}`,
        },
      )
    } catch (error) {
      // The row exists, so this is still a 201: the caller recovers through
      // aiFiles.reindex. If recording fails too the run stays queued and
      // expires after AI_FILE_PROCESSING_RUN_STALE_MS.
      const finishedAt = new Date().toISOString()
      try {
        const marked = await this.markProcessingRunFailed({
          aiFileId: created.id,
          workspaceId,
          runId: processingRun.id,
          code: "enqueueFailed",
        })
        if (marked) {
          returnedRun = {
            ...processingRun,
            status: "error",
            error: "enqueueFailed",
            finishedAt,
          }
        }
      } catch (markError) {
        logger.error(
          {
            err: normalizeError(markError),
            aiFileId: created.id,
            workspaceId,
            runId: processingRun.id,
          },
          "Failed to record AI file enqueue failure",
        )
      }
      logger.error(
        {
          err: normalizeError(error),
          aiFileId: created.id,
          workspaceId,
          runId: processingRun.id,
        },
        "Failed to enqueue AI file processing",
      )
    }

    await this.audit("create", `created a new Knowledge (#${created.id})`)

    return {
      ...created,
      url: await uploader.getPresignedDownload(created.path),
      chunksCount: 0,
      processingStatus: "pending",
      chunking: null,
      chunkingOutdated: false,
      chunkingConfig: {
        ...resolveAIFileChunkingConfig(created.chunkingConfig),
        isDefault: created.chunkingConfig === null,
      },
      indexOutdated: false,
      processingRun: { ...returnedRun, stale: false },
    }
  }

  /**
   * Records an AI file whose bytes a template install already copied to
   * `path`. Inside the install's transaction it writes only the row, with a
   * `queued` processing run: nothing is enqueued here, because a job queued
   * before the transaction commits could run against a row that is rolled
   * back. The template dispatch sweep (and the install handler right after
   * commit) enqueue the run.
   */
  async createFromCopiedObject(input: {
    tx: DatabaseClient
    workspaceId: string
    name: string
    path: string
    mimeType: string
    size: number
    chunkingConfig: AIFileChunkingConfig | null
  }): Promise<AIFileModel> {
    const [created] = await input.tx
      .insert(aiFileModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        name: input.name,
        path: input.path,
        mimeType: input.mimeType,
        size: input.size,
        chunkingConfig: input.chunkingConfig,
        processingRun: this.createProcessingRun(),
      })
      .returning()
    return created
  }

  async reindex(props: {
    workspaceId: string
    id: string
    /**
     * `undefined` keeps the stored parameters, `null` resets to the defaults,
     * an object replaces them (stored normalized).
     */
    chunkingConfig?: AIFileChunkingConfig | null
  }): Promise<{
    file: AIFileWithProcessing
    coalesced: boolean
  }> {
    let chunkingConfig: AIFileChunkingConfig | null | undefined
    if (props.chunkingConfig) {
      const parsed = aiFileChunkingConfig.safeParse(props.chunkingConfig)
      if (!parsed.success) {
        throw validationException(
          "chunkingConfig",
          parsed.error.issues[0]?.message ?? "Invalid chunking settings",
        )
      }
      chunkingConfig = resolveAIFileChunkingConfig(parsed.data)
    } else {
      chunkingConfig = props.chunkingConfig
    }
    const current = await this.findWithProcessing({
      where: { id: props.id, workspaceId: props.workspaceId },
    })
    if (!current) {
      throw notFoundException("AI file not found")
    }
    await this.assertEmbeddingProviderConfigured(props.workspaceId)
    const run = this.createProcessingRun()
    const claim = (client?: DatabaseClient) =>
      createAiFileEmbeddingRepository(client).claimProcessingRun({
        aiFileId: props.id,
        workspaceId: props.workspaceId,
        run,
        staleBeforeIso: new Date(
          Date.now() - AI_FILE_PROCESSING_RUN_STALE_MS,
        ).toISOString(),
        chunkingConfig,
      })
    // Re-chunking with other parameters is the template's content; a plain
    // reindex (keep the stored parameters) is always the installer's. The
    // guard is the first step of the transaction that writes the parameters,
    // so a sync/restore/uninstall cannot race it. The queue add stays outside.
    const claimed =
      props.chunkingConfig === undefined
        ? await claim()
        : await withTemplateLockedTransaction(async (tx) => {
            await assertResourceEditable({
              workspaceId: props.workspaceId,
              resourceKind: "aiFile",
              resourceIds: [props.id],
              changedKeys: ["chunkingConfig"],
              tx,
            })
            return await claim(tx)
          })
    if (!claimed) {
      // Parameters the caller chose must not vanish silently behind a coalesce.
      if (chunkingConfig !== undefined) {
        throw new ChatbotXException(
          "File is being processed; parameters were not applied. Retry when processingRun finishes.",
          "conflict",
          409,
        )
      }
      const file = await this.findWithProcessing({
        where: { id: props.id, workspaceId: props.workspaceId },
      })
      return { file: file ?? current, coalesced: true }
    }
    try {
      await heavyQueue.add(
        HeavyJobAction.processAIFile,
        {
          type: HeavyJobAction.processAIFile,
          data: { aiFileId: props.id, runId: run.id },
        },
        {
          ...getHeavyJobOptions(HeavyJobAction.processAIFile),
          jobId: buildAIFileReindexJobId(props.id, run.id),
        },
      )
    } catch (error) {
      try {
        await this.markProcessingRunFailed({
          aiFileId: props.id,
          workspaceId: props.workspaceId,
          runId: run.id,
          code: "enqueueFailed",
        })
      } catch (markError) {
        logger.error(
          {
            err: normalizeError(markError),
            aiFileId: props.id,
            workspaceId: props.workspaceId,
            runId: run.id,
          },
          "Failed to record AI file reindex enqueue failure",
        )
      }
      logger.error(
        {
          err: normalizeError(error),
          aiFileId: props.id,
          workspaceId: props.workspaceId,
          runId: run.id,
        },
        "Failed to enqueue AI file reindex",
      )
      throw new ChatbotXException(
        "Failed to queue AI file processing. Please try again later.",
        "systemError",
        502,
      )
    }
    await this.audit("reindex", `reindexed a Knowledge (#${props.id})`)
    logger.info(
      { workspaceId: props.workspaceId, aiFileId: props.id, runId: run.id },
      "Reindexed AI file",
    )
    const file = await this.findWithProcessing({
      where: { id: props.id, workspaceId: props.workspaceId },
    })
    return {
      file: file ?? { ...current, processingRun: { ...run, stale: false } },
      coalesced: false,
    }
  }

  async delete(ctx: { workspaceId: string; id: string }): Promise<void> {
    const targetAIFile = await findOrFail({
      table: aiFileModel,
      where: { id: ctx.id, workspaceId: ctx.workspaceId },
      message: `AIFile with id ${ctx.id} not found`,
    })
    // A refused delete (locked, or being uninstalled) is the caller's error;
    // only a storage/DB failure after the guard passed is best-effort.
    let guardPassed = false
    try {
      await withDeleteGuard(
        {
          workspaceId: ctx.workspaceId,
          targets: [{ resourceKind: "aiFile", resourceIds: [ctx.id] }],
        },
        async (tx) => {
          guardPassed = true
          await uploader.deleteObject(targetAIFile.path)
          // NOTE: this predicate matches on aiEmbeddingModel.id, but ctx.id is
          // an AIFile id — the correct FK is aiEmbeddingModel.aiFileId. This is
          // a pre-existing bug carried over verbatim (harmless no-op today
          // because AIEmbedding.aiFileId cascades on AIFile delete). Tracked as
          // a follow-up rather than fixed here to keep this change behavior-
          // neutral.
          await tx
            .delete(aiEmbeddingModel)
            .where(eq(aiEmbeddingModel.id, ctx.id))
          await this.deleteInTx(tx, {
            workspaceId: ctx.workspaceId,
            ids: [ctx.id],
          })
        },
      )
      await this.audit("delete", `deleted a Knowledge (#${ctx.id})`)
    } catch (error) {
      if (!guardPassed) {
        throw error
      }
      // Preserves the existing best-effort semantics of the code being
      // replaced (apps/builder/src/features/ai-files/actions/delete-ai-file.action.ts):
      // a storage/DB failure here is logged, not surfaced as a request error.
      logger.warn({ err: error }, `Failed to delete AI file (#${ctx.id})`)
    }
  }

  /**
   * The delete core (the row; its embeddings cascade), shared with the
   * template uninstall so there is one implementation. The stored object is
   * not touched here: the public delete removes it first, the uninstall after
   * commit. Returns the ids actually deleted.
   */
  async deleteInTx(
    tx: DatabaseClient,
    input: { workspaceId: string; ids: string[] },
  ): Promise<string[]> {
    const rows = await tx
      .delete(aiFileModel)
      .where(
        and(
          eq(aiFileModel.workspaceId, input.workspaceId),
          inArray(aiFileModel.id, input.ids),
        ),
      )
      .returning({ id: aiFileModel.id })
    return rows.map((row) => String(row.id))
  }
}

export const aiFileService = new AiFileService()

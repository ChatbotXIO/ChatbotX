import {
  db,
  eq,
  findOrFail,
  relationsFilterToSQL,
} from "@chatbotx.io/database/client"
import type { AIEmbeddingStatus } from "@chatbotx.io/database/partials"
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
import { createId } from "@chatbotx.io/utils"
import {
  getHeavyJobOptions,
  HeavyJobAction,
  heavyQueue,
} from "@chatbotx.io/worker-config"
import { BaseService } from "../base.service"
import { ChatbotXException } from "../errors"
import { integrationGeminiService } from "../integration-gemini/service"
import { integrationOpenAIService } from "../integration-openai/service"
import { logger } from "../logger"
import { assertPublicUrl } from "../net/ssrf-guard"
import type { PaginatedResult } from "../types"

export const AI_FILE_MAX_UPLOAD_BYTES = 100 * 1000 * 1000

export type AIFileWithProcessing = AIFileModel & {
  url: string
  chunksCount: number
  processingStatus: AIEmbeddingStatus
}

// Alias kept for the private query schema
// (apps/builder/src/features/ai-files/schema/index.ts), which still imports
// this name.
export type AIFileWithEmbeddingStatus = AIFileWithProcessing

export type CreateAIFileInput =
  | { name: string; path: string; mimeType: string; size: number }
  | { name?: string; file: File }
  | { name?: string; url: string }

type AIFileEmbeddingRow = { id: string; status: string }

class AiFileService extends BaseService {
  private static readonly withEmbeddings = {
    aiEmbeddings: { columns: { id: true, status: true } },
  } as const

  async findBy(props: {
    where: { id?: string; workspaceId?: string }
  }): Promise<AIFileModel | undefined> {
    return await db.query.aiFileModel.findFirst({ where: props.where })
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
      } else if (statuses.has("pending")) {
        processingStatus = "processing"
      } else {
        processingStatus = "success"
      }
    }
    return {
      ...file,
      url: await uploader.getPresignedDownload(file.path),
      chunksCount: file.aiEmbeddings.length,
      processingStatus,
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

  private async assertEmbeddingProviderConfigured(
    workspaceId: string,
  ): Promise<void> {
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

  private async resolveUpload(
    workspaceId: string,
    input: CreateAIFileInput,
  ): Promise<{ name: string; path: string; mimeType: string; size: number }> {
    if ("path" in input) {
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

    const [created] = await db
      .insert(aiFileModel)
      .values({ ...resolved, id: createId(), workspaceId })
      .returning()

    await heavyQueue.add(
      HeavyJobAction.processAIFile,
      { type: HeavyJobAction.processAIFile, data: { aiFileId: created.id } },
      {
        ...getHeavyJobOptions(HeavyJobAction.processAIFile),
        jobId: `heavy-ai-file-${created.id}`,
      },
    )

    await this.audit("create", `created a new Knowledge (#${created.id})`)

    return {
      ...created,
      url: await uploader.getPresignedDownload(created.path),
      chunksCount: 0,
      processingStatus: "pending",
    }
  }

  async delete(ctx: { workspaceId: string; id: string }): Promise<void> {
    const targetAIFile = await findOrFail({
      table: aiFileModel,
      where: { id: ctx.id, workspaceId: ctx.workspaceId },
      message: `AIFile with id ${ctx.id} not found`,
    })
    try {
      await db.transaction(async (tx) => {
        await uploader.deleteObject(targetAIFile.path)
        // NOTE: this predicate matches on aiEmbeddingModel.id, but ctx.id is
        // an AIFile id — the correct FK is aiEmbeddingModel.aiFileId. This is
        // a pre-existing bug carried over verbatim (harmless no-op today
        // because AIEmbedding.aiFileId cascades on AIFile delete). Tracked as
        // a follow-up rather than fixed here to keep this change behavior-
        // neutral.
        await tx.delete(aiEmbeddingModel).where(eq(aiEmbeddingModel.id, ctx.id))
        await tx.delete(aiFileModel).where(eq(aiFileModel.id, ctx.id))
      })
      await this.audit("delete", `deleted a Knowledge (#${ctx.id})`)
    } catch (error) {
      // Preserves the existing best-effort semantics of the code being
      // replaced (apps/builder/src/features/ai-files/actions/delete-ai-file.action.ts):
      // a storage/DB failure here is logged, not surfaced as a request error.
      logger.warn({ err: error }, `Failed to delete AI file (#${ctx.id})`)
    }
  }
}

export const aiFileService = new AiFileService()

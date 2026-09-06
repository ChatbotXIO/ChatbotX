import { db, eq } from "@chatbotx.io/database/client"
import type { AIEmbeddingStatus } from "@chatbotx.io/database/partials"
import { aiEmbeddingModel, aiFileModel } from "@chatbotx.io/database/schema"
import type { AIFileModel } from "@chatbotx.io/database/types"
import { uploader } from "@chatbotx.io/filesystem"
import { createId } from "@chatbotx.io/utils"
import { AIJobAction, aiAgentQueue } from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import { BaseService } from "../base.service"
import { ChatbotXException } from "../errors"
import { logger } from "../logger"

export type AIFileWithEmbeddingStatus = AIFileModel & {
  url: string
  chunksCount: number
  processingStatus: AIEmbeddingStatus
}

class AiFileService extends BaseService {
  async hasEmbeddingProvider(workspaceId: string): Promise<boolean> {
    const hasOpenAI = await db.query.integrationOpenaiModel.findFirst({
      where: { workspaceId },
      columns: { id: true },
    })
    if (hasOpenAI) {
      return true
    }

    const hasGemini = await db.query.integrationGeminiModel.findFirst({
      where: { workspaceId },
      columns: { id: true },
    })
    return Boolean(hasGemini)
  }

  async create(props: {
    workspaceId: string
    path: string
    name: string
    mimeType: string
    size: number
  }): Promise<{ id: string }> {
    if (!(await this.hasEmbeddingProvider(props.workspaceId))) {
      throw new ChatbotXException(
        "AI file requires an embedding provider",
        "noEmbeddingProvider",
        400,
      )
    }

    const created = await db
      .insert(aiFileModel)
      .values({
        name: props.name,
        path: props.path,
        mimeType: props.mimeType,
        size: props.size,
        id: createId(),
        workspaceId: props.workspaceId,
      })
      .returning({ id: aiFileModel.id })

    const aiFileId = created[0].id

    // Enqueue embedding job right after creation
    await aiAgentQueue.add(AIJobAction.processAIFile, {
      type: AIJobAction.processAIFile,
      data: {
        aiFileId,
      },
    })

    await this.audit("create", `created a new Knowledge (#${aiFileId})`)

    return { id: aiFileId }
  }

  async delete(props: { workspaceId: string; id: string }): Promise<void> {
    const targetAIFile = await db.query.aiFileModel.findFirst({
      where: { id: props.id, workspaceId: props.workspaceId },
    })

    if (!targetAIFile) {
      throw new ChatbotXException(
        `AIFile with id ${props.id} not found`,
        "notFound",
        404,
      )
    }

    try {
      await db.transaction(async (tx) => {
        await uploader.deleteObject(targetAIFile.path)
        // NOTE: this predicate matches on aiEmbeddingModel.id, but props.id is
        // an AIFile id — the correct FK is aiEmbeddingModel.aiFileId. This is
        // a pre-existing bug carried over verbatim (harmless no-op today
        // because AIEmbedding.aiFileId cascades on AIFile delete). Tracked as
        // a follow-up rather than fixed here to keep this change behavior-
        // neutral.
        await tx
          .delete(aiEmbeddingModel)
          .where(eq(aiEmbeddingModel.id, props.id))
        await tx.delete(aiFileModel).where(eq(aiFileModel.id, props.id))
      })

      await this.audit("delete", `deleted a Knowledge (#${props.id})`)
    } catch (error) {
      logger.warn(
        { err: normalizeError(error) },
        `deleteAIFile failed for id: ${props.id}`,
      )
    }
  }

  async listWithEmbeddingStatus(props: {
    workspaceId: string
  }): Promise<AIFileWithEmbeddingStatus[]> {
    const data = await db.query.aiFileModel.findMany({
      where: {
        workspaceId: props.workspaceId,
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

    return await Promise.all(
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
  }
}

export const aiFileService = new AiFileService()

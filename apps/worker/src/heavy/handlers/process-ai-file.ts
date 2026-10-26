import { aiFileService } from "@chatbotx.io/business"
import {
  AI_FILE_CHUNKER_VERSIONS,
  resolveAIFileChunkingConfig,
} from "@chatbotx.io/database/partials"
import { createAiFileEmbeddingRepository } from "@chatbotx.io/database/repositories"
import { createAIFileEmbeddingId } from "@chatbotx.io/database/repositories/ai-file-embedding-id"
import { distributedLock } from "@chatbotx.io/redis"
import {
  AI_FILE_EMBEDDING_PRIORITY,
  AIJobAction,
  aiAgentQueue,
  buildAIFileEmbeddingJobId,
  type HeavyJobProcessAIFile,
} from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import {
  chunkKnowledgeDocument,
  type KnowledgeDocument,
} from "../../ai-agent/lib/chunkers"
import {
  EmbeddingProviderNotConfiguredError,
  resolveEmbeddingModel,
} from "../../ai-agent/lib/embedding-model"
import {
  FileFetchError,
  FileSizeLimitError,
} from "../../ai-agent/lib/extraction-errors"
import { extractKnowledgeDocument } from "../../ai-agent/lib/text-extractor"
import { env } from "../../env"
import { logger } from "../../lib/logger"
import { AIFileProcessingError } from "./ai-file-processing-error"

const aiFileEmbeddingRepository = createAiFileEmbeddingRepository()

/** Characters handed to the chunker; the UI uses it to estimate a chunk count. */
function measureExtractedChars(document: KnowledgeDocument): number {
  if (document.kind !== "tabular") {
    return document.text.length
  }
  let total = 0
  for (const sheet of document.sheets) {
    for (const header of sheet.headers) {
      total += header.length
    }
    for (const row of sheet.rows) {
      for (const cell of row) {
        total += cell.length
      }
    }
  }
  return total
}

export async function processAIFile(
  data: HeavyJobProcessAIFile["data"],
): Promise<void> {
  const { aiFileId, runId } = data

  await distributedLock.runExclusive({
    key: `ai-file:process:${aiFileId}`,
    timeoutInSeconds: 15 * 60,
    retryTimeoutInSeconds: 30,
    fn: async () => {
      const aiFile = await aiFileEmbeddingRepository.findFileOrFail(aiFileId)

      if (
        runId &&
        !(await aiFileService.markProcessingRunStarted({
          aiFileId,
          workspaceId: aiFile.workspaceId,
          runId,
        }))
      ) {
        logger.info(
          { aiFileId, workspaceId: aiFile.workspaceId, runId },
          "AI file processing run superseded, skipping",
        )
        return
      }

      const ensureRunLease = async (
        stage: "beforeReconcile" | "beforeEnqueue",
      ): Promise<boolean> => {
        if (!runId) {
          return true
        }
        const refreshed = await aiFileService.refreshProcessingRunLease({
          aiFileId,
          workspaceId: aiFile.workspaceId,
          runId,
        })
        if (!refreshed) {
          logger.info(
            { aiFileId, workspaceId: aiFile.workspaceId, runId, stage },
            "AI file processing run superseded, skipping",
          )
        }
        return refreshed
      }

      // Read after the run is confirmed current: the parameters are written in
      // the same statement that claims the run, so this is the run's own.
      const config = resolveAIFileChunkingConfig(aiFile.chunkingConfig)

      try {
        await resolveEmbeddingModel(aiFile.workspaceId)
      } catch (error) {
        // Only a missing/unusable provider is permanent. A database or network
        // error while resolving it is retried and keeps its own cause.
        if (error instanceof EmbeddingProviderNotConfiguredError) {
          throw new AIFileProcessingError("noEmbeddingProvider", {
            cause: error,
          })
        }
        throw error
      }

      if (aiFile.size > env.HEAVY_MAX_FILE_BYTES) {
        throw new AIFileProcessingError("fileTooLarge")
      }

      const document = await extractKnowledgeDocument(
        aiFile.path,
        aiFile.mimeType,
        {
          sourceName: aiFile.name,
          maxBytes: env.HEAVY_MAX_FILE_BYTES,
          maxTextChars: env.HEAVY_MAX_EXTRACTED_TEXT_CHARS,
          forceProse: config.strategy === "prose",
          tabularHeaderRow: config.tabularHeaderRow,
        },
      ).catch((error: unknown) => {
        if (error instanceof FileSizeLimitError) {
          throw new AIFileProcessingError("fileTooLarge", { cause: error })
        }
        // Storage errors may be transient: rethrown untouched so BullMQ retries.
        if (error instanceof FileFetchError) {
          throw error
        }
        throw new AIFileProcessingError("fileUnreadable", { cause: error })
      })
      if (document.kind === "prose" && document.fallback) {
        logger.warn(
          {
            err: normalizeError(document.fallback.error),
            aiFileId: aiFile.id,
            workspaceId: aiFile.workspaceId,
            mimeType: aiFile.mimeType,
            reason: document.fallback.reason,
          },
          "AI file structured extraction failed, fell back to prose",
        )
      }
      if (document.kind === "tabular" && document.truncated) {
        logger.warn(
          {
            aiFileId: aiFile.id,
            workspaceId: aiFile.workspaceId,
            sheetCount: document.sheets.length,
            rowCount: document.sheets.reduce(
              (total, sheet) => total + sheet.rows.length,
              0,
            ),
          },
          "AI file tabular extraction reached its text limit",
        )
      }
      const result = chunkKnowledgeDocument(document, {
        chunkSize: config.chunkSize,
        overlapSize: config.overlapSize,
      })
      const chunks = result.chunks

      if (chunks.length > env.HEAVY_MAX_CHUNKS_PER_FILE) {
        throw new AIFileProcessingError("tooManyChunks")
      }

      // Reconciling an empty set would delete every existing chunk and still
      // report success: keep the previous index and fail the run instead.
      if (chunks.length === 0) {
        throw new AIFileProcessingError("noExtractableContent")
      }

      if (!(await ensureRunLease("beforeReconcile"))) {
        return
      }

      const pendingEmbeddings =
        await aiFileEmbeddingRepository.reconcilePendingChunks({
          aiFileId: aiFile.id,
          chunks: chunks.map((chunk, chunkIndex) => ({
            chunkIndex,
            content: chunk.content,
            id: createAIFileEmbeddingId({
              aiFileId: aiFile.id,
              chunkIndex,
              content: chunk.content,
            }),
          })),
          workspaceId: aiFile.workspaceId,
        })

      await aiFileService.markChunked({
        aiFileId: aiFile.id,
        workspaceId: aiFile.workspaceId,
        chunking: {
          strategy: result.strategy,
          chunkerVersion: AI_FILE_CHUNKER_VERSIONS[result.strategy],
          chunkSize: result.chunkSize,
          overlapSize: result.overlapSize,
          chunkCount: chunks.length,
          processedAt: new Date().toISOString(),
          extractedChars: measureExtractedChars(document),
        },
      })

      if (pendingEmbeddings.length === 0) {
        if (runId) {
          await aiFileService.markProcessingRunSucceeded({
            aiFileId,
            workspaceId: aiFile.workspaceId,
            runId,
          })
        }
        return
      }

      if (!(await ensureRunLease("beforeEnqueue"))) {
        return
      }

      await aiAgentQueue.addBulk(
        pendingEmbeddings.map((embedding) => ({
          name: AIJobAction.processPendingEmbedding,
          data: {
            type: AIJobAction.processPendingEmbedding,
            data: { aiEmbeddingId: embedding.id },
          },
          opts: {
            jobId: buildAIFileEmbeddingJobId({
              aiFileId: aiFile.id,
              embeddingId: embedding.id,
              runId,
            }),
            priority: AI_FILE_EMBEDDING_PRIORITY,
          },
        })),
      )
      if (runId) {
        await aiFileService.markProcessingRunSucceeded({
          aiFileId,
          workspaceId: aiFile.workspaceId,
          runId,
        })
      }
    },
  })
}

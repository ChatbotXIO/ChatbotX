import { createHash } from "node:crypto"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { aiEmbeddingModel, aiFileModel } from "@chatbotx.io/database/schema"
import { distributedLock } from "@chatbotx.io/redis"
import {
  AIJobAction,
  type AIJobProcessFile,
  aiAgentQueue,
} from "@chatbotx.io/worker-config"
import { env } from "../../env"
import { resolveEmbeddingModel } from "../lib/embedding-model"
import { extractTextFromFile } from "../lib/text-extractor"

type TextChunk = { content: string }

const DEFAULT_CHUNK_SIZE = 1000
const DEFAULT_OVERLAP_SIZE = 200

function splitTextIntoChunks(
  text: string,
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlapSize = DEFAULT_OVERLAP_SIZE,
): readonly TextChunk[] {
  const chunks: TextChunk[] = []
  if (!text || chunkSize <= 0) {
    return chunks
  }

  let start = 0
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    const piece = text.slice(start, end).trim()
    if (piece.length > 0) {
      chunks.push({ content: piece })
    }
    if (end === text.length) {
      break
    }
    start = Math.max(0, end - overlapSize)
  }
  return chunks
}

function createDeterministicEmbeddingId(input: {
  aiFileId: string
  chunkIndex: number
  content: string
}): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        aiFileId: input.aiFileId,
        chunkIndex: input.chunkIndex,
        content: input.content,
      }),
    )
    .digest("hex")
  const id = BigInt(`0x${digest.slice(0, 15)}`)
  return id === 0n ? "1" : id.toString()
}

export async function processAIFile(
  data: AIJobProcessFile["data"],
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlapSize = DEFAULT_OVERLAP_SIZE,
) {
  const { aiFileId } = data

  return await distributedLock.runExclusive({
    key: `ai-file:process:${aiFileId}`,
    timeoutInSeconds: 15 * 60,
    retryTimeoutInSeconds: 30,
    fn: async () => {
      const aiFile = await findOrFail({
        table: aiFileModel,
        where: {
          id: aiFileId,
        },
        message: "AI file not found",
      })

      // Validate embedding provider early to avoid creating chunks that will all fail.
      await resolveEmbeddingModel(aiFile.workspaceId)

      if (aiFile.size > env.HEAVY_MAX_FILE_BYTES) {
        throw new Error("AI file is too large to process")
      }

      const text = await extractTextFromFile(aiFile.path, aiFile.mimeType, {
        maxBytes: env.HEAVY_MAX_FILE_BYTES,
        maxTextChars: env.HEAVY_MAX_EXTRACTED_TEXT_CHARS,
      })

      const chunks: TextChunk[] = splitTextIntoChunks(
        text,
        chunkSize,
        overlapSize,
      ).map((c) => ({ content: c.content }))

      if (chunks.length > env.HEAVY_MAX_CHUNKS_PER_FILE) {
        throw new Error("AI file produced too many chunks")
      }

      const embeddings = chunks.map((chunk, index) => ({
        id: createDeterministicEmbeddingId({
          aiFileId: aiFile.id,
          chunkIndex: index,
          content: chunk.content,
        }),
        content: chunk.content,
        workspaceId: aiFile.workspaceId,
        aiFileId: aiFile.id,
        status: "pending" as const,
      }))

      await db.transaction(async (tx) => {
        await tx
          .delete(aiEmbeddingModel)
          .where(eq(aiEmbeddingModel.aiFileId, aiFile.id))

        if (embeddings.length > 0) {
          await tx.insert(aiEmbeddingModel).values(embeddings)
        }
      })

      if (embeddings.length === 0) {
        return
      }

      await aiAgentQueue.addBulk(
        embeddings.map((embedding) => ({
          name: AIJobAction.processPendingEmbedding,
          data: {
            type: AIJobAction.processPendingEmbedding,
            data: {
              aiEmbeddingId: embedding.id,
            },
          },
          opts: {
            jobId: `ai-file-embedding-${aiFile.id}-${embedding.id}`,
          },
        })),
      )
    },
  })
}

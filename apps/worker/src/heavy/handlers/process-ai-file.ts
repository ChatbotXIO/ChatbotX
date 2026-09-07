import { createHash } from "node:crypto"
import { createAiFileEmbeddingRepository } from "@chatbotx.io/database/repositories"
import { distributedLock } from "@chatbotx.io/redis"
import {
  AIJobAction,
  aiAgentQueue,
  type HeavyJobProcessAIFile,
} from "@chatbotx.io/worker-config"
import { resolveEmbeddingModel } from "../../ai-agent/lib/embedding-model"
import { extractTextFromFile } from "../../ai-agent/lib/text-extractor"
import { env } from "../../env"

type TextChunk = { content: string }

const DEFAULT_CHUNK_SIZE = 1000
const DEFAULT_OVERLAP_SIZE = 200

const aiFileEmbeddingRepository = createAiFileEmbeddingRepository()

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
    .update(JSON.stringify(input))
    .digest("hex")
  const id = BigInt(`0x${digest.slice(0, 15)}`)
  return id === 0n ? "1" : id.toString()
}

export async function processAIFile(
  data: HeavyJobProcessAIFile["data"],
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlapSize = DEFAULT_OVERLAP_SIZE,
): Promise<void> {
  const { aiFileId } = data

  await distributedLock.runExclusive({
    key: `ai-file:process:${aiFileId}`,
    timeoutInSeconds: 15 * 60,
    retryTimeoutInSeconds: 30,
    fn: async () => {
      const aiFile = await aiFileEmbeddingRepository.findFileOrFail(aiFileId)

      await resolveEmbeddingModel(aiFile.workspaceId)

      if (aiFile.size > env.HEAVY_MAX_FILE_BYTES) {
        throw new Error("AI file is too large to process")
      }

      const text = await extractTextFromFile(aiFile.path, aiFile.mimeType, {
        maxBytes: env.HEAVY_MAX_FILE_BYTES,
        maxTextChars: env.HEAVY_MAX_EXTRACTED_TEXT_CHARS,
      })
      const chunks = splitTextIntoChunks(text, chunkSize, overlapSize)

      if (chunks.length > env.HEAVY_MAX_CHUNKS_PER_FILE) {
        throw new Error("AI file produced too many chunks")
      }

      const pendingEmbeddings =
        await aiFileEmbeddingRepository.reconcilePendingChunks({
          aiFileId: aiFile.id,
          chunks: chunks.map((chunk, chunkIndex) => ({
            content: chunk.content,
            id: createDeterministicEmbeddingId({
              aiFileId: aiFile.id,
              chunkIndex,
              content: chunk.content,
            }),
          })),
          workspaceId: aiFile.workspaceId,
        })

      if (pendingEmbeddings.length === 0) {
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
            jobId: `ai-file-embedding-${aiFile.id}-${embedding.id}`,
          },
        })),
      )
    },
  })
}

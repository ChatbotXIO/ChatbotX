import { findOrFail } from "@chatbotx.io/database/client"
import { aiEmbeddingRepository } from "@chatbotx.io/database/repositories"
import { aiFileModel } from "@chatbotx.io/database/schema"
import {
  AIJobAction,
  type AIJobProcessFile,
  aiAgentQueue,
} from "@chatbotx.io/worker-config"
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

export async function processAIFile(
  data: AIJobProcessFile["data"],
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlapSize = DEFAULT_OVERLAP_SIZE,
) {
  const { aiFileId } = data

  const aiFile = await findOrFail({
    table: aiFileModel,
    where: {
      id: aiFileId,
    },
    message: "AI file not found",
  })

  // Validate embedding provider early to avoid creating chunks that will all fail
  await resolveEmbeddingModel(aiFile.workspaceId)

  const text = await extractTextFromFile(aiFile.path, aiFile.mimeType)

  const chunks: TextChunk[] = splitTextIntoChunks(
    text,
    chunkSize,
    overlapSize,
  ).map((c) => ({ content: c.content }))

  const inserted = await aiEmbeddingRepository.bulkCreatePending({
    aiFileId: aiFile.id,
    workspaceId: aiFile.workspaceId,
    chunks,
  })

  await aiAgentQueue.addBulk(
    inserted.map((e) => ({
      name: AIJobAction.processPendingEmbedding,
      data: {
        type: AIJobAction.processPendingEmbedding,
        data: {
          aiEmbeddingId: e.id,
        },
      },
    })),
  )
}

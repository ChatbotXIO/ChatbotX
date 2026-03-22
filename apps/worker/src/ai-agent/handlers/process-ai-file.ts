import { db, findOrFail } from "@aha.chat/database/client"
import { aiEmbeddingModel, aiFileModel } from "@aha.chat/database/schema"
import type { AIEmbeddingStatus, AIFileModel } from "@aha.chat/database/types"
import {
  AIJobAction,
  type AIJobProcessFile,
  aiAgentQueue,
} from "@aha.chat/worker-config"
import { createId } from "@paralleldrive/cuid2"
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

  const aiFile = await findOrFail<AIFileModel>(
    aiFileModel,
    {
      id: aiFileId,
    },
    "AI file not found",
  )

  const text = await extractTextFromFile(aiFile.path, aiFile.mimeType)

  const chunks: TextChunk[] = splitTextIntoChunks(
    text,
    chunkSize,
    overlapSize,
  ).map((c) => ({ content: c.content }))

  await db.insert(aiEmbeddingModel).values(
    chunks.map((c) => ({
      id: createId(),
      content: c.content,
      chatbotId: aiFile.chatbotId,
      aiFileId: aiFile.id,
      status: "pending" as AIEmbeddingStatus,
    })),
  )

  const embeddings = await db.query.aiEmbeddingModel.findMany({
    where: {
      aiFileId: aiFile.id,
    },
  })

  await aiAgentQueue.addBulk(
    embeddings.map((e) => ({
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

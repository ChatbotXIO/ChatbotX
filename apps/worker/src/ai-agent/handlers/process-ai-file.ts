import { AIEmbeddingStatus, prisma } from "@aha.chat/database"
import {
  AIJobAction,
  type AIJobProcessFile,
  aiAgentQueue,
} from "@aha.chat/worker-config"
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

  const aiFile = await prisma.aIFile.findUnique({
    where: { id: aiFileId },
  })
  if (!aiFile) {
    throw new Error("AI file not found")
  }

  const text = await extractTextFromFile(aiFile.path, aiFile.mimeType)

  const chunks: TextChunk[] = splitTextIntoChunks(
    text,
    chunkSize,
    overlapSize,
  ).map((c) => ({ content: c.content }))

  await prisma.aIEmbedding.createMany({
    data: chunks.map((c) => ({
      content: c.content,
      chatbotId: aiFile.chatbotId,
      aiFileId: aiFile.id,
      status: AIEmbeddingStatus.pending,
    })),
  })
  const embeddings = await prisma.aIEmbedding.findMany({
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

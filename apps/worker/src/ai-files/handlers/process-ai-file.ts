import { prisma } from "@aha.chat/database"
import { uploader } from "@aha.chat/filesystem"
import {
  AIFilesJobAction,
  aiFilesQueue,
  type ProcessAiFileData,
} from "@aha.chat/worker-config"
import { extractTextFromStream } from "../lib/text-extractor"

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

export async function processAiFile(data: ProcessAiFileData) {
  const {
    aiFileId,
    filePath,
    mimeType,
    chunkSize = DEFAULT_CHUNK_SIZE,
    overlapSize = DEFAULT_OVERLAP_SIZE,
  } = data

  await prisma.aIFile.update({
    where: { id: aiFileId },
    data: { updatedAt: new Date() },
  })

  const streamKey = filePath
  await uploader.headObject(streamKey)
  const stream = await uploader.getObjectStream(streamKey)
  const extracted = await extractTextFromStream(stream, mimeType)
  const chunks: TextChunk[] = splitTextIntoChunks(
    extracted,
    chunkSize,
    overlapSize,
  ).map((c) => ({ content: c.content }))

  await prisma.aIEmbedding.createMany({
    data: chunks.map((c) => ({
      content: c.content,
      chatbotId: data.chatbotId,
      aiFileId: data.aiFileId,
      status: "pending",
    })),
  })

  await aiFilesQueue.add(AIFilesJobAction.PROCESS_PENDING_EMBEDDINGS, {
    type: AIFilesJobAction.PROCESS_PENDING_EMBEDDINGS,
    data: {
      chatbotId: data.chatbotId,
    },
  })
}

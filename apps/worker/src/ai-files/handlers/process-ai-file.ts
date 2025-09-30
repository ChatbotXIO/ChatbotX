// import fs from "node:fs/promises"

import { prisma } from "@aha.chat/database"
import { uploader } from "@aha.chat/filesystem"
import {
  AiFilesJobAction,
  aiFilesQueue,
  type ProcessAiFileData,
} from "@aha.chat/worker-config"

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
    chunkSize = DEFAULT_CHUNK_SIZE,
    overlapSize = DEFAULT_OVERLAP_SIZE,
  } = data

  // Optional: mark status to processing
  await prisma.aIFile.update({
    where: { id: aiFileId },
    data: { updatedAt: new Date() },
  })

  // Read file from MinIO (try original key, then without public/ prefix)
  let buffer: Buffer
  try {
    buffer = await uploader.getObject(filePath)
  } catch (err) {
    if (filePath.startsWith("public/")) {
      const withoutPublic = filePath.slice(7)
      buffer = await uploader.getObject(withoutPublic)
    } else {
      throw err
    }
  }
  const text = buffer.toString("utf8")

  const chunks = splitTextIntoChunks(text, chunkSize, overlapSize)

  // Enqueue chunk jobs
  await Promise.all(
    chunks.map((c, index) =>
      aiFilesQueue.add(AiFilesJobAction.PROCESS_CHUNK, {
        type: AiFilesJobAction.PROCESS_CHUNK,
        data: {
          chatbotId: data.chatbotId,
          aiFileId: data.aiFileId,
          content: c.content,
          index,
        },
      }),
    ),
  )
}

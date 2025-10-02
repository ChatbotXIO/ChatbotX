// import fs from "node:fs/promises"

import { TextDecoder } from "node:util"
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

  // Read file via stream, avoid buffering all content in memory
  // Try multiple key variants to be resilient to public/ prefix differences
  const candidates: string[] = [filePath]
  if (filePath.startsWith("public/")) {
    candidates.push(filePath.slice(7))
  } else {
    candidates.push(`public/${filePath}`)
  }

  let streamPath: string | null = null
  for (const key of candidates) {
    try {
      await uploader.headObject(key)
      streamPath = key
      break
    } catch {
      // try next candidate
    }
  }
  if (!streamPath) {
    throw new Error(
      `AI file object not found. Tried keys: ${candidates.join(", ")}`,
    )
  }

  const stream = await uploader.getObjectStream(streamPath)
  const decoder = new TextDecoder("utf-8")
  let carry = ""
  const chunks: TextChunk[] = []

  for await (const part of stream) {
    const textPart = decoder.decode(part as Uint8Array, { stream: true })
    carry += textPart

    while (carry.length >= chunkSize + overlapSize) {
      const slice = carry.slice(0, chunkSize).trim()
      if (slice.length > 0) {
        chunks.push({ content: slice })
      }
      carry = carry.slice(Math.max(0, chunkSize - overlapSize))
    }
  }

  // flush remaining
  const tail = carry.trim()
  if (tail.length > 0) {
    // tail may be longer than chunkSize, split with helper for correctness
    for (const c of splitTextIntoChunks(tail, chunkSize, overlapSize)) {
      chunks.push(c)
    }
  }

  // Job1: create pending AIEmbedding rows for each chunk
  await prisma.aIEmbedding.createMany({
    data: chunks.map((c) => ({
      content: c.content,
      chatbotId: data.chatbotId,
      aiFileId: data.aiFileId,
      status: "pending",
    })),
  })

  // Optionally trigger Job2 dispatcher
  await aiFilesQueue.add(AiFilesJobAction.PROCESS_PENDING_EMBEDDINGS, {
    type: AiFilesJobAction.PROCESS_PENDING_EMBEDDINGS,
    data: {
      chatbotId: data.chatbotId,
    },
  })
}

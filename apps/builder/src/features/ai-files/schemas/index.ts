import type { AIEmbeddingStatus, AIFileModel } from "@aha.chat/database/types"
import { z } from "zod"

export type AIFileWithProcessing = AIFileModel & {
  url: string
  chunksCount: number
  processingStatus: AIEmbeddingStatus
}

export type AIFileCollection = {
  data: AIFileWithProcessing[]
}

export const listAIFilesRequest = z.object({
  chatbotId: z.string(),
})
export type ListAIFilesRequest = z.infer<typeof listAIFilesRequest>

export const createAIFileRequest = z.object({
  path: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number(),
})
export type CreateAIFileRequest = z.infer<typeof createAIFileRequest>

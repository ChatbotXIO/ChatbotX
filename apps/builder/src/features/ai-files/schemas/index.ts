import type { AIFileModel } from "@aha.chat/database/types"
import { z } from "zod"

export type AIFileWithProcessing = AIFileModel & {
  isProcessed: boolean
  chunksCount: number
  processingStatus: ProcessingStatus
}

export type AIFileCollection = {
  data: AIFileWithProcessing[]
}

export type ProcessingStatus = "idle" | "processing" | "success" | "error"

export const getAIFilesRequest = z.object({
  chatbotId: z.string(),
})
export type GetAIFilesRequest = z.infer<typeof getAIFilesRequest>

export const createAIFileRequest = z.object({
  path: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number(),
})
export type CreateAIFileRequest = z.infer<typeof createAIFileRequest>

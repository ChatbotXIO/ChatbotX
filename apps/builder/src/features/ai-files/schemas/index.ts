import {
  aiEmbeddingStatus,
  aiFileModel,
  createSelectSchema,
} from "@aha.chat/database/schema"
import type { AIEmbeddingStatus, AIFileModel } from "@aha.chat/database/types"
import { z } from "zod"

export const aiFileResource = createSelectSchema(aiFileModel)

export type AIFileWithProcessing = AIFileModel & {
  url: string
  chunksCount: number
  processingStatus: AIEmbeddingStatus
}

export const listAIFilesRequest = z.object({
  chatbotId: z.bigint(),
})
export type ListAIFilesRequest = z.infer<typeof listAIFilesRequest>

export const listAIFilesResponse = z.object({
  data: z.array(
    aiFileResource.extend({
      url: z.string(),
      chunksCount: z.number(),
      processingStatus: z.enum(aiEmbeddingStatus.enumValues),
    }),
  ),
})
export type ListAIFilesResponse = z.infer<typeof listAIFilesResponse>

export const createAIFileRequest = z.object({
  path: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number(),
})
export type CreateAIFileRequest = z.infer<typeof createAIFileRequest>

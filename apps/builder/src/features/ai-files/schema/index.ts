import {
  type AIEmbeddingStatus,
  aiEmbeddingStatuses,
} from "@chatbotx.io/database/partials"
import { aiFileModel, createSelectSchema } from "@chatbotx.io/database/schema"
import type { AIFileModel } from "@chatbotx.io/database/types"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const aiFileResource = createSelectSchema(aiFileModel, {
  id: zodBigintAsString(),
  workspaceId: zodBigintAsString(),
})

export type AIFileWithProcessing = AIFileModel & {
  url: string
  chunksCount: number
  processingStatus: AIEmbeddingStatus
}

export const listAIFilesRequest = z.object({
  workspaceId: zodBigintAsString(),
})
export type ListAIFilesRequest = z.infer<typeof listAIFilesRequest>

export const listAIFilesResponse = z.object({
  data: z.array(
    aiFileResource.extend({
      url: z.string(),
      chunksCount: z.number(),
      processingStatus: aiEmbeddingStatuses,
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

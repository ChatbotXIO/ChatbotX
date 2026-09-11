import { AI_FILE_MAX_UPLOAD_BYTES } from "@chatbotx.io/business"
import { aiEmbeddingStatuses } from "@chatbotx.io/database/partials"
import { z } from "zod"
import { aiFileResource } from "./index"

export const publicAIFileResource = aiFileResource.extend({
  url: z.string(),
  chunksCount: z.number(),
  processingStatus: aiEmbeddingStatuses,
})

export const createAIFilePublicRequest = z.union([
  z.object({
    name: z.string().trim().min(1).optional(),
    file: z
      .instanceof(File)
      .refine((file) => file.size <= AI_FILE_MAX_UPLOAD_BYTES, {
        message: "Max file size is 100MB.",
      }),
  }),
  z.object({
    name: z.string().trim().min(1).optional(),
    url: z.url(),
  }),
])
export type CreateAIFilePublicRequest = z.infer<
  typeof createAIFilePublicRequest
>

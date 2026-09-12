import { AI_FILE_MAX_UPLOAD_BYTES } from "@chatbotx.io/business"
import { aiEmbeddingStatuses } from "@chatbotx.io/database/partials"
import { z } from "zod"
import { aiFileResource } from "./index"

export const publicAIFileResource = aiFileResource.extend({
  url: z.string(),
  chunksCount: z.number(),
  processingStatus: aiEmbeddingStatuses,
})

export const createAIFilePublicRequest = z
  .object({
    name: z.string().trim().min(1).optional(),
    file: z
      .instanceof(File)
      .refine((file) => file.size <= AI_FILE_MAX_UPLOAD_BYTES, {
        message: "Max file size is 100MB.",
      })
      .optional(),
    url: z.url().optional(),
  })
  // A plain z.union resolves to the first matching branch and silently
  // strips the other field as unknown, so `{ file, url }` would drop `url`
  // with no error. A flat object + refine sees both fields at once.
  .superRefine((value, ctx) => {
    if (value.file !== undefined && value.url !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Provide either 'file' or 'url', not both.",
      })
    } else if (value.file === undefined && value.url === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Provide either 'file' or 'url'.",
      })
    }
  })
export type CreateAIFilePublicRequest = z.infer<
  typeof createAIFilePublicRequest
>

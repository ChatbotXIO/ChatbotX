import { z } from "zod"
import { tagResource } from "./resource"

export const createTagRequest = z.object({
  name: z.string().trim().min(1).max(255),
  folderId: z.cuid2().nullish(),
  syncToMessenger: z.boolean().nullish(),
})
export type CreateTagRequest = z.input<typeof createTagRequest>

export const createTagResponse = z.object({
  data: tagResource,
})
export type CreateTagResponse = z.infer<typeof createTagResponse>

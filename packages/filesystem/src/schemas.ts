import { z } from "zod"

export const createPresignedUploadRequest = z.object({
  name: z.string(),
  mimeType: z.string(),
})
export type CreatePresignedUploadRequest = z.infer<
  typeof createPresignedUploadRequest
>

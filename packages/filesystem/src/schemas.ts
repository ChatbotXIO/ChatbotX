import { z } from "zod"

export const createPresignedUploadRequest = z.array(
  z.object({
    path: z.string().trim().min(1),
    name: z.string().trim().min(1),
    mimeType: z.string().trim().min(1),
  }),
)
export type CreatePresignedUploadRequest = z.infer<
  typeof createPresignedUploadRequest
>

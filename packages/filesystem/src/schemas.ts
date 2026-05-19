import { z } from "zod"

export const createPresignedUploadRequest = z.array(
  z.object({
    type: z.string().trim().min(1).optional(),
    subType: z.string().trim().min(1).optional(),
    path: z.string().trim().min(1),
    name: z.string().trim().min(1),
    mimeType: z.string().trim().min(1),
  }),
)
export type CreatePresignedUploadRequest = z.infer<
  typeof createPresignedUploadRequest
>

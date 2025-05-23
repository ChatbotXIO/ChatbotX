import { z } from "zod"

export const createPresignedUploadRequest = z.array(
  z.object({
    filePathProps: z.object({
      chatbotId: z.string().trim(),
      flowId: z.string().trim(),
      stepId: z.string().trim(),
    }),
    fileName: z.string().trim(),
    fileType: z.string().trim(),
  }),
)
export type CreatePresignedUploadRequest = z.infer<
  typeof createPresignedUploadRequest
>

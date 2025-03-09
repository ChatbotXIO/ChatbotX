import { AttachmentType } from "@prisma/client"
import { z } from "zod"

const MAX_FILE_SIZE = 5 * 1000 * 1000

export const createMessageRequest = z
  .union([
    z.object({
      content: z.string().trim().min(1).max(1000),
    }),
    z.object({
      files: z
        .array(
          z.instanceof(File).refine(
            (file) => {
              return file.size <= MAX_FILE_SIZE
            },
            {
              message: "Max image size is 5MB.",
            },
          ),
        )
        .min(1),
    }),
  ])
  .and(
    z.object({
      clientId: z.string().cuid2(),
    }),
  )
export type CreateMessageRequest = z.infer<typeof createMessageRequest>

export const guessAttachmentTypeFromMimeType = (mimeType: string) => {
  if (mimeType.startsWith("image/")) {
    return AttachmentType.IMAGE
  }
  if (mimeType.startsWith("video/")) {
    return AttachmentType.VIDEO
  }
  if (mimeType.startsWith("audio/")) {
    return AttachmentType.AUDIO
  }
  return AttachmentType.FILE
}

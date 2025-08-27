import { CHAT_WIDGET_SOURCE_PREFIX, FileType } from "@aha.chat/database/types"
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

export const createWebchatMessageRequest = z
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
      chatbotId: z.string().cuid2(),
      guestConversationId: z
        .string()
        .refine((id) => id.startsWith(CHAT_WIDGET_SOURCE_PREFIX), {
          message: "Invalid guest conversation ID",
        }),
    }),
  )
export type CreateWebchatMessageRequest = z.infer<
  typeof createWebchatMessageRequest
>

export const guessFileTypeFromMimeType = (mimeType: string) => {
  if (mimeType.startsWith("image/")) {
    return FileType.IMAGE
  }
  if (mimeType.startsWith("video/")) {
    return FileType.VIDEO
  }
  if (mimeType.startsWith("audio/")) {
    return FileType.AUDIO
  }
  return FileType.DOCUMENT
}

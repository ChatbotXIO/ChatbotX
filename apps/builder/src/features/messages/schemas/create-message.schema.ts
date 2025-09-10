import { FileType, WEBCHAT_SOURCE_PREFIX } from "@aha.chat/database/types"
import { z } from "zod"

export const createMessageRequest = z
  .union([
    z.object({
      content: z.string().trim().min(1).max(1000),
    }),
    z.object({
      attachment: z.object({
        name: z.string(),
        mimeType: z.string(),
        size: z.number(),
        fileType: z.nativeEnum(FileType),
        width: z.number().optional(),
        height: z.number().optional(),
        originPath: z.string(),
      }),
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
      attachment: z.object({
        name: z.string(),
        mimeType: z.string(),
        size: z.number(),
        fileType: z.nativeEnum(FileType),
        width: z.number().optional(),
        height: z.number().optional(),
        originPath: z.string(),
      }),
    }),
  ])
  .and(
    z.object({
      clientId: z.string().cuid2(),
      chatbotId: z.string().cuid2(),
      guestConversationId: z
        .string()
        .refine((id) => id.startsWith(WEBCHAT_SOURCE_PREFIX), {
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

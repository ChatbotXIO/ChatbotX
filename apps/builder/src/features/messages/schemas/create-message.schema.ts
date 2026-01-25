import { WEBCHAT_SOURCE_PREFIX } from "@aha.chat/database/types"
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
          z.instanceof(File).refine((file) => file.size <= MAX_FILE_SIZE, {
            message: "Max image size is 5MB.",
          }),
        )
        .min(1),
    }),
  ])
  .and(
    z.object({
      clientId: z.cuid2(),
    }),
  )
export type CreateMessageRequest = z.infer<typeof createMessageRequest>

export const createWebchatMessageRequest = z
  .union([
    z.object({
      content: z.string().trim().min(1).max(1000),
      postback: z.string().trim().optional(),
    }),
    z.object({
      flowId: z.cuid2(),
    }),
    z.object({
      initRef: z.string(),
    }),
    z.object({
      files: z
        .array(
          z.instanceof(File).refine((file) => file.size <= MAX_FILE_SIZE, {
            message: "Max image size is 5MB.",
          }),
        )
        .min(1),
    }),
  ])
  .and(
    z.object({
      clientId: z.cuid2(),
      chatbotId: z.cuid2(),
      webchatId: z.cuid2(),
      guestConversationId: z
        .string()
        .refine((id) => id.startsWith(WEBCHAT_SOURCE_PREFIX), {
          message: "Invalid guest conversation ID",
        }),
      ref: z.string().optional(),
    }),
  )
export type CreateWebchatMessageRequest = z.infer<
  typeof createWebchatMessageRequest
>

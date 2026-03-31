import { channelTypes } from "@aha.chat/database/schema"
import { WEBCHAT_SOURCE_PREFIX } from "@aha.chat/database/types"
import { z } from "zod"

const MAX_FILE_SIZE = 5 * 1000 * 1000

export const createMessageRequest = z
  .union([
    z.object({
      text: z.string().trim().min(1).max(1000),
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
    // z.object({
    //   fileUrl: z.url(),
    // }),
    z.object({
      flowId: z.bigint(),
      nodeId: z.bigint().optional(),
    }),
  ])
  .and(
    z.object({
      clientId: z.bigint().optional(),
    }),
  )
export type CreateMessageRequest = z.infer<typeof createMessageRequest>

export const createWebchatMessageRequest = z
  .union([
    z.object({
      text: z.string().trim().min(1).max(1000),
      postback: z.string().trim().optional(),
    }),
    z.object({
      flowId: z.bigint(),
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
      clientId: z.bigint().optional(),
      chatbotId: z.bigint(),
      webchatId: z.bigint(),
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

export const sendFileMessageRequest = z.object({
  contactId: z.bigint(),
  channel: channelTypes,
  file: z.file().refine((file) => file.size <= MAX_FILE_SIZE, {
    message: "Max image size is 5MB.",
  }),
})

export const sendFlowMessageRequest = z.object({
  contactId: z.bigint(),
  channel: channelTypes,
  flowId: z.bigint(),
})

export const chatbotTokenCreateMessageRequest = createMessageRequest.and(
  z.object({
    channel: channelTypes,
  }),
)

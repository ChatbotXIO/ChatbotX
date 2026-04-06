import { channelTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
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
      flowId: zodBigintAsString(),
      nodeId: zodBigintAsString().optional(),
    }),
  ])
  .and(
    z.object({
      inboxId: zodBigintAsString().optional().meta({
        description:
          "ID of the channel to send the message on. null to send message on the last interacted channel (if any).",
      }),
      clientId: zodBigintAsString().optional(),
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
      flowId: zodBigintAsString(),
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
      clientId: z.string().optional(),
      workspaceId: zodBigintAsString(),
      webchatId: zodBigintAsString(),
      guestConversationId: zodBigintAsString(),
      ref: z.string().optional(),
    }),
  )
export type CreateWebchatMessageRequest = z.infer<
  typeof createWebchatMessageRequest
>

export const sendFileMessageRequest = z.object({
  contactId: zodBigintAsString(),
  channel: channelTypes,
  file: z.file().refine((file) => file.size <= MAX_FILE_SIZE, {
    message: "Max image size is 5MB.",
  }),
})

export const sendFlowMessageRequest = z.object({
  contactId: zodBigintAsString(),
  channel: channelTypes,
  flowId: zodBigintAsString(),
})

export const developerAccessTokenCreateMessageRequest =
  createMessageRequest.and(
    z.object({
      channel: channelTypes,
    }),
  )

import { channelTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

// Pixel-perfect Respond.io 2026-05-24: 50 arquivos por mensagem, 20MB cada.
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB
const MAX_FILES_PER_MESSAGE = 50

export const createMessageRequest = z
  .union([
    z.object({
      text: z.string().trim().min(1).max(1000),
    }),
    z.object({
      files: z
        .array(
          z.instanceof(File).refine((file) => file.size <= MAX_FILE_SIZE, {
            message: "Tamanho máximo por arquivo: 20MB.",
          }),
        )
        .min(1)
        .max(MAX_FILES_PER_MESSAGE),
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
      // Quando true, mensagem é comentário interno (não vai pro contato).
      // 2026-05-24 — Sprint Inbox 4 (Respond.io padrão).
      isInternal: z.boolean().optional(),
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

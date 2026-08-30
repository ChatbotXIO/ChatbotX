import { channelTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

const MAX_FILE_SIZE = 5 * 1000 * 1000

const mediaLibraryFileRequest = z.object({
  path: z.string().min(1),
  // Display-only; the server resolves the public URL from `path` itself.
  url: z.string().optional(),
  mimeType: z.string().min(1),
  name: z.string().nullish(),
  size: z.number().int().nonnegative(),
})

export const createMessageRequest = z
  .union([
    z.object({
      text: z.string().trim().min(1).max(1000),
      files: z
        .array(
          z.instanceof(File).refine((file) => file.size <= MAX_FILE_SIZE, {
            message: "Max image size is 5MB.",
          }),
        )
        .min(1),
    }),
    z.object({
      text: z.string().trim().min(1).max(1000),
      mediaFile: mediaLibraryFileRequest,
    }),
    // Media Library selection identified by DB id — must be listed before
    // the text-only branch below, since z.object() strips unknown keys: if
    // the text-only branch matched first, mediaFileId would be silently
    // dropped and the message would send as plain text.
    z.object({
      text: z.string().trim().min(1).max(1000),
      mediaFileId: zodBigintAsString(),
    }),
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
    z.object({
      mediaFile: mediaLibraryFileRequest,
    }),
    z.object({
      mediaFileId: zodBigintAsString(),
    }),
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
      replyToMessageId: z.string().optional(),
      replyToMessageCreatedAt: z.coerce.date().optional(),
      // When true, the outgoing comment is sent as a comment-anchored private
      // reply DM instead of a public comment reply.
      isPrivateReply: z.boolean().optional(),
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
      init: z.literal(true),
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
      parentUrl: z.url().max(2048).optional(),
      locale: z.string().max(35).optional(),
      timezone: z.string().max(64).optional(),
      accessToken: z.string().optional(),
      parentOrigin: z.string().optional(),
    }),
  )
export type CreateWebchatMessageRequest = z.infer<
  typeof createWebchatMessageRequest
>

export const deleteMessageRequest = z.object({
  id: z.string().min(1),
  createdAt: z.coerce.date(),
})
export type DeleteMessageRequest = z.infer<typeof deleteMessageRequest>

export const editMessageRequest = z.object({
  messageId: zodBigintAsString(),
  createdAt: z.coerce.date(),
  newText: z.string().trim().min(1).max(2000),
  newAttachmentPath: z.string().optional(),
  newAttachmentPublicUrl: z.string().optional(),
  newAttachmentMimeType: z.string().optional(),
  newAttachmentName: z.string().optional(),
  newAttachmentSize: z.number().int().optional(),
  removeAttachment: z.boolean().optional(),
})
export type EditMessageRequest = z.infer<typeof editMessageRequest>

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

export const changeMessageAttributesRequest = z.object({
  messageId: zodBigintAsString(),
  createdAt: z.coerce.date(),
  liked: z.boolean().optional(),
  hidden: z.boolean().optional(),
})
export type ChangeMessageAttributesRequest = z.infer<
  typeof changeMessageAttributesRequest
>

export const developerAccessTokenCreateMessageRequest =
  createMessageRequest.and(
    z.object({
      channel: channelTypes,
    }),
  )

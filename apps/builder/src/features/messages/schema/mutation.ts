import { channelTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { zodGuestConversationId } from "@/features/integration-webchat/lib/guest-conversation-id"

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
      text: z.string().trim().min(1).max(1000).describe("Message text."),
      files: z
        .array(
          z.instanceof(File).refine((file) => file.size <= MAX_FILE_SIZE, {
            message: "Max image size is 5MB.",
          }),
        )
        .min(1)
        .describe("Media files to attach, up to 5MB each."),
    }),
    z.object({
      text: z.string().trim().min(1).max(1000).describe("Message text."),
      mediaFile: mediaLibraryFileRequest.describe(
        "Media library file reference to attach.",
      ),
    }),
    // Media Library selection identified by DB id — must be listed before
    // the text-only branch below, since z.object() strips unknown keys: if
    // the text-only branch matched first, mediaFileId would be silently
    // dropped and the message would send as plain text.
    z.object({
      text: z.string().trim().min(1).max(1000).describe("Message text."),
      mediaFileId: zodBigintAsString().describe(
        "Media library file id (numeric string) to attach.",
      ),
    }),
    // Multi-select Media Library variant — several images sent as one
    // message. Same union-ordering constraint as mediaFileId above.
    z.object({
      text: z.string().trim().min(1).max(1000).describe("Message text."),
      mediaFileIds: z
        .array(zodBigintAsString())
        .min(1)
        .max(10)
        .describe(
          "Media library file ids (numeric strings) to attach, up to 10.",
        ),
    }),
    z.object({
      text: z.string().trim().min(1).max(1000).describe("Message text."),
    }),
    z.object({
      files: z
        .array(
          z.instanceof(File).refine((file) => file.size <= MAX_FILE_SIZE, {
            message: "Max image size is 5MB.",
          }),
        )
        .min(1)
        .describe("Media files to attach, up to 5MB each."),
    }),
    z.object({
      mediaFile: mediaLibraryFileRequest.describe(
        "Media library file reference to attach.",
      ),
    }),
    z.object({
      mediaFileId: zodBigintAsString().describe(
        "Media library file id (numeric string) to attach.",
      ),
    }),
    z.object({
      mediaFileIds: z
        .array(zodBigintAsString())
        .min(1)
        .max(10)
        .describe(
          "Media library file ids (numeric strings) to attach, up to 10.",
        ),
    }),
    z.object({
      flowId: zodBigintAsString().describe(
        "Flow id (numeric string) to send instead of a plain message. Get it from `flows.list`.",
      ),
      nodeId: zodBigintAsString()
        .optional()
        .describe(
          "Node id within the flow to start from. Defaults to the flow's start node.",
        ),
    }),
  ])
  .and(
    z.object({
      inboxId: zodBigintAsString()
        .optional()
        .describe(
          "ID of the channel to send the message on. null to send message on the last interacted channel (if any).",
        ),
      clientId: zodBigintAsString()
        .optional()
        .describe("Client-generated id echoed back for de-duplication."),
      replyToMessageId: z
        .string()
        .optional()
        .describe("Id of the message this one replies to."),
      replyToMessageCreatedAt: z.coerce
        .date()
        .optional()
        .describe("Creation timestamp of the message this one replies to."),
      // When true, the outgoing comment is sent as a comment-anchored private
      // reply DM instead of a public comment reply.
      isPrivateReply: z
        .boolean()
        .optional()
        .describe(
          "When true, sends as a comment-anchored private reply DM instead of a public comment reply.",
        ),
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
      guestConversationId: zodGuestConversationId(),
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

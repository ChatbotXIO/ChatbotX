import { z } from "zod"

export const senderTypes = z.enum(["bot", "contact", "system", "user", "api"])
export type SenderType = z.infer<typeof senderTypes>

export const messageTypes = z.enum(["incoming", "outgoing", "activity"])
export type MessageType = z.infer<typeof messageTypes>

export const contentTypes = z.enum(["text", "location", "refLink"])
export type ContentType = z.infer<typeof contentTypes>

export const lastUserInputTypes = z.enum([
  "text",
  "location",
  "refLink",
  "image",
  "video",
  "audio",
  "gif",
  "file",
  // An Instagram story in which the contact tagged the connected account.
  "storyMention",
  // An Instagram reel the contact shared into the chat.
  "reel",
])
export type LastUserInputType = z.infer<typeof lastUserInputTypes>

export const productMessageUnresolvableReasons = [
  "channelUnsupported",
  "catalogNotConnected",
  "noProductsSendable",
  "productsNotSendable",
] as const
export type ProductMessageUnresolvableReason =
  (typeof productMessageUnresolvableReasons)[number]

export const IMAGES_NOT_SUPPORTED_ON_CHANNEL_CODE =
  "imagesNotSupportedOnChannel"

export const imagesNotSupportedOnChannelReasons = [
  "imagesNotSupported",
  "tooManyImages",
] as const
export type ImagesNotSupportedOnChannelReason =
  (typeof imagesNotSupportedOnChannelReasons)[number]

/** The `data` an API caller gets when a channel refuses a message's images. */
export const imagesNotSupportedOnChannelDataSchema = z.object({
  reason: z
    .enum(imagesNotSupportedOnChannelReasons)
    .describe(
      "`imagesNotSupported`: this channel (or comment reply) can't carry images at all. `tooManyImages`: it carries at most `max` images.",
    ),
  channel: z.string().describe("Channel of the conversation's inbox."),
  max: z.number().int().describe("Most images allowed here (0 = none)."),
})

export const PRODUCT_MESSAGE_UNRESOLVABLE_CODE = "productMessageUnresolvable"

/** The `data` an API caller gets with a refused product message, so it can branch on `reason`. */
export const productMessageUnresolvableDataSchema = z.object({
  reason: z.enum(productMessageUnresolvableReasons),
  productIds: z
    .string()
    .optional()
    .describe(
      "Comma-separated ids that are not sendable (`productsNotSendable`).",
    ),
})

/**
 * The fields {@link isResendableMessage} reads, typed loosely (the builder's
 * resource and the stored row differ in how narrow these are).
 */
export type ResendableMessageFields = {
  messageType: string
  senderType: string
  type: string
  contentAttributes: unknown
  sendError: string | null
  sourceId: string | null
  /** Empty on a row only the browser knows (a rejected submit): nothing to resend. */
  contactInboxId: string | null
  parentId?: string | null | undefined
  deletedAt?: Date | null | undefined
}

/** `contentAttributes` key that keeps a private reply's comment createdAt (ISO string). */
export const REPLY_TARGET_CREATED_AT_KEY = "replyToMessageCreatedAt"

/** Same marker as the SDK's `getWhatsappCallPermissionRequest` (kept local: partials stay free of the SDK). */
const isCallPermissionRequestAttributes = (
  contentAttributes: unknown,
): boolean =>
  typeof contentAttributes === "object" &&
  contentAttributes !== null &&
  "type" in contentAttributes &&
  contentAttributes.type === "whatsapp_call_permission_request"

const hasReplyTargetCreatedAt = (contentAttributes: unknown): boolean =>
  typeof contentAttributes === "object" &&
  contentAttributes !== null &&
  REPLY_TARGET_CREATED_AT_KEY in contentAttributes &&
  typeof contentAttributes[REPLY_TARGET_CREATED_AT_KEY] === "string"

const isPrivateReplyAttributes = (contentAttributes: unknown): boolean =>
  typeof contentAttributes === "object" &&
  contentAttributes !== null &&
  "isPrivateReply" in contentAttributes &&
  contentAttributes.isPrivateReply === true

/**
 * A message that can be sent again: an outgoing message a person or the API
 * typed (never a bot or a flow), a DM or a private reply (stored as a `comment`
 * but delivered as a DM), that failed and was never given a provider id. A
 * public comment reply is excluded. One rule for the resend service and the
 * inbox's Resend button, so the button is never offered for a message the
 * service would refuse.
 */
export const isResendableMessage = (
  message: ResendableMessageFields,
): boolean => {
  const isDirectMessage =
    message.type === "message" ||
    (message.type === "comment" &&
      isPrivateReplyAttributes(message.contentAttributes))
  return (
    message.messageType === "outgoing" &&
    (message.senderType === "user" || message.senderType === "api") &&
    isDirectMessage &&
    message.sendError !== null &&
    message.sourceId === null &&
    Boolean(message.contactInboxId) &&
    !message.deletedAt &&
    // A call-permission request is created behind its own gates (call access,
    // Meta's request limits) that a plain resend would skip.
    !isCallPermissionRequestAttributes(message.contentAttributes) &&
    // A reply to a comment can only be rebuilt when its createdAt was kept.
    (!message.parentId || hasReplyTargetCreatedAt(message.contentAttributes))
  )
}

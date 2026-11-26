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
 * `contentAttributes` key marking a message a workspace member sent from the
 * builder's Inbox (`sendFrom: "inbox"`). Stamped when the row is created so a
 * retry or a late delivery-status callback can still tell it apart.
 */
export const SENT_FROM_INBOX_KEY = "sentFromInbox"

/**
 * `contentAttributes` key naming the workspace member who started a bot-typed
 * outgoing row (a flow step or template a member sent from the Inbox or with a
 * member token). `senderType`/`senderId` stay untouched so bot quota and
 * analytics are unchanged. Typed rows already carry the member in `senderId`.
 */
export const SENT_BY_USER_ID_KEY = "sentByUserId"

/** The `contentAttributes` fragment that stamps the member behind a row. */
export const sentByUserAttributes = (
  userId: string | null | undefined,
): { [SENT_BY_USER_ID_KEY]?: string } =>
  userId ? { [SENT_BY_USER_ID_KEY]: userId } : {}

/**
 * The workspace member who authored a message, or `null` when none can be
 * named (a contact, a bot, the API with a workspace token, a page echo).
 * Pure, so the server and the realtime client resolve authorship identically.
 */
export const resolveMessageAuthorUserId = (message: {
  /** A `SenderType`; typed `string` because message rows carry it as text. */
  senderType: string
  /** Typed `unknown` because the client message resource does not narrow it. */
  senderId: unknown
  contentAttributes: unknown
}): string | null => {
  if (message.senderType === senderTypes.enum.user) {
    return typeof message.senderId === "string" ? message.senderId : null
  }
  const attributes = message.contentAttributes
  if (
    typeof attributes === "object" &&
    attributes !== null &&
    SENT_BY_USER_ID_KEY in attributes &&
    typeof attributes[SENT_BY_USER_ID_KEY] === "string"
  ) {
    return attributes[SENT_BY_USER_ID_KEY]
  }
  return null
}

/**
 * Whether a message was sent by a workspace member from the Inbox. Only such a
 * message is kept, with its error, when its send fails for good; every other
 * failed outgoing message is removed and its error goes to the Error Log.
 */
export const isSentFromInbox = (contentAttributes: unknown): boolean =>
  typeof contentAttributes === "object" &&
  contentAttributes !== null &&
  SENT_FROM_INBOX_KEY in contentAttributes &&
  contentAttributes[SENT_FROM_INBOX_KEY] === true

/**
 * Whether a message was created before the Inbox marker existed, and was typed
 * by a member. Every row created since carries `sentFromInbox` (`true` from the
 * Inbox, `false` from the API), so a row with no marker at all is older. Such a
 * row sent by a member (`senderType: "user"`) is kept when its send fails late:
 * it was an Inbox message then, and removing it would lose what the member typed.
 */
export const isLegacyMemberMessage = (input: {
  contentAttributes?: unknown
  senderType?: string | null | undefined
}): boolean =>
  input.senderType === "user" &&
  !(
    typeof input.contentAttributes === "object" &&
    input.contentAttributes !== null &&
    SENT_FROM_INBOX_KEY in input.contentAttributes
  )

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

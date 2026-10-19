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

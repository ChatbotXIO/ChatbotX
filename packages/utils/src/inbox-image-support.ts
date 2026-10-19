import type { ChannelType } from "./channel"

/** Most images a saved reply can carry (and an inbox send can pick). */
export const SAVED_REPLY_MAX_IMAGES = 10

export const isImageMimeType = (mimeType: string) =>
  mimeType.startsWith("image/")

/**
 * Where an inbox reply lands:
 * - `message`: the contact's direct message thread;
 * - `comment`: a public reply under the contact's comment;
 * - `privateReply`: a DM answering a comment — delivered to the contact's
 *   inbox like a message, but through the channel's private-reply API.
 */
export type InboxReplyKind = "message" | "comment" | "privateReply"

/**
 * The most images an inbox reply can carry per channel and reply kind. `0`
 * means the channel cannot send images there at all.
 *
 * Mirrors what each integration's outgoing handler actually delivers today:
 * Threads only replies to comments with text, Instagram and TikTok comment
 * replies reject media, a Messenger comment reply carries a single
 * `attachment_url`, Messenger/Instagram private replies reuse the DM
 * conversion (so they carry images), and TikTok private replies reject every
 * attachment. Both the composer and `messageService.createOutgoing` read this
 * table, so the UI and the public API reject the same sends.
 */
export const INBOX_IMAGE_SUPPORT: Record<
  ChannelType,
  Record<InboxReplyKind, number>
> = {
  messenger: { message: 10, comment: 1, privateReply: 10 },
  instagram: { message: 10, comment: 0, privateReply: 10 },
  tiktok: { message: 10, comment: 0, privateReply: 0 },
  whatsapp: { message: 10, comment: 0, privateReply: 0 },
  telegram: { message: 10, comment: 0, privateReply: 0 },
  zalo: { message: 10, comment: 0, privateReply: 0 },
  webchat: { message: 10, comment: 0, privateReply: 0 },
  api: { message: 10, comment: 0, privateReply: 0 },
  omnichannel: { message: 10, comment: 0, privateReply: 0 },
  threads: { message: 0, comment: 0, privateReply: 0 },
  smtp: { message: 0, comment: 0, privateReply: 0 },
}

export type InboxImageCheckResult =
  | { ok: true }
  | { ok: false; reason: "imagesNotSupported" | "tooManyImages"; max: number }

/**
 * A private reply wins over the reply target: it carries a
 * `replyToMessageId` too, yet lands in the contact's DMs.
 */
export function resolveInboxReplyKind(props: {
  hasReplyTarget: boolean
  isPrivateReply: boolean
}): InboxReplyKind {
  if (props.isPrivateReply) {
    return "privateReply"
  }
  return props.hasReplyTarget ? "comment" : "message"
}

export function getInboxImageLimit(props: {
  channel: ChannelType
  kind: InboxReplyKind
}): number {
  return INBOX_IMAGE_SUPPORT[props.channel][props.kind]
}

export function checkInboxImages(props: {
  channel: ChannelType
  kind: InboxReplyKind
  imageCount: number
}): InboxImageCheckResult {
  const max = getInboxImageLimit(props)
  if (props.imageCount === 0) {
    return { ok: true }
  }
  if (max === 0) {
    return { ok: false, reason: "imagesNotSupported", max }
  }
  if (props.imageCount > max) {
    return { ok: false, reason: "tooManyImages", max }
  }
  return { ok: true }
}

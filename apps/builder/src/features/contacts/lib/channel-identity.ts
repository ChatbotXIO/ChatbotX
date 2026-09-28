import { type ChannelType, channelTypes } from "@chatbotx.io/database/partials"
import type { ContactInboxResource } from "../../contact-inboxes/schema/resource"

/**
 * Label for `ContactInbox.sourceId`, in each platform's own term for the id
 * it keys the contact by. WhatsApp's sourceId is the phone-based `wa_id`; its
 * BSUID lives in `sourceUserId`. Threads keys by the lowercased handle, and
 * `api` by the caller's own id. `omnichannel` never owns a ContactInbox, so it
 * only gets the generic label.
 */
export const sourceIdLabelKeyByChannel = {
  [channelTypes.enum.messenger]: "fields.channelIdentity.psid",
  [channelTypes.enum.instagram]: "fields.channelIdentity.igsid",
  [channelTypes.enum.whatsapp]: "fields.channelIdentity.whatsappId",
  [channelTypes.enum.zalo]: "fields.channelIdentity.zaloUserId",
  [channelTypes.enum.telegram]: "fields.channelIdentity.telegramChatId",
  [channelTypes.enum.tiktok]: "fields.channelIdentity.tiktokUserId",
  [channelTypes.enum.threads]: "fields.channelIdentity.threadsUsername",
  [channelTypes.enum.webchat]: "fields.channelIdentity.webchatGuestId",
  [channelTypes.enum.api]: "fields.channelIdentity.externalId",
  [channelTypes.enum.smtp]: "fields.email.label",
  [channelTypes.enum.omnichannel]: "fields.channelIdentity.channelId",
} as const satisfies Record<ChannelType, string>

export type SourceIdLabelKey =
  (typeof sourceIdLabelKeyByChannel)[keyof typeof sourceIdLabelKeyByChannel]

/**
 * The channel-side id row for the contact panel, or null when there is
 * nothing to show. A WhatsApp user who hides their phone is keyed by BSUID, so
 * their sourceId IS the BSUID — the BSUID row already shows it, and labelling
 * it "WhatsApp ID" would be wrong.
 */
export const resolveSourceIdentity = (
  contactInbox:
    | Pick<ContactInboxResource, "channel" | "sourceId" | "sourceUserId">
    | undefined,
): { labelKey: SourceIdLabelKey; value: string } | null => {
  const sourceId = contactInbox?.sourceId
  if (!sourceId) {
    return null
  }
  const parsedChannel = channelTypes.safeParse(contactInbox.channel)
  const channel = parsedChannel.success
    ? parsedChannel.data
    : channelTypes.enum.omnichannel
  if (
    channel === channelTypes.enum.whatsapp &&
    sourceId === contactInbox.sourceUserId
  ) {
    return null
  }
  return { labelKey: sourceIdLabelKeyByChannel[channel], value: sourceId }
}

import { type ChannelType, channelTypes } from "@chatbotx.io/database/partials"
import { isSourceUserIdKeyedIdentity } from "@chatbotx.io/sdk"
import type { ContactInboxResource } from "../../contact-inboxes/schema/resource"

/**
 * Label for `ContactInbox.sourceId`, in each platform's own term for the id
 * it keys the contact by. WhatsApp's sourceId is the phone-based `wa_id`; its
 * BSUID lives in `sourceUserId`. Threads keys by the lowercased handle, and
 * `api` by the caller's own id. `omnichannel` never owns a ContactInbox, so it
 * only gets the generic label.
 */
export const sourceIdentityConfigByChannel = {
  [channelTypes.enum.messenger]: {
    labelKey: "fields.channelIdentity.psid",
    hideWhenSourceUserIdKeyed: false,
  },
  [channelTypes.enum.instagram]: {
    labelKey: "fields.channelIdentity.igsid",
    hideWhenSourceUserIdKeyed: false,
  },
  [channelTypes.enum.whatsapp]: {
    labelKey: "fields.channelIdentity.whatsappId",
    hideWhenSourceUserIdKeyed: true,
  },
  [channelTypes.enum.zalo]: {
    labelKey: "fields.channelIdentity.zaloUserId",
    hideWhenSourceUserIdKeyed: false,
  },
  [channelTypes.enum.telegram]: {
    labelKey: "fields.channelIdentity.telegramChatId",
    hideWhenSourceUserIdKeyed: false,
  },
  [channelTypes.enum.tiktok]: {
    labelKey: "fields.channelIdentity.tiktokUserId",
    hideWhenSourceUserIdKeyed: false,
  },
  [channelTypes.enum.threads]: {
    labelKey: "fields.channelIdentity.threadsUsername",
    hideWhenSourceUserIdKeyed: false,
  },
  [channelTypes.enum.webchat]: {
    labelKey: "fields.channelIdentity.webchatGuestId",
    hideWhenSourceUserIdKeyed: false,
  },
  [channelTypes.enum.api]: {
    labelKey: "fields.channelIdentity.externalId",
    hideWhenSourceUserIdKeyed: false,
  },
  [channelTypes.enum.smtp]: {
    labelKey: "fields.email.label",
    hideWhenSourceUserIdKeyed: false,
  },
  [channelTypes.enum.omnichannel]: {
    labelKey: "fields.channelIdentity.channelId",
    hideWhenSourceUserIdKeyed: false,
  },
} as const satisfies Record<
  ChannelType,
  { labelKey: string; hideWhenSourceUserIdKeyed: boolean }
>

export type SourceIdLabelKey =
  (typeof sourceIdentityConfigByChannel)[keyof typeof sourceIdentityConfigByChannel]["labelKey"]

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
  const config = sourceIdentityConfigByChannel[channel]
  if (
    config.hideWhenSourceUserIdKeyed &&
    isSourceUserIdKeyedIdentity({ ...contactInbox, sourceId })
  ) {
    return null
  }
  return { labelKey: config.labelKey, value: sourceId }
}

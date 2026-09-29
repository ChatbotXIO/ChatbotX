import type { ChannelType } from "@chatbotx.io/database/partials"

// Per-channel wording for a broadcast's pages, shared by the create form's
// page picker and the broadcast detail dialog so both name them the same way.
const inboxLabelKeys = {
  whatsapp: "fields.whatsappChannels.label",
  messenger: "fields.messengerChannels.label",
} as const satisfies Partial<Record<ChannelType, string>>

const FALLBACK_INBOX_LABEL_KEY = "fields.inbox.label"

export type BroadcastInboxLabelKey =
  | (typeof inboxLabelKeys)[keyof typeof inboxLabelKeys]
  | typeof FALLBACK_INBOX_LABEL_KEY

/** A channel without its own wording falls back to the generic inbox label. */
export function resolveBroadcastInboxLabelKey(
  channel: ChannelType,
): BroadcastInboxLabelKey {
  return channel in inboxLabelKeys
    ? inboxLabelKeys[channel as keyof typeof inboxLabelKeys]
    : FALLBACK_INBOX_LABEL_KEY
}

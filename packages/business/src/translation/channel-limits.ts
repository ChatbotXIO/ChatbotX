import type { ChannelType } from "@chatbotx.io/utils/channel"

/**
 * Conservative text length (UTF-16 code units) a channel accepts in one direct
 * message, taken from each platform's documentation and rounded down. There is
 * no repo-wide limit (`AI_HANDOVER_CHANNEL_POLICIES.messageMaxLength` is only
 * for AI hand-over). A `Record<ChannelType, number>` so adding a channel fails
 * the type check here (invariant 3).
 *
 * A translation can be longer than its source, so one over the limit is not
 * sent: the agent's original sentence goes out instead.
 */
export const TRANSLATION_CHANNEL_MAX_LENGTH: Record<ChannelType, number> = {
  omnichannel: 2000,
  webchat: 5000,
  messenger: 2000,
  whatsapp: 4096,
  zalo: 2000,
  smtp: 50_000,
  telegram: 4096,
  instagram: 1000,
  threads: 1000,
  tiktok: 1000,
  line: 5000,
  api: 4000,
}

/**
 * The longest translation any channel accepts: the cap of a translation sent
 * as is (`editedTranslation`). The channel's own limit is checked when the
 * message is sent (`tooLong`), so the request schema only bounds the size.
 */
export const TRANSLATION_MAX_LENGTH = Math.max(
  ...Object.values(TRANSLATION_CHANNEL_MAX_LENGTH),
)

/** The strictest limit, for a channel value this table does not know (it is plain text in the DB). */
const FALLBACK_MAX_LENGTH = Math.min(
  ...Object.values(TRANSLATION_CHANNEL_MAX_LENGTH),
)

export function isWithinChannelLimit(channel: string, text: string): boolean {
  const limit =
    channel in TRANSLATION_CHANNEL_MAX_LENGTH
      ? TRANSLATION_CHANNEL_MAX_LENGTH[channel as ChannelType]
      : FALLBACK_MAX_LENGTH
  return text.length <= limit
}

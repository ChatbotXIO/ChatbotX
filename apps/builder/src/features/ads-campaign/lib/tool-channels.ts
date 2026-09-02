import type { MessagingAdChannel } from "@chatbotx.io/database/partials"
import {
  adsEligibleChannelTypes,
  DEFAULT_ADS_CONVERSION_CHANNEL,
} from "@chatbotx.io/utils/channel"
import { notFound } from "next/navigation"

/**
 * Channels the Click to Message Ads tool supports, in the canonical display
 * order (WhatsApp, Messenger, Instagram) — re-exported from
 * `adsEligibleChannelTypes` (`@chatbotx.io/utils/channel`) rather than
 * redeclared, so the tool's tabs can never drift from the Ads dashboard's
 * channel set/order (`AnalyticsNav` renders the same order).
 */
export const MESSAGING_ADS_TOOL_CHANNELS = adsEligibleChannelTypes.options

/**
 * Validates the `[channel]` route segment against
 * `MESSAGING_ADS_TOOL_CHANNELS` — mirrors `parseChannelParam` in
 * `dashboard/ads/[channel]/page.tsx`: any other value (typo, stale
 * bookmark, crawler) 404s rather than silently falling back to a default
 * channel.
 */
export function parseMessagingAdsToolChannel(
  segment: string,
): MessagingAdChannel {
  const parsed = adsEligibleChannelTypes.safeParse(segment)
  if (!parsed.success) {
    notFound()
  }
  return parsed.data
}

/**
 * Resolves the channel a channel-less `/messaging-ads` visit should land on
 * — mirrors `resolveRedirectChannel` in `dashboard/ads/page.tsx`: honor a
 * valid `?channel=` (a stale bookmark or an external link), else fall back
 * to the canonical default channel.
 */
export function resolveMessagingAdsToolRedirectChannel(
  channel: string | string[] | undefined,
): MessagingAdChannel {
  const parsed = adsEligibleChannelTypes.safeParse(
    Array.isArray(channel) ? channel[0] : channel,
  )
  return parsed.success ? parsed.data : DEFAULT_ADS_CONVERSION_CHANNEL
}

/**
 * Short label per channel for the tool's `AppTab` row — `fields.*.label`
 * (e.g. "WhatsApp") rather than the longer `ads.dashboardNav.*` labels,
 * which overflow `AppTab` on mobile once the page title already says
 * "Click to Message Ads" (plan decision #9). A `Record` rather than an
 * if/else chain so a future channel addition fails to compile here instead
 * of silently rendering a blank tab label.
 */
export const MESSAGING_ADS_TOOL_CHANNEL_LABEL_KEY: Record<
  MessagingAdChannel,
  string
> = {
  whatsapp: "fields.whatsapp.label",
  messenger: "fields.messenger.label",
  instagram: "fields.instagram.label",
}

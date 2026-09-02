import {
  adsEligibleChannelTypes,
  DEFAULT_ADS_CONVERSION_CHANNEL,
} from "@chatbotx.io/utils/channel"
import { redirect } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { buildRedirectSearch } from "@/lib/build-redirect-search"

/**
 * Resolves the channel a channel-less `/dashboard/ads` visit should land on.
 * A stale bookmark from before the split can still carry the old channel
 * filter's `?channel=` param — honor it when it names an ads-eligible channel
 * so a Messenger/Instagram bookmark keeps showing that channel instead of
 * silently snapping to WhatsApp. Anything else (absent, the old `all`
 * aggregate sentinel, a typo) resolves to the canonical default.
 */
function resolveRedirectChannel(channel: string | string[] | undefined) {
  const parsed = adsEligibleChannelTypes.safeParse(
    Array.isArray(channel) ? channel[0] : channel,
  )
  return parsed.success ? parsed.data : DEFAULT_ADS_CONVERSION_CHANNEL
}

// The single "Ads" menu item was split into one entry per ads-eligible
// channel (`/dashboard/ads/whatsapp` | `/messenger` | `/instagram`) — see
// `AnalyticsNav`. This channel-less route only exists for old bookmarks and
// the CAPI-connect redirect (`?account=<id>`), which predate the split;
// forward the query string and land on the requested (or default) channel so
// a stale selection is preserved and a future default change never silently
// targets the wrong channel.
export default async function AdsAnalyticsRedirectPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { workspaceId } = await props.params
  const searchParams = await props.searchParams
  const channel = resolveRedirectChannel(searchParams.channel)
  const search = buildRedirectSearch(searchParams)
  redirect(`/space/${workspaceId}/dashboard/ads/${channel}${search}`)
}

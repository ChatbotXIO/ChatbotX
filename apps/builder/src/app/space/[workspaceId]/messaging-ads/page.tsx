import { redirect } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { resolveMessagingAdsToolRedirectChannel } from "@/features/ads-campaign/lib/tool-channels"
import { buildMessagingAdsToolPath } from "@/features/ads-campaign/lib/tool-path"
import { buildRedirectSearch } from "@/lib/build-redirect-search"

// This channel-less route exists for two reasons: it is the Tools card's
// stable link target (a card can't point at a specific channel), and it
// gives external links/bookmarks a deep link that never changes even if the
// default channel changes. Mirrors `dashboard/ads/page.tsx`: honor a valid
// `?channel=` (a stale bookmark or an external link), otherwise fall back to
// the canonical default channel, and forward the rest of the query string —
// `buildRedirectSearch` re-serializes every entry of `searchParams`
// including `channel` itself, so the destination `[channel]/page.tsx` sees a
// redundant `?channel=` alongside the now-canonical route segment; it's
// harmless there since that page only reads the `integration` param.
export default async function MessagingAdsToolRedirectPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { workspaceId } = await props.params
  const searchParams = await props.searchParams
  const channel = resolveMessagingAdsToolRedirectChannel(searchParams.channel)
  const search = buildRedirectSearch(searchParams)
  redirect(buildMessagingAdsToolPath({ workspaceId, channel }) + search)
}

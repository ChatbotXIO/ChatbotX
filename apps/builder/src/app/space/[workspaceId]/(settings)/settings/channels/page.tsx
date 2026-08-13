import type { ChannelType } from "@chatbotx.io/database/partials"
import { MANAGEABLE_CHANNELS } from "@chatbotx.io/database/partials"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound, redirect } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { resolveVisibleChannels } from "@/lib/workspace/resolve-visible-channels"

type SettingsChannelsPageProps = {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}

// Index route: every accordion row collapsed (rows render in the layout).
//
// `?channel=<x>` is the legacy deep-link shape OAuth return flows and older
// bookmarks use (`/settings/channels?channel=messenger`). Kept as a safety
// net: valid channels redirect to the real route `settings/channels/<x>`,
// preserving any remaining query params (`error=duplicated` drives the
// duplicated-connection toast via `useChannelDuplicatedError`).
export default async function SettingsChannelsIndexPage(
  props: SettingsChannelsPageProps,
) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const channelParam = searchParams.channel
  const channel = Array.isArray(channelParam) ? channelParam[0] : channelParam

  // Gate on the same visibility policy the destination page enforces —
  // redirecting a hidden channel would land on that page's notFound(). Falling
  // through renders the collapsed index instead (the pre-refactor behavior for
  // a hidden `?channel=`). Free: the layout resolves the same cached policy.
  const visibleChannels = await resolveVisibleChannels(workspaceId)

  if (
    channel &&
    MANAGEABLE_CHANNELS.includes(channel as ChannelType) &&
    visibleChannels?.includes(channel as ChannelType)
  ) {
    const rest = new URLSearchParams()
    for (const [key, value] of Object.entries(searchParams)) {
      if (key === "channel" || value === undefined) {
        continue
      }
      for (const v of Array.isArray(value) ? value : [value]) {
        rest.append(key, v)
      }
    }
    const qs = rest.size > 0 ? `?${rest.toString()}` : ""
    redirect(`/space/${workspaceId}/settings/channels/${channel}${qs}`)
  }

  return null
}

import type { SocialProvider } from "@chatbotx.io/database/partials"
import type { PublishDestinationState } from "@chatbotx.io/utils/publish-destination"
import type { z } from "zod"
import type {
  listPublishDestinationsResponse,
  publishDestinationResource,
} from "@/features/publish-destinations/schema"

export type PublishDestination = z.infer<typeof publishDestinationResource>

type PublishDestinationGroups = z.infer<typeof listPublishDestinationsResponse>

/** Networks that publish through a connected inbox (TikTok has its own login). */
export type InboxProvider = Exclude<SocialProvider, "tiktok">

/** A state a connected inbox can be shown in (disconnected inboxes are not listed). */
export type VisibleDestinationState = Exclude<
  PublishDestinationState,
  "inboxDisconnected"
>

export type InboxNetworkGroup = {
  destinations: VisibleDestination[]
  provider: InboxProvider
  truncated: boolean
}

export type VisibleDestination = PublishDestination & {
  state: VisibleDestinationState
}

const isInboxProvider = (provider: SocialProvider): provider is InboxProvider =>
  provider !== "tiktok"

const isVisible = (
  destination: PublishDestination,
): destination is VisibleDestination =>
  destination.state !== "inboxDisconnected"

/**
 * The networks the Connect tab lists: only those with a connected inbox, each
 * with only its connected inboxes. TikTok is not an inbox network.
 */
export const toInboxNetworkGroups = (
  groups: PublishDestinationGroups["items"],
): InboxNetworkGroup[] =>
  groups.flatMap((group) => {
    if (!isInboxProvider(group.provider)) {
      return []
    }
    const destinations = group.destinations.filter(isVisible)
    return destinations.length === 0
      ? []
      : [
          {
            destinations,
            provider: group.provider,
            truncated: group.truncated,
          },
        ]
  })

/** Brand names, not translated. */
export const PROVIDER_LABELS: Record<SocialProvider, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  tiktok: "TikTok",
}

/** Reconnect button text, by the state that needs one. */
export const RECONNECT_LABEL_KEYS = {
  needsReconnect: "posts.connect.reconnect",
  permissionMissing: "posts.connect.reconnectToAllow",
} as const satisfies Record<Exclude<VisibleDestinationState, "ready">, string>

/** Only a destination that cannot publish offers an action. */
export const needsReconnectAction = (
  state: VisibleDestinationState,
): state is Exclude<VisibleDestinationState, "ready"> => state !== "ready"

export const LOGIN_STATUS_TONES = {
  connected: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  disconnected: "bg-muted text-muted-foreground",
  needsReauth: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
} as const

/** The small tag under an Instagram name when the inbox came through a Facebook Page. */
export const showsViaFacebookTag = (
  destination: Pick<PublishDestination, "provider" | "viaFacebook">,
): boolean => destination.provider === "instagram" && destination.viaFacebook

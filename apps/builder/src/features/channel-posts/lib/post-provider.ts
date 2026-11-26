import type { SocialProvider } from "@chatbotx.io/database/partials"
import {
  isPostManagementChannel,
  type PostManagementChannel,
} from "@chatbotx.io/utils/channel"

/** The publishing network of each post channel (a Messenger inbox publishes to its Facebook Page). */
export const PROVIDER_BY_POST_CHANNEL: Record<
  PostManagementChannel,
  SocialProvider
> = {
  instagram: "instagram",
  messenger: "facebook",
  threads: "threads",
  tiktok: "tiktok",
}

/** The network of a post's channel, or `undefined` for a channel without a post list. */
export const providerOfPostChannel = (
  channel: string,
): SocialProvider | undefined =>
  isPostManagementChannel(channel)
    ? PROVIDER_BY_POST_CHANNEL[channel]
    : undefined

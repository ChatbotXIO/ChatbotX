import {
  isPostManagementChannel,
  POST_CHANNEL_CAPABILITIES,
  type PostChannelCapability,
} from "@chatbotx.io/utils/channel"

/** What a post's channel supports, or `undefined` for a channel without a post list. */
export const capabilityOfChannel = (
  channel: string,
): PostChannelCapability | undefined =>
  isPostManagementChannel(channel)
    ? POST_CHANNEL_CAPABILITIES[channel]
    : undefined

/**
 * Whether any of these channels reports live broadcasts (`liveStatus`).
 * Facebook does; the live filters, badges and the merge pre-selection show only
 * while a connected inbox's channel does.
 */
export const channelsReportLive = (channels: readonly string[]): boolean =>
  channels.some((channel) => capabilityOfChannel(channel)?.live === true)

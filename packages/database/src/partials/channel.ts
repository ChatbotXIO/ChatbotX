import { z } from "zod"

export const channelTypes = z.enum([
  "omnichannel",
  "webchat",
  "messenger",
  "whatsapp",
  "zalo",
  "smtp",
  "telegram",
  "instagram",
  "tiktok",
])
export type ChannelType = z.infer<typeof channelTypes>

// A contact's DM conversation is normally stored with a null `sourceId`
// (`sourceId` is reserved for comment threads, keyed by the post id). TikTok is
// the outlier: it has no separate DM concept and stores the channel's
// `conversation_id` directly in `Conversation.sourceId`, so its DM rows are
// non-null. Listing the outliers as data keeps the rule in one place and avoids
// a `Record<ChannelType, ...>` cascade. This set becomes empty once TikTok's
// write side is normalized to store the DM with a null `sourceId`.
const CHANNELS_WITH_SOURCE_ID_DM_CONVERSATION = new Set<ChannelType>(["tiktok"])

/**
 * Whether the channel's DM conversation is identified by a non-null `sourceId`
 * (TikTok) instead of the usual `sourceId IS NULL` DM convention. Unknown
 * channels fall back to the null-sourceId convention.
 */
export const dmConversationUsesSourceId = (
  channel: ChannelType | null | undefined,
): boolean =>
  channel != null && CHANNELS_WITH_SOURCE_ID_DM_CONVERSATION.has(channel)

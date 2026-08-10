import type { ChannelType } from "@chatbotx.io/utils/channel"

/**
 * `channelTypes` is defined in `@chatbotx.io/utils/channel` so packages that
 * cannot depend on the database layer (notably `@chatbotx.io/flow-config`, which
 * holds the per-channel step rules) can still key their tables by channel.
 *
 * Re-exported here because this has long been the import site for the rest of
 * the repo; both paths resolve to the same enum.
 */
export {
  CHANNEL_CAPABILITIES,
  type ChannelCapability,
  type ChannelType,
  CREATABLE_CHANNELS,
  channelTypes,
  MANAGEABLE_CHANNELS,
} from "@chatbotx.io/utils/channel"

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

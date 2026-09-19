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
  COEXIST_CHANNELS,
  type CoexistChannel,
  CREATABLE_CHANNELS,
  channelTypes,
  coexistChannels,
  isCoexistChannel,
  MANAGEABLE_CHANNELS,
} from "@chatbotx.io/utils/channel"

/**
 * A contact's DM conversation is stored with a null `sourceId` on every
 * channel; `sourceId` is reserved for comment threads, keyed by the post id.
 *
 * TikTok used to be the one exception — it stored the channel's
 * `conversation_id` directly in `Conversation.sourceId` — which left no room for
 * TikTok comment threads and made `findDMByContact` ambiguous once a contact had
 * both. The id now lives on `additionalAttributes.channelConversationId`, read
 * back through {@link resolveChannelConversationId}, so the convention is
 * uniform and no channel needs a special case.
 */
export const resolveChannelConversationId = (conversation: {
  sourceId: string | null
  additionalAttributes: { [x: string]: unknown } | null
}): string | null => {
  const stored = conversation.additionalAttributes?.channelConversationId
  if (typeof stored === "string" && stored) {
    return stored
  }
  // Pre-normalization rows still carry the id in `sourceId`. Kept so an
  // outbound DM keeps working between the code deploy and the backfill; drop
  // this fallback once the backfill has run everywhere.
  return conversation.sourceId
}

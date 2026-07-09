import {
  type BroadcastSubaction,
  broadcastSubactions,
  type ChannelType,
  type ContactFilterField,
  channelTypes,
  contactFilterFields,
  requiresRecentInteractionWindow,
} from "@chatbotx.io/database/partials"

const CHANNEL_SCOPED_EXCLUDED_FIELDS = [
  contactFilterFields.enum.currentChannel,
] satisfies ContactFilterField[]

const TEMPLATE_MESSAGE_EXCLUDED_FIELDS = [
  ...CHANNEL_SCOPED_EXCLUDED_FIELDS,
  contactFilterFields.enum.inbox,
] satisfies ContactFilterField[]

const RECENT_INTERACTION_WINDOW_EXCLUDED_FIELDS = [
  ...CHANNEL_SCOPED_EXCLUDED_FIELDS,
  contactFilterFields.enum.interactedInLast24h,
] satisfies ContactFilterField[]

const TEMPLATE_MESSAGE_SUBACTIONS = new Set<BroadcastSubaction>([
  broadcastSubactions.enum.whatsappTemplateMessage,
  broadcastSubactions.enum.messengerTemplateMessage,
])

const isTemplateMessageSubaction = (
  subaction: BroadcastSubaction | null | undefined,
): boolean => (subaction ? TEMPLATE_MESSAGE_SUBACTIONS.has(subaction) : false)

export const getBroadcastExcludedFilterFields = ({
  channel,
  subaction,
}: {
  channel?: ChannelType | null
  subaction?: BroadcastSubaction | null
} = {}): ContactFilterField[] => {
  if (!channel || channel === channelTypes.enum.omnichannel) {
    return []
  }

  if (isTemplateMessageSubaction(subaction)) {
    return [...TEMPLATE_MESSAGE_EXCLUDED_FIELDS]
  }

  if (requiresRecentInteractionWindow(subaction)) {
    return [...RECENT_INTERACTION_WINDOW_EXCLUDED_FIELDS]
  }

  return [...CHANNEL_SCOPED_EXCLUDED_FIELDS]
}

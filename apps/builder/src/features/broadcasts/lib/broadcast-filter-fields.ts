import {
  type BroadcastSubaction,
  broadcastSubactions,
  type ChannelType,
  type ContactFilterField,
  channelTypes,
  contactFilterFields,
  requiresRecentInteractionWindow,
} from "@chatbotx.io/database/partials"
import { EMAIL_PHONE_RESTRICTED_FILTER_FIELDS } from "@/features/contact-filter/lib/restricted-fields"

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
  canViewEmailAndPhone = true,
  subaction,
}: {
  channel?: ChannelType | null
  canViewEmailAndPhone?: boolean
  subaction?: BroadcastSubaction | null
} = {}): ContactFilterField[] => {
  const permissionExcludedFields = canViewEmailAndPhone
    ? []
    : [...EMAIL_PHONE_RESTRICTED_FILTER_FIELDS]

  if (!channel || channel === channelTypes.enum.omnichannel) {
    return permissionExcludedFields
  }

  if (isTemplateMessageSubaction(subaction)) {
    return [...TEMPLATE_MESSAGE_EXCLUDED_FIELDS, ...permissionExcludedFields]
  }

  if (requiresRecentInteractionWindow(subaction)) {
    return [
      ...RECENT_INTERACTION_WINDOW_EXCLUDED_FIELDS,
      ...permissionExcludedFields,
    ]
  }

  return [...CHANNEL_SCOPED_EXCLUDED_FIELDS, ...permissionExcludedFields]
}

import {
  type BroadcastSubaction,
  broadcastSubactions,
  type ChannelType,
  type ContactFilterField,
  channelTypes,
  contactFilterFields,
} from "@chatbotx.io/database/partials"

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

  const isTemplateMessage =
    subaction === broadcastSubactions.enum.whatsappTemplateMessage ||
    subaction === broadcastSubactions.enum.messengerTemplateMessage

  return isTemplateMessage
    ? [contactFilterFields.enum.currentChannel, contactFilterFields.enum.inbox]
    : [contactFilterFields.enum.currentChannel]
}

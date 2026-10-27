import { type MessageType, messageTypes } from "@chatbotx.io/database/partials"
import { incrementMessage } from "@chatbotx.io/observability"
import { type ChannelType, channelTypes } from "@chatbotx.io/utils/channel"
export const resolveMessageMetricChannel = (
  channel: string | undefined,
): ChannelType | undefined => {
  const parsedChannel = channelTypes.safeParse(channel)
  return parsedChannel.success ? parsedChannel.data : undefined
}

export const recordMessageMetric = (
  messageType: MessageType,
  channel: ChannelType | undefined,
): void => {
  if (!channel || messageType === messageTypes.enum.activity) {
    return
  }

  incrementMessage({
    channel,
    direction: messageType === messageTypes.enum.incoming ? "in" : "out",
  })
}

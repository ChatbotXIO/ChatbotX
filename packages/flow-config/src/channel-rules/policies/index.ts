import { channelTypes } from "@chatbotx.io/utils/channel"
import { apiFlowPolicy } from "./api"
import type { ChannelFlowPolicy, ChannelFlowPolicyMap } from "./define"
import { instagramFlowPolicy } from "./instagram"
import { messengerFlowPolicy } from "./messenger"
import { omnichannelFlowPolicy } from "./omnichannel"
import { smtpFlowPolicy } from "./smtp"
import { telegramFlowPolicy } from "./telegram"
import { threadsFlowPolicy } from "./threads"
import { tiktokFlowPolicy } from "./tiktok"
import { webchatFlowPolicy } from "./webchat"
import { whatsappFlowPolicy } from "./whatsapp"
import { zaloFlowPolicy } from "./zalo"

export const CHANNEL_FLOW_POLICIES: ChannelFlowPolicyMap = {
  [channelTypes.enum.api]: apiFlowPolicy,
  [channelTypes.enum.instagram]: instagramFlowPolicy,
  [channelTypes.enum.messenger]: messengerFlowPolicy,
  [channelTypes.enum.omnichannel]: omnichannelFlowPolicy,
  [channelTypes.enum.smtp]: smtpFlowPolicy,
  [channelTypes.enum.telegram]: telegramFlowPolicy,
  [channelTypes.enum.threads]: threadsFlowPolicy,
  [channelTypes.enum.tiktok]: tiktokFlowPolicy,
  [channelTypes.enum.webchat]: webchatFlowPolicy,
  [channelTypes.enum.whatsapp]: whatsappFlowPolicy,
  [channelTypes.enum.zalo]: zaloFlowPolicy,
}

export const getChannelFlowPolicy = (
  channel: string | null | undefined,
): ChannelFlowPolicy | undefined => {
  const parsed = channelTypes.safeParse(channel)
  return parsed.success ? CHANNEL_FLOW_POLICIES[parsed.data] : undefined
}

export {
  CHANNEL_POLICY_VERSION,
  type ChannelFlowPolicy,
  type StepSupport,
  stepSupport,
} from "./define"
export { TIKTOK_CARD_TITLE_MAX } from "./tiktok"

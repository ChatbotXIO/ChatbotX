import { type ChannelType, channelTypes } from "@chatbotx.io/utils/channel"
import type { z } from "zod"
import type { ButtonStepProps } from "../steps/button"
import { flowValidationCodes } from "../validation-codes"
import { countMessageCharacters } from "./characters"
import { CHANNEL_FLOW_POLICIES } from "./policies"

export const SEND_TEXT_MAX = Math.max(
  ...Object.values(CHANNEL_FLOW_POLICIES).map((policy) => policy.limits.text),
)

export type SendTextLengthLimits = {
  buttonLabel: number
  quickReplyLabel: number
  text: number
}

const resolveChannelKey = (channel: string | null | undefined): ChannelType => {
  const parsed = channelTypes.safeParse(channel)

  return parsed.success ? parsed.data : channelTypes.enum.omnichannel
}

export const resolveSendTextLengthLimits = (props: {
  channel: string | null | undefined
  hasButtons?: boolean
  hasQuickReplies?: boolean
}): SendTextLengthLimits => {
  const channel = resolveChannelKey(props.channel)
  const policy = CHANNEL_FLOW_POLICIES[channel]
  const isCardTitle =
    policy.limits.cardTitle !== undefined &&
    (props.hasButtons === true || props.hasQuickReplies === true)

  return {
    buttonLabel: policy.limits.buttonLabel,
    quickReplyLabel: policy.limits.buttonLabel,
    text: isCardTitle
      ? (policy.limits.cardTitle ?? policy.limits.text)
      : policy.limits.text,
  }
}

export const refineSendTextLengthForChannel =
  (channel: ChannelType) =>
  (
    step: { text: string; buttons: ButtonStepProps[] },
    ctx: z.RefinementCtx,
  ): void => {
    const length = countMessageCharacters(step.text)

    if (
      length > SEND_TEXT_MAX ||
      length <= CHANNEL_FLOW_POLICIES[channel].limits.text
    ) {
      return
    }

    ctx.addIssue({
      code: "custom",
      message: flowValidationCodes.sendTextTooLongForChannel,
      path: ["text"],
    })
  }

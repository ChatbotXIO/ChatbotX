import { type ChannelType, channelTypes } from "@chatbotx.io/utils/channel"
import type { ButtonStepProps } from "../steps/button"
import { stepTypes } from "../steps/step-action"
import {
  CHANNEL_FLOW_POLICIES,
  type StepSupport,
  stepSupport,
} from "./policies"

const MEDIA_STEP_TYPES = [
  stepTypes.enum.sendImage,
  stepTypes.enum.sendVideo,
  stepTypes.enum.sendAudio,
  stepTypes.enum.sendFile,
  stepTypes.enum.sendGif,
] as const

export type MediaStepType = (typeof MEDIA_STEP_TYPES)[number]

type MediaStepProps = {
  channel: string | null | undefined
  stepType: string
}

export const isMediaStepType = (stepType: string): stepType is MediaStepType =>
  (MEDIA_STEP_TYPES as readonly string[]).includes(stepType)

export const resolveMediaStepSupport = (props: MediaStepProps): StepSupport => {
  if (!isMediaStepType(props.stepType)) {
    return stepSupport.full
  }

  const channel = channelTypes.safeParse(props.channel)
  return channel.success
    ? CHANNEL_FLOW_POLICIES[channel.data].steps[props.stepType]
    : stepSupport.full
}

export const isMediaStepUnsupported = (props: MediaStepProps): boolean =>
  resolveMediaStepSupport(props) === stepSupport.unsupported

export const isMediaButtonsDropped = (
  props: MediaStepProps & { buttons: ButtonStepProps[] | null | undefined },
): boolean =>
  (props.buttons?.length ?? 0) > 0 &&
  resolveMediaStepSupport(props) === stepSupport.noButtons

export const channelsWithMediaStepLimits = (
  stepType: MediaStepType,
): ChannelType[] =>
  channelTypes.options.filter(
    (channel) =>
      CHANNEL_FLOW_POLICIES[channel].steps[stepType] !== stepSupport.full,
  )

import { type ChannelType, channelTypes } from "@chatbotx.io/utils/channel"
import type { RefinementCtx, ZodType, ZodTypeAny } from "zod"
import type { ButtonStepProps } from "../steps/button"
import { sendAudioStepSchema } from "../steps/send-audio"
import { sendFileStepSchema } from "../steps/send-file"
import { sendGifStepSchema } from "../steps/send-gif"
import { sendImageStepSchema } from "../steps/send-image"
import { sendVideoStepSchema } from "../steps/send-video"
import { stepTypes } from "../steps/step-action"
import { flowValidationCodes } from "../validation-codes"
import type { ChannelValidatorMap } from "./channel-validator"
import { refineMediaCaptionForChannel } from "./media-caption-rules"
import {
  channelsWithMediaStepLimits,
  isMediaButtonsDropped,
  type MediaStepType,
} from "./media-step-rules"

const readButtons = (step: unknown): ButtonStepProps[] => {
  if (typeof step !== "object" || step === null || !("buttons" in step)) {
    return []
  }

  const { buttons } = step as { buttons?: unknown }
  return Array.isArray(buttons) ? (buttons as ButtonStepProps[]) : []
}

const refineMediaButtonsForChannel =
  (channel: ChannelType, stepType: MediaStepType) =>
  (step: unknown, ctx: RefinementCtx): void => {
    if (
      !isMediaButtonsDropped({
        channel,
        stepType,
        buttons: readButtons(step),
      })
    ) {
      return
    }

    ctx.addIssue({
      code: "custom",
      message: flowValidationCodes.mediaButtonsUnsupported,
      path: ["buttons"],
    })
  }

const buildMediaStepValidator = (
  schema: ZodTypeAny,
  stepType: MediaStepType,
): ChannelValidatorMap =>
  Object.assign(
    { [channelTypes.enum.omnichannel]: schema },
    ...channelsWithMediaStepLimits(stepType).map((channel) => ({
      [channel]: schema.superRefine(
        refineMediaButtonsForChannel(channel, stepType),
      ),
    })),
  )

/**
 * A step with a `caption` is refined on every channel, `omnichannel` included:
 * whether a caption may be sent at all is per channel.
 */
const buildCaptionedMediaStepValidator = (
  schema: ZodType<{ caption?: string }>,
  stepType: MediaStepType,
): ChannelValidatorMap =>
  Object.fromEntries(
    channelTypes.options.map((channel) => [
      channel,
      schema
        .superRefine(refineMediaButtonsForChannel(channel, stepType))
        .superRefine(refineMediaCaptionForChannel(channel)),
    ]),
  ) as ChannelValidatorMap

export const sendImageValidator = buildCaptionedMediaStepValidator(
  sendImageStepSchema,
  stepTypes.enum.sendImage,
)

export const sendVideoValidator = buildCaptionedMediaStepValidator(
  sendVideoStepSchema,
  stepTypes.enum.sendVideo,
)

export const sendAudioValidator = buildMediaStepValidator(
  sendAudioStepSchema,
  stepTypes.enum.sendAudio,
)

export const sendFileValidator = buildMediaStepValidator(
  sendFileStepSchema,
  stepTypes.enum.sendFile,
)

export const sendGifValidator = buildMediaStepValidator(
  sendGifStepSchema,
  stepTypes.enum.sendGif,
)

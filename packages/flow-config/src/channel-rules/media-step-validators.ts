import { type ChannelType, channelTypes } from "@chatbotx.io/utils/channel"
import type { RefinementCtx, ZodTypeAny } from "zod"
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
import { refineMediaNoteForChannel } from "./media-note-rules"
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

/** The optional fields the per-channel media refinements read. */
type MediaStepFields = { asNote?: boolean; caption?: string }

type MediaStepRefinement = (
  channel: ChannelType,
) => (step: MediaStepFields, ctx: RefinementCtx) => void

/**
 * Without `refinements`, only the channels that drop or refuse the step get an
 * override. A refinement (caption, note) depends on fields every channel may
 * see, so with one the step is refined on every channel, `omnichannel`
 * included.
 */
const buildMediaStepValidator = (
  schema: ZodTypeAny,
  stepType: MediaStepType,
  refinements: readonly MediaStepRefinement[] = [],
): ChannelValidatorMap => {
  if (refinements.length === 0) {
    return Object.assign(
      { [channelTypes.enum.omnichannel]: schema },
      ...channelsWithMediaStepLimits(stepType).map((channel) => ({
        [channel]: schema.superRefine(
          refineMediaButtonsForChannel(channel, stepType),
        ),
      })),
    )
  }

  return Object.fromEntries(
    channelTypes.options.map((channel) => [
      channel,
      refinements.reduce(
        (refined, refine) =>
          refined.superRefine((step, ctx) =>
            refine(channel)(step as MediaStepFields, ctx),
          ),
        schema.superRefine(refineMediaButtonsForChannel(channel, stepType)),
      ),
    ]),
  ) as ChannelValidatorMap
}

export const sendImageValidator = buildMediaStepValidator(
  sendImageStepSchema,
  stepTypes.enum.sendImage,
  [refineMediaCaptionForChannel],
)

export const sendVideoValidator = buildMediaStepValidator(
  sendVideoStepSchema,
  stepTypes.enum.sendVideo,
  [
    refineMediaCaptionForChannel,
    (channel) => refineMediaNoteForChannel(channel, stepTypes.enum.sendVideo),
  ],
)

export const sendAudioValidator = buildMediaStepValidator(
  sendAudioStepSchema,
  stepTypes.enum.sendAudio,
  [(channel) => refineMediaNoteForChannel(channel, stepTypes.enum.sendAudio)],
)

export const sendFileValidator = buildMediaStepValidator(
  sendFileStepSchema,
  stepTypes.enum.sendFile,
)

export const sendGifValidator = buildMediaStepValidator(
  sendGifStepSchema,
  stepTypes.enum.sendGif,
)

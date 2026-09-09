import { channelTypes } from "@chatbotx.io/utils/channel"
import type { ZodTypeAny } from "zod"
import { sendAudioStepSchema } from "../steps/send-audio"
import { sendFileStepSchema } from "../steps/send-file"
import { sendGifStepSchema } from "../steps/send-gif"
import { sendImageStepSchema } from "../steps/send-image"
import { sendVideoStepSchema } from "../steps/send-video"
import { stepTypes } from "../steps/step-action"
import type { ChannelValidatorMap } from "./channel-validator"
import {
  channelsWithMediaStepLimits,
  type MediaStepType,
  refineMediaStepForChannel,
} from "./media-step-rules"

/**
 * One `ChannelValidatorMap` per media step, derived from the support table in
 * `media-step-rules.ts` rather than hand-listed: the channels the editor warns
 * about and the channels publish refuses then cannot drift apart, and a new
 * entry in that table is picked up here for free.
 *
 * `omnichannel` stays the unrefined base — a node left on it (the default) is
 * never blocked, only the ones that name a channel which drops the buttons or
 * sends nothing.
 *
 * Kept apart from the step's editor/viewer modules — this is imported directly
 * by `validators.ts`, which is reached from both the builder's publish schema
 * and the worker's import validation, so it must stay React-free.
 */
const buildMediaStepValidator = (
  schema: ZodTypeAny,
  stepType: MediaStepType,
): ChannelValidatorMap =>
  Object.assign(
    { [channelTypes.enum.omnichannel]: schema },
    ...channelsWithMediaStepLimits(stepType).map((channel) => ({
      [channel]: schema.superRefine(
        refineMediaStepForChannel(channel, stepType),
      ),
    })),
  )

export const sendImageValidator = buildMediaStepValidator(
  sendImageStepSchema,
  stepTypes.enum.sendImage,
)

export const sendVideoValidator = buildMediaStepValidator(
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

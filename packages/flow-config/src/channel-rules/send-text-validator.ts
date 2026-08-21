import { channelTypes } from "@chatbotx.io/utils/channel"
import { sendTextStepSchema } from "../steps/send-text"
import type { ChannelValidatorMap } from "./channel-validator"
import { refineTiktokSendTextStep } from "./tiktok-text-rules"

/**
 * Kept apart from the step's editor/viewer modules — this is imported directly
 * by `validators.ts`, which is reached from both the builder's publish schema
 * and the worker's import validation, so it must stay React-free.
 */
export const sendTextValidator = {
  [channelTypes.enum.omnichannel]: sendTextStepSchema,
  [channelTypes.enum.tiktok]: sendTextStepSchema.superRefine(
    refineTiktokSendTextStep,
  ),
} satisfies ChannelValidatorMap

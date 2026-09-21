import { channelTypes } from "@chatbotx.io/utils/channel"
import { sendTextStepSchema } from "../steps/send-text"
import type { ChannelValidatorMap } from "./channel-validator"
import { refineSendTextLengthForChannel } from "./send-text-length-rules"
import { refineTiktokSendTextStep } from "./tiktok-text-rules"

/**
 * Kept apart from the step's editor/viewer modules — this is imported directly
 * by `validators.ts`, which is reached from both the builder's publish schema
 * and the worker's import validation, so it must stay React-free.
 *
 * Every channel is listed because `sendTextStepSchema` alone only caps at the
 * widest limit across channels; the message length an author may actually send
 * is per channel, so each key adds its own length refinement. An override
 * replaces the base entirely (see `ChannelValidatorMap`), which is why TikTok
 * composes both of its rules here.
 */
export const sendTextValidator = {
  [channelTypes.enum.omnichannel]: sendTextStepSchema.superRefine(
    refineSendTextLengthForChannel(channelTypes.enum.omnichannel),
  ),
  [channelTypes.enum.api]: sendTextStepSchema.superRefine(
    refineSendTextLengthForChannel(channelTypes.enum.api),
  ),
  [channelTypes.enum.instagram]: sendTextStepSchema.superRefine(
    refineSendTextLengthForChannel(channelTypes.enum.instagram),
  ),
  [channelTypes.enum.messenger]: sendTextStepSchema.superRefine(
    refineSendTextLengthForChannel(channelTypes.enum.messenger),
  ),
  [channelTypes.enum.smtp]: sendTextStepSchema.superRefine(
    refineSendTextLengthForChannel(channelTypes.enum.smtp),
  ),
  [channelTypes.enum.telegram]: sendTextStepSchema.superRefine(
    refineSendTextLengthForChannel(channelTypes.enum.telegram),
  ),
  [channelTypes.enum.threads]: sendTextStepSchema.superRefine(
    refineSendTextLengthForChannel(channelTypes.enum.threads),
  ),
  [channelTypes.enum.tiktok]: sendTextStepSchema
    .superRefine(refineTiktokSendTextStep)
    .superRefine(refineSendTextLengthForChannel(channelTypes.enum.tiktok)),
  [channelTypes.enum.webchat]: sendTextStepSchema.superRefine(
    refineSendTextLengthForChannel(channelTypes.enum.webchat),
  ),
  [channelTypes.enum.whatsapp]: sendTextStepSchema.superRefine(
    refineSendTextLengthForChannel(channelTypes.enum.whatsapp),
  ),
  [channelTypes.enum.zalo]: sendTextStepSchema.superRefine(
    refineSendTextLengthForChannel(channelTypes.enum.zalo),
  ),
} satisfies ChannelValidatorMap
